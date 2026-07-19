import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/admin";

// Explicit admin check here too, not just RLS — belt and suspenders,
// same reasoning as tenant isolation being double-enforced in Phase 2.
// RLS on product_library is what actually stops a write at the database
// level even if this check were ever bypassed/removed; this check exists
// so a non-admin gets a clear 403 instead of a confusing RLS failure.
async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isPlatformAdmin(user.id)) {
    return { supabase, user: null as null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { supabase, user, error: null };
}

// GET — admin sees every product (active and inactive), for the
// management UI. Tenant-facing reads (active-only, filtered by category)
// go through a separate, non-admin-gated route (see
// app/api/products/route.ts) since every authenticated tenant can read
// active products, not just the admin.
export async function GET() {
  const { supabase, error } = await requireAdmin();
  if (error) return error;

  const { data, error: dbError } = await supabase
    .from("product_library")
    .select("*")
    .order("category", { ascending: true })
    .order("display_order", { ascending: true });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const { supabase, error } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => null);
  if (!body?.category || !body?.brand || !body?.model) {
    return NextResponse.json({ error: "category, brand, and model are required" }, { status: 400 });
  }

  const { data, error: dbError } = await supabase
    .from("product_library")
    .insert({
      category: body.category,
      brand: body.brand,
      model: body.model,
      wattage_or_spec: body.wattage_or_spec ?? null,
      specs: body.specs ?? {},
      warranty_years: body.warranty_years ?? null,
      logo_url: body.logo_url ?? null,
      active: body.active ?? true,
      display_order: body.display_order ?? 0,
    })
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data);
}
