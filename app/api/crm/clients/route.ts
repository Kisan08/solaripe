import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// Session-aware client (not the plain anon one) — RLS (auth.uid() =
// tenant_id, see supabase/migrations/0005_tenant_scope_crm.sql) does the
// actual filtering to the current tenant's own clients automatically.
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

function cleanPhone(raw: string): string | null {
  const digits = String(raw).replace(/\D/g, "").slice(-10);
  return digits.length === 10 && /^[6-9]/.test(digits) ? digits : null;
}

// Manual single-client add, alongside the existing bulk file import
// (app/api/extract-clients). Same tenant handling as the rest of the CRM:
// session-aware client, tenant_id stamped server-side by the DB trigger,
// never trusted from the request.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { name?: string; phone?: string } | null;

  const name = body?.name?.trim().slice(0, 100);
  const phone = cleanPhone(body?.phone ?? "");

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!phone) {
    return NextResponse.json({ error: "Enter a valid 10-digit Indian mobile number" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("clients")
    .insert({ name, phone, status: "pending" })
    .select()
    .single();

  if (error) {
    // Most likely cause: (tenant_id, phone) unique constraint — this
    // tenant already has a client with this phone number.
    const message = error.code === "23505" ? "A client with this phone number already exists" : error.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json(data);
}
