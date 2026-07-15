// Polly.Kajal-Neural is Twilio's built-in neural Hindi (hi-IN) voice —
// same <Say> mechanism as before, no new service or key.
export const VOICE = "Polly.Kajal-Neural";
export const LANG = "hi-IN";

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// <Gather> nesting <Say> is what gives interruption/barge-in for free:
// Twilio stops the nested <Say> the moment it detects speech and routes
// straight to the action URL with whatever was heard — no separate
// "stop speaking" logic needed. actionOnEmptyResult guarantees Twilio
// still calls the action URL on a silent timeout (instead of silently
// falling through), which is what lets silence handling live in one place
// in the turn handler rather than needing a second TwiML branch here.
export function buildGatherTwiml(sayText: string, actionUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" numDigits="1" language="${LANG}" speechTimeout="auto" speechModel="phone_call" actionOnEmptyResult="true" action="${actionUrl}" method="POST">
    <Say voice="${VOICE}" language="${LANG}">${escapeXml(sayText)}</Say>
  </Gather>
</Response>`;
}

export function buildHangupTwiml(sayText: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${VOICE}" language="${LANG}">${escapeXml(sayText)}</Say>
  <Hangup/>
</Response>`;
}
