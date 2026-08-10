// Shared Indian-mobile-number normalization — was previously duplicated
// verbatim in lib/gigi/tools.ts and app/api/crm/clients/route.ts.
export function cleanPhone(raw: string): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "").slice(-10);
  return digits.length === 10 && /^[6-9]/.test(digits) ? digits : null;
}
