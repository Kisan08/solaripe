import twilio from "twilio";

// Same TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN pattern as app/api/make-call/route.ts —
// these WhatsApp self-notifications reuse the exact same Twilio account/creds
// already used for voice calling, just a different messaging channel.
function getTwilioClient() {
  return twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
}

export interface WhatsAppSendResult {
  ok: boolean;
  sid?: string;
  error?: string;
}

// A notification is a side-effect, not the main job (a call completing, or
// a cron sweep running) — this must NEVER throw. A missing env var or a
// Twilio API hiccup here should never take down the calling flow or fail
// the whole cron run; it should just be logged and reported back in the
// result object so the caller can decide what to do with it.
//
// Recipient is an explicit param (not read from env here) so this same
// function backs both the single-owner send (sendOwnerWhatsApp, unchanged
// behavior below) and the per-tenant send the pipeline-staleness cron
// needs (sendWhatsAppTo) — see that function's comment for why a second
// entry point was necessary rather than reusing sendOwnerWhatsApp as-is.
async function sendWhatsApp(to: string, body: string): Promise<WhatsAppSendResult> {
  const from = process.env.TWILIO_WHATSAPP_FROM;

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    const error = "TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN not set";
    console.error("[whatsappNotify]", error);
    return { ok: false, error };
  }
  if (!from) {
    const error = "TWILIO_WHATSAPP_FROM not set";
    console.error("[whatsappNotify]", error);
    return { ok: false, error };
  }
  if (!to) {
    const error = "recipient number not set";
    console.error("[whatsappNotify]", error);
    return { ok: false, error };
  }

  try {
    const msg = await getTwilioClient().messages.create({ from, to, body });
    return { ok: true, sid: msg.sid };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[whatsappNotify] send failed", error);
    return { ok: false, error };
  }
}

export async function sendOwnerWhatsApp(body: string): Promise<WhatsAppSendResult> {
  return sendWhatsApp(process.env.OWNER_WHATSAPP_NUMBER ?? "", body);
}

// The existing pattern (sendOwnerWhatsApp) always sends to one hardcoded
// app-wide number, which is fine for lead-reminders (that route was never
// updated to be tenant-scoped either) but wrong for pipeline-staleness,
// which needs to notify each TENANT about their own stuck projects.
// Recipient is each tenant's own settings.owner_phone (already existed,
// unused by any notifier until now).
export async function sendWhatsAppTo(to: string, body: string): Promise<WhatsAppSendResult> {
  return sendWhatsApp(to, body);
}

export function formatCallSummaryMessage(params: {
  name: string;
  phone: string | null;
  stage: string | null;
  notes: string | null;
}): string {
  return `📞 Call finished

Lead: ${params.name}
Number: ${params.phone ?? "(unknown)"}
Stage: ${params.stage ?? "(unknown)"}
Notes: ${params.notes?.trim() || "(none captured)"}`;
}

export function formatFollowUpReminderMessage(params: {
  name: string;
  phone: string | null;
  stage: string | null;
  notes: string | null;
}): string {
  const notesLine = params.notes?.trim() ? `Notes: ${params.notes.trim()}\n` : "";
  return `⏰ Follow-up due today

Lead: ${params.name}
Number: ${params.phone ?? "(unknown)"}
Stage: ${params.stage ?? "(unknown)"}
${notesLine}
This lead is waiting on you.`;
}

// One grouped message per tenant, not one per stuck project — this is a
// digest, not a spam blast. Purely a nudge to go check the actual
// government portal; nothing here reflects live subsidy/DISCOM status.
export function formatPipelineStalenessMessage(staleProjects: {
  clientName: string;
  stageName: string;
  daysStuck: number;
}[]): string {
  const lines = staleProjects
    .map((p) => `• ${p.clientName} — ${p.stageName} (${p.daysStuck}d over)`)
    .join("\n");
  return `⚠️ ${staleProjects.length} project${staleProjects.length === 1 ? "" : "s"} stuck past expected stage time

${lines}

Check the actual PM Surya Ghar / DISCOM portal and update each project's stage once you've confirmed its real status.`;
}
