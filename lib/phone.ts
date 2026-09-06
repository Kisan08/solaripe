// Shared Indian-mobile-number normalization — was previously duplicated
// verbatim in lib/gigi/tools.ts and app/api/crm/clients/route.ts.
export function cleanPhone(raw: string): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "").slice(-10);
  return digits.length === 10 && /^[6-9]/.test(digits) ? digits : null;
}

// Builds a `tel:` link for the device's native dialer from a stored phone
// value, or null when the value isn't a genuine 10-digit Indian mobile
// number (missing, too short, garbled) — callers MUST handle the null case
// rather than render a broken tel: link. Same normalization make-call/
// route.ts uses server-side for Twilio's `to` field, so a manual dial and
// an AI call always resolve to the exact same number.
export function telHref(raw: string | null | undefined): string | null {
  const cleaned = cleanPhone(String(raw ?? ""));
  return cleaned ? `tel:+91${cleaned}` : null;
}
