// KNOWN SIMPLIFICATION — deliberate for now, not an oversight: platform
// admin is a single hardcoded user ID rather than a `role` column on
// `tenants`. Every place that needs to know "is this the platform admin"
// imports this one constant, so upgrading to a real role check later is a
// one-file change (here + the matching literal in
// supabase/migrations/0008_product_library.sql's RLS policies) instead of
// hunting down scattered comparisons. Revisit this if a second admin is
// ever needed, or if this account is rotated/deleted.
export const PLATFORM_ADMIN_USER_ID = "343b0352-74c6-4aea-9f2e-0bd09e7d3010";

export function isPlatformAdmin(userId: string | null | undefined): boolean {
  return userId === PLATFORM_ADMIN_USER_ID;
}
