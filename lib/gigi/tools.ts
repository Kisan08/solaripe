// Gigi's tools: JSON-schema definitions (sent to Groq) + the executor that
// actually performs each action once Groq decides to call one.
//
// Every executor takes the SAME session-aware Supabase client
// (createServerSupabaseClient()) already used by the CRM/projects/calling
// routes — RLS (auth.uid() = tenant_id) plus the DB's own tenant_id
// trigger do the tenant-scoping automatically, exactly like every other
// authenticated route in this app. No service-role key here; Gigi acts
// AS the logged-in user, with the same permissions and no more.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GigiTool } from "./groq";
import { cleanPhone } from "@/lib/phone";
import { findDuplicatePhone, TABLE_LABELS } from "@/lib/duplicateCheck";
import { LEAD_STAGES } from "@/lib/types";
import { sendWhatsAppTo } from "@/lib/whatsappNotify";

export const GIGI_TOOLS: GigiTool[] = [
  {
    type: "function",
    function: {
      name: "add_lead",
      description:
        "Add a new sales lead to the leads pipeline (New Lead stage). Use this when the user asks to add, save, or create a new lead — distinct from initiate_call/generate_quote, which act on already-existing CRM calling clients.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "The lead's full name." },
          phone: {
            type: "string",
            description: "10-digit Indian mobile number, with or without +91/spaces/dashes.",
          },
          email: { type: "string", description: "The lead's email address, if mentioned." },
          address: { type: "string", description: "The lead's address or site location, if mentioned." },
          system_size: { type: "number", description: "Desired system size in kW, if mentioned." },
          budget: { type: "number", description: "The lead's budget in rupees, if mentioned." },
          follow_up_date: {
            type: "string",
            description: "Follow-up date in YYYY-MM-DD format, if mentioned.",
          },
          notes: { type: "string", description: "Any other context about the lead, if mentioned." },
          confirmDuplicate: {
            type: "boolean",
            description:
              "Only set true if you already warned the user this phone number exists elsewhere (as a client or project) and they explicitly confirmed adding it anyway.",
          },
        },
        required: ["name", "phone"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_project",
      description:
        "Create a new solar EPC project for a client. Use this when the user asks to start, create, or open a new project — distinct from add_lead, which is for a sales lead that hasn't become a project yet.",
      parameters: {
        type: "object",
        properties: {
          client_name: { type: "string", description: "The project's client/owner name." },
          phone: { type: "string", description: "Client's phone number, if mentioned." },
          address: { type: "string", description: "Site address, if mentioned." },
          system_size: { type: "number", description: "System size in kW, if mentioned." },
          project_type: {
            type: "string",
            enum: ["EPC", "OPEX", "AMC", "PPA"],
            description: "Defaults to EPC if not specified.",
          },
          total_value: { type: "number", description: "Total project value in rupees, if mentioned." },
          notes: { type: "string", description: "Any other context about the project, if mentioned." },
          confirmDuplicate: {
            type: "boolean",
            description:
              "Only set true if you already warned the user this phone number exists elsewhere (as a lead or client) and they explicitly confirmed creating the project anyway.",
          },
        },
        required: ["client_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_calling_client",
      description:
        "Add a new contact to the AI Calling dial list so they can be called by the AI calling system. Use this when the user asks to add someone to the calling list, add a client for calling, or says something like 'add X to call' — distinct from add_lead, which is for the sales pipeline, not the calling list.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "The contact's full name." },
          phone: {
            type: "string",
            description: "10-digit Indian mobile number, with or without +91/spaces/dashes.",
          },
          city: { type: "string", description: "The contact's city, if mentioned." },
          electricity_bill: { type: "string", description: "Their approximate monthly electricity bill, if mentioned." },
          property_type: { type: "string", description: "Residential/Commercial/Industrial, if mentioned." },
          lead_source: { type: "string", description: "Where this contact came from, if mentioned." },
          notes: { type: "string", description: "Any other context about the contact, if mentioned." },
          confirmDuplicate: {
            type: "boolean",
            description:
              "Only set true if you already warned the user this phone number exists elsewhere (as a lead or project) and they explicitly confirmed adding it anyway.",
          },
        },
        required: ["name", "phone"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_lead_stage",
      description:
        "Move an existing sales lead to a different pipeline stage (the /leads Kanban board). Use this when the user says something like 'move X to Site Visit' or 'mark X as Won' — distinct from update_client_status (AI Calling list) and update_subsidy_stage (DISCOM/subsidy pipeline on a project).",
      parameters: {
        type: "object",
        properties: {
          identifier: { type: "string", description: "The lead's name or phone number." },
          new_stage: {
            type: "string",
            enum: [...LEAD_STAGES],
            description: "The pipeline stage to move the lead to.",
          },
        },
        required: ["identifier", "new_stage"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_client_status",
      description:
        "Change an existing AI Calling contact's call-outcome status (the /crm page). Use this when the user says something like 'mark X as interested' or 'set X to call back' — distinct from update_lead_stage, which is for the separate sales pipeline, not the calling list.",
      parameters: {
        type: "object",
        properties: {
          identifier: { type: "string", description: "The contact's name or phone number." },
          new_status: {
            type: "string",
            enum: ["pending", "calling", "interested", "not_interested", "call_back", "no_answer", "failed"],
            description: "The call-outcome status to set.",
          },
          response: { type: "string", description: "An optional free-text note about their response, if mentioned." },
        },
        required: ["identifier", "new_status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_project_payment",
      description:
        "Mark a project's payment tranche (1 through 4) as paid. Use this when the user says something like 'mark tranche 2 as paid for X' or 'X paid the advance'.",
      parameters: {
        type: "object",
        properties: {
          identifier: { type: "string", description: "The project's client name or phone number." },
          tranche: {
            type: "number",
            enum: [1, 2, 3, 4],
            description: "Which tranche was paid: 1 (Advance), 2 (Material), 3 (Install), or 4 (Handover).",
          },
        },
        required: ["identifier", "tranche"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_whatsapp_followup",
      description:
        "Send a WhatsApp follow-up message to an existing lead or AI Calling contact. Use this when the user asks to follow up with, message, or WhatsApp someone by name or phone.",
      parameters: {
        type: "object",
        properties: {
          identifier: { type: "string", description: "The contact's name or phone number." },
          message: {
            type: "string",
            description: "The message to send, if the user specified one. If not, a sensible generic follow-up message is used.",
          },
        },
        required: ["identifier"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pipeline_summary",
      description:
        "Get a read-only summary of the sales pipeline: lead counts by stage, total pipeline value, and active project count. Use this when the user asks something like 'how's the pipeline looking' or 'give me a summary of this month'.",
      parameters: {
        type: "object",
        properties: {
          time_range: {
            type: "string",
            description: "A loose time range like 'this week' or 'this month', if mentioned. Omit for all-time.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_subsidy_stage",
      description:
        "Move a project's DISCOM/subsidy approval pipeline to a different stage (the same tenant-configurable pipeline shown on the project card, e.g. 'DISCOM Feasibility Approval', 'Net Meter Installed', 'Subsidy Disbursed' — exact stage names vary per tenant, check Settings → Pipeline Stages). Use this when the user mentions DISCOM, subsidy, net metering, or a specific pipeline stage name for a project.",
      parameters: {
        type: "object",
        properties: {
          identifier: { type: "string", description: "The project's client name or phone number." },
          new_stage: { type: "string", description: "The name (or close match) of the pipeline stage to move to." },
        },
        required: ["identifier", "new_stage"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_quote",
      description:
        "Generate a pre-filled quote link for an existing CRM client. Use this when the user asks to generate, create, or send a quote for someone who's already a lead/client.",
      parameters: {
        type: "object",
        properties: {
          clientId: {
            type: "string",
            description: "The id of the existing CRM client to generate a quote for.",
          },
        },
        required: ["clientId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "initiate_call",
      description:
        "Place an AI-assisted outbound call to an existing CRM client. Use this when the user asks to call, ring, or phone someone who's already a lead/client.",
      parameters: {
        type: "object",
        properties: {
          clientId: {
            type: "string",
            description: "The id of the existing CRM client to call.",
          },
        },
        required: ["clientId"],
      },
    },
  },
];

// Mirrors the same required-field list as each tool's JSON schema above —
// kept as a plain object here (not derived from GIGI_TOOLS) so the
// validation in app/api/gigi/route.ts reads as a simple, obviously-correct
// lookup rather than reaching into the schema shape at runtime.
export const REQUIRED_FIELDS: Record<string, string[]> = {
  add_lead: ["name", "phone"],
  add_calling_client: ["name", "phone"],
  create_project: ["client_name"],
  generate_quote: ["clientId"],
  initiate_call: ["clientId"],
  update_lead_stage: ["identifier", "new_stage"],
  update_client_status: ["identifier", "new_status"],
  update_project_payment: ["identifier", "tranche"],
  send_whatsapp_followup: ["identifier"],
  get_pipeline_summary: [],
  update_subsidy_stage: ["identifier", "new_stage"],
};

export interface ToolResult {
  ok: boolean;
  summary: string; // handed back to Groq as the tool's result content
  data?: unknown;
}

// Builds the "heads up, this number already exists elsewhere" sentence
// Gigi should hand back instead of inserting, shared by add_lead/create_project.
function duplicateWarning(action: string, phone: string, match: { table: string; name: string }): string {
  const label = TABLE_LABELS[match.table as keyof typeof TABLE_LABELS];
  return `Heads up — ${phone} is already registered as a ${label} under the name ${match.name}. I did NOT ${action} yet. Want me to go ahead and add it anyway?`;
}

interface MatchRow {
  id: string;
  name: string;
  phone: string | null;
}

// Shared name-or-phone lookup for the update/action tools below. If
// `identifier` normalizes to a valid phone number it's matched exactly;
// otherwise it's a fuzzy name search. Callers MUST handle 0 matches (say
// so) and >1 matches (ask which one) rather than guessing — never .single().
async function findMatches(
  supabase: SupabaseClient,
  table: "leads" | "clients" | "projects",
  identifier: string,
): Promise<MatchRow[]> {
  const nameColumn = table === "projects" ? "client_name" : "name";
  const phone = cleanPhone(identifier);

  const query = supabase.from(table).select(`id, ${nameColumn}, phone`);
  const { data } = phone
    ? await query.eq("phone", phone)
    : await query.ilike(nameColumn, `%${identifier.trim()}%`);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    name: row[nameColumn],
    phone: row.phone ?? null,
  }));
}

function formatMatchLabel(m: { name: string; phone: string | null }, extra?: string): string {
  return `${m.name}${m.phone ? ` (${m.phone})` : ""}${extra ? ` — ${extra}` : ""}`;
}

function notFoundResult(what: string, identifier: string): ToolResult {
  return { ok: false, summary: `I couldn't find a ${what} matching "${identifier}".` };
}

function ambiguousResult(what: string, identifier: string, labels: string[]): ToolResult {
  return {
    ok: false,
    summary: `I found ${labels.length} ${what} matching "${identifier}": ${labels.join(", ")}. Which one did you mean?`,
  };
}

async function execAddLead(
  supabase: SupabaseClient,
  args: {
    name?: string; phone?: string; email?: string; address?: string;
    system_size?: number; budget?: number; follow_up_date?: string; notes?: string;
    confirmDuplicate?: boolean;
  },
): Promise<ToolResult> {
  const name = args.name?.trim().slice(0, 100);
  const phone = cleanPhone(args.phone ?? "");
  if (!name || !phone) {
    return { ok: false, summary: "Missing or invalid name/phone — could not add the lead." };
  }

  if (!args.confirmDuplicate) {
    const [match] = await findDuplicatePhone(supabase, phone, "leads");
    if (match) {
      return { ok: false, summary: duplicateWarning("add this lead", phone, match) };
    }
  }

  // Inserts into `leads` (the sales pipeline the /leads page reads), NOT
  // `clients` (the separate AI-calling dial list initiate_call targets) —
  // the two are distinct tables with distinct schemas.
  const { data, error } = await supabase
    .from("leads")
    .insert({
      name, phone,
      email: args.email?.trim() || null,
      address: args.address?.trim() || null,
      system_size: typeof args.system_size === "number" ? args.system_size : null,
      budget: typeof args.budget === "number" ? args.budget : null,
      source: "Gigi",
      stage: "New Lead",
      notes: args.notes?.trim() || null,
      follow_up_date: args.follow_up_date?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    return { ok: false, summary: `Failed to add lead: ${error.message}` };
  }
  return { ok: true, summary: `Added ${name} as a new lead.`, data };
}

async function execAddCallingClient(
  supabase: SupabaseClient,
  args: {
    name?: string; phone?: string; city?: string; electricity_bill?: string;
    property_type?: string; lead_source?: string; notes?: string; confirmDuplicate?: boolean;
  },
): Promise<ToolResult> {
  const name = args.name?.trim().slice(0, 100);
  const phone = cleanPhone(args.phone ?? "");
  if (!name || !phone) {
    return { ok: false, summary: "Missing or invalid name/phone — could not add the calling client." };
  }

  if (!args.confirmDuplicate) {
    const [match] = await findDuplicatePhone(supabase, phone, "clients");
    if (match) {
      return { ok: false, summary: duplicateWarning("add this calling client", phone, match) };
    }
  }

  // Inserts into `clients` (the AI Calling dial list initiate_call
  // targets), NOT `leads` (the sales pipeline add_lead targets).
  const { data, error } = await supabase
    .from("clients")
    .insert({
      name, phone, status: "pending",
      city: args.city?.trim() || null,
      electricity_bill: args.electricity_bill?.trim() || null,
      property_type: args.property_type?.trim() || null,
      lead_source: args.lead_source?.trim() || null,
      notes: args.notes?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    const message = error.code === "23505" ? "A calling client with this phone number already exists" : error.message;
    return { ok: false, summary: `Failed to add calling client: ${message}` };
  }
  return { ok: true, summary: `Added ${name} to the AI Calling list.`, data };
}

async function execCreateProject(
  supabase: SupabaseClient,
  args: {
    client_name?: string; phone?: string; address?: string; system_size?: number;
    project_type?: string; total_value?: number; notes?: string; confirmDuplicate?: boolean;
  },
): Promise<ToolResult> {
  const client_name = args.client_name?.trim().slice(0, 200);
  if (!client_name) {
    return { ok: false, summary: "Missing client name — could not create the project." };
  }

  const phone = cleanPhone(args.phone ?? "");
  if (phone && !args.confirmDuplicate) {
    const [match] = await findDuplicatePhone(supabase, phone, "projects");
    if (match) {
      return { ok: false, summary: duplicateWarning("create this project", phone, match) };
    }
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      client_name,
      phone: args.phone?.trim() || null,
      address: args.address?.trim() || null,
      system_size: typeof args.system_size === "number" ? args.system_size : null,
      project_type: args.project_type ?? "EPC",
      status: "In Progress",
      total_value: typeof args.total_value === "number" ? args.total_value : null,
      notes: args.notes?.trim() || null,
      t1_paid: false, t2_paid: false, t3_paid: false, t4_paid: false,
    })
    .select()
    .single();

  if (error) {
    return { ok: false, summary: `Failed to create project: ${error.message}` };
  }
  return { ok: true, summary: `Created a new project for ${client_name}.`, data };
}

async function execUpdateLeadStage(
  supabase: SupabaseClient,
  args: { identifier?: string; new_stage?: string },
): Promise<ToolResult> {
  const identifier = args.identifier?.trim();
  const newStage = args.new_stage?.trim();
  if (!identifier || !newStage) {
    return { ok: false, summary: "Missing identifier or new stage — could not update the lead." };
  }
  if (!(LEAD_STAGES as readonly string[]).includes(newStage)) {
    return { ok: false, summary: `"${newStage}" isn't a valid stage. Valid stages: ${LEAD_STAGES.join(", ")}.` };
  }

  const matches = await findMatches(supabase, "leads", identifier);
  if (matches.length === 0) return notFoundResult("lead", identifier);
  if (matches.length > 1) return ambiguousResult("leads", identifier, matches.map((m) => formatMatchLabel(m)));

  const lead = matches[0];
  const { error } = await supabase.from("leads").update({ stage: newStage }).eq("id", lead.id);
  if (error) return { ok: false, summary: `Failed to update ${lead.name}'s stage: ${error.message}` };
  return { ok: true, summary: `Moved ${lead.name} to ${newStage}.` };
}

async function execUpdateClientStatus(
  supabase: SupabaseClient,
  args: { identifier?: string; new_status?: string; response?: string },
): Promise<ToolResult> {
  const identifier = args.identifier?.trim();
  const newStatus = args.new_status?.trim();
  const validStatuses = ["pending", "calling", "interested", "not_interested", "call_back", "no_answer", "failed"];
  if (!identifier || !newStatus) {
    return { ok: false, summary: "Missing identifier or new status — could not update the calling client." };
  }
  if (!validStatuses.includes(newStatus)) {
    return { ok: false, summary: `"${newStatus}" isn't a valid status. Valid statuses: ${validStatuses.join(", ")}.` };
  }

  const matches = await findMatches(supabase, "clients", identifier);
  if (matches.length === 0) return notFoundResult("AI Calling client", identifier);
  if (matches.length > 1) return ambiguousResult("AI Calling clients", identifier, matches.map((m) => formatMatchLabel(m)));

  const client = matches[0];
  const payload: Record<string, unknown> = { status: newStatus };
  if (args.response?.trim()) payload.response = args.response.trim();

  const { error } = await supabase.from("clients").update(payload).eq("id", client.id);
  if (error) return { ok: false, summary: `Failed to update ${client.name}'s status: ${error.message}` };
  return { ok: true, summary: `Set ${client.name}'s status to ${newStatus}.` };
}

async function execUpdateProjectPayment(
  supabase: SupabaseClient,
  args: { identifier?: string; tranche?: number },
): Promise<ToolResult> {
  const identifier = args.identifier?.trim();
  const tranche = args.tranche;
  if (!identifier || ![1, 2, 3, 4].includes(Number(tranche))) {
    return { ok: false, summary: "Missing identifier or a valid tranche number (1-4) — could not update payment." };
  }

  const matches = await findMatches(supabase, "projects", identifier);
  if (matches.length === 0) return notFoundResult("project", identifier);
  if (matches.length > 1) return ambiguousResult("projects", identifier, matches.map((m) => formatMatchLabel(m)));

  const project = matches[0];
  // Only t1_paid..t4_paid booleans exist on `projects` — no per-tranche
  // date/amount column to also set (confirmed against lib/types.ts's
  // Project interface and every migration touching this table).
  const field = `t${tranche}_paid`;
  const { error } = await supabase.from("projects").update({ [field]: true }).eq("id", project.id);
  if (error) return { ok: false, summary: `Failed to update ${project.name}'s payment: ${error.message}` };
  // Same milestone names shown in components/projects/project-card.tsx —
  // reads more naturally than a bare "tranche N" when spoken aloud.
  const TRANCHE_LABELS: Record<number, string> = { 1: "Advance", 2: "Material", 3: "Install", 4: "Handover" };
  return { ok: true, summary: `Marked the ${TRANCHE_LABELS[tranche as number]} payment (T${tranche}) as paid for ${project.name}.` };
}

async function execSendWhatsappFollowup(
  supabase: SupabaseClient,
  args: { identifier?: string; message?: string },
): Promise<ToolResult> {
  const identifier = args.identifier?.trim();
  if (!identifier) {
    return { ok: false, summary: "Missing identifier — who should I message?" };
  }

  // A person could be a lead, an AI Calling client, or both — search both
  // tables and let an ambiguous result (including a same-person duplicate
  // across tables) surface as a disambiguation question rather than
  // guessing which record's phone number to use.
  const [leadMatches, clientMatches] = await Promise.all([
    findMatches(supabase, "leads", identifier),
    findMatches(supabase, "clients", identifier),
  ]);
  const combined = [
    ...leadMatches.map((m) => ({ ...m, source: "lead" as const })),
    ...clientMatches.map((m) => ({ ...m, source: "client" as const })),
  ];

  if (combined.length === 0) return notFoundResult("lead or AI Calling client", identifier);
  if (combined.length > 1) {
    return ambiguousResult(
      "contacts",
      identifier,
      combined.map((m) => formatMatchLabel(m, m.source === "lead" ? "lead" : "AI Calling client")),
    );
  }

  const contact = combined[0];
  if (!contact.phone) {
    return { ok: false, summary: `${contact.name} doesn't have a phone number on file — could not send a message.` };
  }

  const message = args.message?.trim() ||
    `Hi ${contact.name}, just following up on your solar enquiry — let us know if you have any questions!`;

  // Reuses lib/whatsappNotify.ts's sendWhatsAppTo directly rather than
  // reimplementing WhatsApp sending — same function the pipeline-staleness
  // cron uses to message a tenant's own owner_phone.
  const result = await sendWhatsAppTo(contact.phone, message);
  if (!result.ok) {
    return { ok: false, summary: `Failed to send WhatsApp to ${contact.name}: ${result.error ?? "unknown error"}` };
  }
  return { ok: true, summary: `Sent a WhatsApp follow-up to ${contact.name}.` };
}

function parseTimeRange(raw?: string): string | null {
  const text = raw?.toLowerCase() ?? "";
  const now = new Date();
  if (text.includes("week")) {
    const d = new Date(now);
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (text.includes("month")) {
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  }
  return null;
}

async function execGetPipelineSummary(
  supabase: SupabaseClient,
  args: { time_range?: string },
): Promise<ToolResult> {
  const since = parseTimeRange(args.time_range);

  let leadsQuery = supabase.from("leads").select("stage, budget, created_at");
  if (since) leadsQuery = leadsQuery.gte("created_at", since);
  const { data: leads, error: leadsError } = await leadsQuery;
  if (leadsError) return { ok: false, summary: `Couldn't pull the pipeline summary: ${leadsError.message}` };

  let projectsQuery = supabase.from("projects").select("status, created_at");
  if (since) projectsQuery = projectsQuery.gte("created_at", since);
  const { data: projects, error: projectsError } = await projectsQuery;
  if (projectsError) return { ok: false, summary: `Couldn't pull the pipeline summary: ${projectsError.message}` };

  const leadRows = (leads ?? []) as { stage: string; budget: number | null }[];
  const projectRows = (projects ?? []) as { status: string }[];

  const byStage: Record<string, number> = {};
  for (const l of leadRows) byStage[l.stage] = (byStage[l.stage] ?? 0) + 1;

  // Same calc as the dashboard's own "Pipeline Value" stat (app/page.tsx) —
  // sum of budget across leads not yet Won or Lost.
  const pipelineValue = leadRows
    .filter((l) => l.stage !== "Lost" && l.stage !== "Won")
    .reduce((sum, l) => sum + (l.budget ?? 0), 0);

  const activeProjects = projectRows.filter((p) => p.status === "In Progress").length;

  const stageLines = Object.entries(byStage).map(([stage, count]) => `${stage}: ${count}`).join(", ");
  const rangeLabel = args.time_range?.trim() || "all time";

  const summary =
    `Pipeline summary (${rangeLabel}): ${leadRows.length} lead${leadRows.length === 1 ? "" : "s"} total` +
    (stageLines ? ` (${stageLines})` : "") +
    `. Pipeline value ₹${pipelineValue.toLocaleString("en-IN")} across open leads. ` +
    `${activeProjects} active project${activeProjects === 1 ? "" : "s"}.`;

  return { ok: true, summary, data: { leadsByStage: byStage, pipelineValue, activeProjects, rangeLabel } };
}

async function execUpdateSubsidyStage(
  supabase: SupabaseClient,
  args: { identifier?: string; new_stage?: string },
): Promise<ToolResult> {
  const identifier = args.identifier?.trim();
  const newStageName = args.new_stage?.trim();
  if (!identifier || !newStageName) {
    return { ok: false, summary: "Missing identifier or new stage — could not update the pipeline." };
  }

  const projectMatches = await findMatches(supabase, "projects", identifier);
  if (projectMatches.length === 0) return notFoundResult("project", identifier);
  if (projectMatches.length > 1) {
    return ambiguousResult("projects", identifier, projectMatches.map((m) => formatMatchLabel(m)));
  }
  const project = projectMatches[0];

  // The DISCOM/subsidy pipeline is the SAME general project-pipeline
  // mechanism from tenant_pipeline_stages/project_pipeline_history (see
  // supabase/migrations/0010_pipeline_tracker.sql) — stage names are
  // tenant-configurable free text (e.g. "DISCOM Feasibility Approval"),
  // not a fixed enum, so this is a fuzzy name match, not an exact one.
  const { data: stages, error: stagesError } = await supabase
    .from("tenant_pipeline_stages")
    .select("id, name")
    .eq("active", true)
    .ilike("name", `%${newStageName}%`);
  if (stagesError) return { ok: false, summary: `Couldn't look up pipeline stages: ${stagesError.message}` };

  if (!stages || stages.length === 0) {
    return {
      ok: false,
      summary: `I couldn't find a pipeline stage matching "${newStageName}". Check Settings → Pipeline Stages for the exact stage names configured.`,
    };
  }
  if (stages.length > 1) {
    return ambiguousResult("pipeline stages", newStageName, stages.map((s: { name: string }) => s.name));
  }
  const stage = stages[0] as { id: string; name: string };

  // Mirrors lib/pipeline.ts's updateProjectPipelineStage (two sequential
  // writes, not atomic — same convention already established there) rather
  // than importing it directly, since that helper builds its own
  // browser-side Supabase client instead of taking the session-aware
  // server client every Gigi tool must use.
  const enteredAt = new Date().toISOString();
  const { error: historyError } = await supabase.from("project_pipeline_history").insert({
    project_id: project.id, stage_id: stage.id, notes: null, entered_at: enteredAt,
  });
  if (historyError) return { ok: false, summary: `Failed to update the stage: ${historyError.message}` };

  const { error: updateError } = await supabase
    .from("projects")
    .update({ current_stage_id: stage.id, current_stage_entered_at: enteredAt })
    .eq("id", project.id);
  if (updateError) return { ok: false, summary: `Failed to update the stage: ${updateError.message}` };

  return { ok: true, summary: `Moved ${project.name}'s subsidy/DISCOM pipeline to "${stage.name}".` };
}

// Quotes aren't a stored/generated-server-side resource in this app — the
// quote page (app/quote/page.tsx) is an interactive form + client-side PDF
// export that reads its starting values from URL query params (see its
// own generateQuote()). So "generating a quote" here means building that
// same pre-filled URL, not inserting a row anywhere — there's no `quotes`
// table to insert into.
async function execGenerateQuote(
  supabase: SupabaseClient,
  args: { clientId?: string },
): Promise<ToolResult> {
  if (!args.clientId) {
    return { ok: false, summary: "Missing clientId — could not generate a quote." };
  }

  const { data: clientRow, error: clientError } = await supabase
    .from("clients")
    .select("name, phone")
    .eq("id", args.clientId)
    .single();

  if (clientError || !clientRow) {
    return { ok: false, summary: "Could not find that client." };
  }

  // A CRM client isn't necessarily a project yet — if one exists for the
  // same phone number, its address/system_size make for a richer
  // pre-filled quote; otherwise the link still works with just the name.
  const { data: projectRow } = await supabase
    .from("projects")
    .select("address, system_size")
    .eq("phone", clientRow.phone)
    .maybeSingle();

  const systemSize = projectRow?.system_size ?? null;
  // Same 1332 kWh/kWp/yr constant the rest of the app uses (quote page's
  // own generateQuote, the dashboard's estimate) — kept as a literal here
  // rather than importing it, since it isn't exported from anywhere.
  const yearlyUnits = systemSize ? Math.round(systemSize * 1332) : null;

  const params = new URLSearchParams({
    name: clientRow.name ?? "",
    ...(projectRow?.address ? { address: projectRow.address } : {}),
    ...(systemSize ? { system_size: String(systemSize) } : {}),
    ...(yearlyUnits ? { yearly_units: String(yearlyUnits), monthly_units: String(Math.round(yearlyUnits / 12)) } : {}),
  });

  const url = `/quote?${params.toString()}`;
  return {
    ok: true,
    summary: `Quote link ready for ${clientRow.name}: ${url}`,
    data: { url },
  };
}

// Calls the EXISTING /api/make-call route rather than reimplementing its
// Twilio/RLS/status-update logic (per the brief) — forwards the incoming
// request's cookies so the internal fetch carries the same session
// make-call needs for its own createServerSupabaseClient() call.
async function execInitiateCall(
  args: { clientId?: string },
  origin: string,
  cookieHeader: string | null,
): Promise<ToolResult> {
  if (!args.clientId) {
    return { ok: false, summary: "Missing clientId — could not place the call." };
  }

  const res = await fetch(`${origin}/api/make-call`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
    body: JSON.stringify({ clientId: args.clientId }),
  });
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    return { ok: false, summary: `Failed to place the call: ${body.error ?? "unknown error"}` };
  }
  return { ok: true, summary: "Okay, calling them now.", data: body };
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: { supabase: SupabaseClient; origin: string; cookieHeader: string | null },
): Promise<ToolResult> {
  try {
    switch (name) {
      case "add_lead":
        return await execAddLead(ctx.supabase, args);
      case "add_calling_client":
        return await execAddCallingClient(ctx.supabase, args);
      case "create_project":
        return await execCreateProject(ctx.supabase, args);
      case "update_lead_stage":
        return await execUpdateLeadStage(ctx.supabase, args);
      case "update_client_status":
        return await execUpdateClientStatus(ctx.supabase, args);
      case "update_project_payment":
        return await execUpdateProjectPayment(ctx.supabase, args);
      case "send_whatsapp_followup":
        return await execSendWhatsappFollowup(ctx.supabase, args);
      case "get_pipeline_summary":
        return await execGetPipelineSummary(ctx.supabase, args);
      case "update_subsidy_stage":
        return await execUpdateSubsidyStage(ctx.supabase, args);
      case "generate_quote":
        return await execGenerateQuote(ctx.supabase, args);
      case "initiate_call":
        return await execInitiateCall(args, ctx.origin, ctx.cookieHeader);
      default:
        return { ok: false, summary: `Unknown tool: ${name}` };
    }
  } catch (err) {
    console.error(`[gigi] tool ${name} threw`, err);
    return { ok: false, summary: "Something went wrong running that action." };
  }
}
