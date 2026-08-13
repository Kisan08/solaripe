// Gigi's brain: text in, either a tool result or a clarifying question out.
// Text-only for now (no voice) — see lib/gigi/groq.ts and lib/gigi/tools.ts
// for the model client and the 4 tool executors this route wires together.
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { callGroqWithTools, stripToolCallSyntax, type GigiMessage } from "@/lib/gigi/groq";
import { GIGI_TOOLS, REQUIRED_FIELDS, executeTool } from "@/lib/gigi/tools";

const SYSTEM_PROMPT = `You are Gigi, an assistant embedded in a solar EPC company's CRM platform. You help the user manage leads, AI Calling contacts, and projects by calling the right tool.

There are three separate person-tracking tables — don't confuse them:
- Leads (/leads): the sales pipeline. Stages: New Lead, Site Visit, Proposal Sent, Negotiation, Won, Lost. Tools: add_lead, update_lead_stage.
- AI Calling contacts (/crm): the auto-dial list. Statuses: pending, calling, interested, not_interested, call_back, no_answer, failed. Tools: add_calling_client, update_client_status, initiate_call.
- Projects: confirmed installs with payment tranches (1-4) and their own DISCOM/subsidy approval pipeline (separate from the sales-lead pipeline above — stage names here are configured per tenant in Settings, e.g. "DISCOM Feasibility Approval", "Net Meter Installed", "Subsidy Disbursed"). Tools: create_project, update_project_payment, update_subsidy_stage, generate_quote.
A person can plausibly exist in more than one of these — if it's unclear which one the user means (e.g. "mark Ravi as done" could be a lead stage, a calling status, or a subsidy stage), ask which before calling any tool.

send_whatsapp_followup and get_pipeline_summary work across leads/contacts as described in their own descriptions; get_pipeline_summary never writes anything, it just reports.

get_status and get_details are also read-only lookups, but for ONE named person — get_status just gives their current stage/status, get_details gives fuller info (contact info, notes, value, etc). Use get_pipeline_summary instead when the user asks about aggregate counts/totals ("how's the pipeline looking") rather than a specific person.

Rules:
- Only call a tool once you have all of its required information from the conversation. If anything required is missing or ambiguous, do NOT call the tool — instead ask a short, specific clarifying question in plain text.
- NEVER describe, narrate, or announce a function/tool call in your reply text (e.g. never write "I'll call the tool", "<function=...>", or any raw JSON tool arguments). Either ask a clarifying question in plain text, OR trigger the tool silently through the proper mechanism — never both, never narrate it.
- add_lead and add_calling_client are DIFFERENT things, even though both "add a contact": add_lead puts someone in the sales pipeline. add_calling_client puts someone on the AI Calling dial list. If the user just says "add John, 9876543210" with no other context, ask which one they mean before calling either tool.
- If a name/phone lookup tool reports it found multiple matches or no matches, relay that to the user plainly (list the options if given) and wait for them to clarify — never guess which record they meant.
- Never guess a phone number, name, or ID. Ask instead.
- If the user refers to "it", "him", "her", "that lead", "them", or similar without naming someone, resolve it from the most recently mentioned name/lead/client/project earlier in this conversation, rather than asking who they mean. Only ask for clarification if there's genuine ambiguity (e.g. multiple people were mentioned recently and it's unclear which one "it" refers to) or if no one has been mentioned yet.
- To generate a quote or place a call, you need the target client's ID. If the user names a client but you don't have their ID, ask them to confirm which client (by name/phone) rather than inventing an ID.
- If add_lead, add_calling_client, or create_project reports that the phone number already exists elsewhere, relay that warning to the user plainly and ask whether to proceed. Only if the user then explicitly confirms, call the SAME tool again with the same arguments plus confirmDuplicate: true. If the user instead declines (says no, don't, cancel, that's fine, nevermind, etc.) or replies with something unrelated, do NOT call the tool — acknowledge briefly (e.g. "No problem, not adding it.") and drop that pending action entirely. Do not re-ask the same confirmation again unless the user restates the original request.
- If the user's message is casual conversation with no actionable request — thanks, thank you, hi, hello, bye, ok, that's it — respond naturally and briefly (e.g. "You're welcome!", "Anytime!") without calling any tool and without re-surfacing a previous pending question.
- Keep replies short and conversational. You're operating a real CRM — be precise, not chatty. Replies are also read aloud by voice, so write for the ear: no markdown, no bullet points, no raw JSON.`;

export async function POST(req: NextRequest) {
  let body: { message?: string; conversationHistory?: GigiMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ reply: "I couldn't read that request." }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ reply: "Say something and I'll help." }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ reply: "You need to be logged in to use Gigi." }, { status: 401 });
  }

  // Cap history to the last 8 messages (~4 exchanges) sent to Groq each
  // turn, to bound token usage — SYSTEM_PROMPT is always sent in full
  // regardless. 8 comfortably covers the duplicate-confirmation flow
  // (resolved within 1-2 turns of the warning), since GigiWidget only ever
  // stores plain user/assistant text turns, never the intermediate
  // tool_calls/tool-role messages from a single request's own round trip.
  const fullHistory = Array.isArray(body.conversationHistory) ? body.conversationHistory : [];
  const history = fullHistory.slice(-8);
  const messages: GigiMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "user", content: message },
  ];

  try {
    const first = await callGroqWithTools(messages, GIGI_TOOLS);
    const toolCall = first.tool_calls?.[0];

    if (!toolCall) {
      return NextResponse.json({ reply: stripToolCallSyntax(first.content) ?? "I'm not sure how to help with that." });
    }

    let args: Record<string, unknown>;
    try {
      args = JSON.parse(toolCall.function.arguments || "{}");
    } catch {
      args = {};
    }

    // Safety net: don't purely trust the model's own judgment about
    // whether it has everything it needs — check the same required-field
    // list ourselves before touching the database.
    const missing = (REQUIRED_FIELDS[toolCall.function.name] ?? []).filter((field) => {
      const value = args[field];
      return value === undefined || value === null || value === "";
    });

    if (missing.length > 0) {
      const clarify = await callGroqWithTools([
        { role: "system", content: SYSTEM_PROMPT },
        ...history,
        { role: "user", content: message },
        {
          role: "system",
          content: `You tried to call ${toolCall.function.name} but these required fields are missing: ${missing.join(", ")}. Ask the user for them in one short question. Do not call any tool.`,
        },
      ]);
      return NextResponse.json({ reply: stripToolCallSyntax(clarify.content) ?? `I need ${missing.join(", ")} to do that.` });
    }

    const cookieHeader = req.headers.get("cookie");
    const result = await executeTool(toolCall.function.name, args, {
      supabase,
      origin: req.nextUrl.origin,
      cookieHeader,
    });

    // A clean, unambiguous success has nothing left to phrase — every tool
    // executor's own summary (lib/gigi/tools.ts) is already a clear,
    // spoken-friendly confirmation ("Added Kisan as a new lead."). Skip the
    // second Groq round trip entirely for this common case; it's only
    // needed when result.ok is false, since THAT'S where a raw error,
    // duplicate-phone warning, or ambiguous-match question needs natural
    // conversational phrasing (unchanged below).
    if (result.ok) {
      return NextResponse.json({
        reply: result.summary,
        tool: toolCall.function.name,
        result,
      });
    }

    const second = await callGroqWithTools([
      ...messages,
      { role: "assistant", content: first.content, tool_calls: first.tool_calls },
      { role: "tool", tool_call_id: toolCall.id, content: result.summary },
    ]);

    return NextResponse.json({
      reply: stripToolCallSyntax(second.content) ?? result.summary,
      tool: toolCall.function.name,
      result,
    });
  } catch (err) {
    console.error("[gigi] request failed", err);
    const detail = process.env.NODE_ENV !== "production" && err instanceof Error ? ` (${err.message})` : "";
    return NextResponse.json(
      { reply: `Something went wrong on my end — try again in a moment.${detail}` },
      { status: 500 },
    );
  }
}
