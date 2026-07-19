import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/admin";

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isPlatformAdmin(user.id)) {
    return { supabase, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { supabase, error: null };
}

// Covers edits and the "deactivate" action (both are just a PATCH with
// whichever fields changed — deactivate sends { active: false }).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  for (const key of ["category", "brand", "model", "wattage_or_spec", "specs", "warranty_years", "logo_url", "active", "display_order"]) {
    if (key in body) patch[key] = body[key];
  }
  patch.updated_at = new Date().toISOString();

  const { data, error: dbError } = await supabase
    .from("product_library")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;

  const { error: dbError } = await supabase.from("product_library").delete().eq("id", id);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
