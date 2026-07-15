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
export async function sendOwnerWhatsApp(body: string): Promise<WhatsAppSendResult> {
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const to = process.env.OWNER_WHATSAPP_NUMBER;

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
    const error = "OWNER_WHATSAPP_NUMBER not set";
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
