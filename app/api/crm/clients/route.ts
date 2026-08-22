import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { cleanPhone } from "@/lib/phone";

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

// Real delete, not a status change. Safe at the DB level with no app-side
// cascade needed: call_sessions.client_id is ON DELETE CASCADE and
// call_logs.client_id is ON DELETE SET NULL (supabase/migrations/
// 0001_ai_calling.sql:19,40) — Postgres handles both automatically. RLS
// scopes the delete to the current tenant's own row.
//
// Two shapes: ?id=X (single, unchanged — the original per-row delete
// button) or a JSON body { ids: string[] } for bulk selection deletes,
// both go through the same tenant-scoped client and RLS policy. The bulk
// path is one .in("id", ids) call, not N single-row requests.
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const supabase = await createServerSupabaseClient();

  if (id) {
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const body = await req.json().catch(() => null) as { ids?: string[] } | null;
  const ids = body?.ids?.filter((v): v is string => typeof v === "string" && v.length > 0);

  if (!ids || ids.length === 0) {
    return NextResponse.json({ error: "id or ids is required" }, { status: 400 });
  }

  const { error } = await supabase.from("clients").delete().in("id", ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: ids.length });
}
