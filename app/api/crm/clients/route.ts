import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { cleanPhone } from "@/lib/phone";
import { CALL_STATUSES, type CallStatus } from "@/lib/types";

const PAGE_SIZES = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 10;
const IDS_ONLY_LIMIT = 5000; // safety cap for "select all matching" / Call All — not a real page

// PostgREST's .or() filter string treats , ( ) as syntax, and % as the
// LIKE wildcard — a search term containing any of those would otherwise
// either break the filter or let the user inject their own wildcard
// pattern. Stripped, not escaped: name/phone search has no legitimate
// use for these characters anyway.
function sanitizeSearchTerm(raw: string): string {
  return raw.trim().replace(/[,()%*]/g, "");
}

function parseStatusFilter(raw: string | null): CallStatus | null {
  return raw && CALL_STATUSES.includes(raw as CallStatus) ? (raw as CallStatus) : null;
}

// Session-aware client (not the plain anon one) — RLS (auth.uid() =
// tenant_id, see supabase/migrations/0005_tenant_scope_crm.sql) does the
// actual filtering to the current tenant's own clients automatically.
//
// Two shapes:
// - Default: one page of results (`page`/`pageSize`), plus everything
//   else the UI needs that must NOT be scoped to the current page/filter —
//   global stats for the KPI cards, and a capped interested/call_back list
//   for the follow-up card and browser-notification effect. Three small
//   targeted queries, not one full-table fetch.
// - `?idsOnly=true`: a flat, uncapped-within-IDS_ONLY_LIMIT list of
//   {id,name,phone} matching the current search/status filter, no
//   pagination. Used by Call All (status=pending, ignoring whatever the
//   user currently has typed in search/filter — matching this button's
//   original "every pending client" behavior) and by the "select all N
//   matching clients" bulk-select link (current filter applied).
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const params = req.nextUrl.searchParams;

  const search = sanitizeSearchTerm(params.get("search") ?? "");
  const status = parseStatusFilter(params.get("status"));

  if (params.get("idsOnly") === "true") {
    let query = supabase.from("clients").select("id, name, phone").limit(IDS_ONLY_LIMIT);
    if (status) query = query.eq("status", status);
    if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  }

  const pageSize = PAGE_SIZES.includes(Number(params.get("pageSize")))
    ? Number(params.get("pageSize"))
    : DEFAULT_PAGE_SIZE;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const sortBy = params.get("sortBy") === "score" ? "score" : "priority";
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let listQuery = supabase.from("clients").select("*", { count: "exact" });
  if (status) listQuery = listQuery.eq("status", status);
  if (search) listQuery = listQuery.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
  listQuery = listQuery
    .order(sortBy === "score" ? "lead_score_rank" : "status_rank", { ascending: true })
    .range(from, to);

  // Global counts for the KPI cards AND the hero's "Calling Efficiency"
  // donut (called_at) — deliberately NOT filtered by search/status/page,
  // since these report totals across every client the tenant has, same
  // as before pagination existed. Two narrow columns selected across all
  // rows is far cheaper than the old full `select("*")` even at 1000+
  // rows, and avoids several separate per-status count round-trips.
  const statsQuery = supabase.from("clients").select("status, called_at");

  // Capped, narrow-column list for the follow-up reminder card and the
  // "newly interested" notification effect — also global, not scoped to
  // the current page/filter.
  const leadsQuery = supabase
    .from("clients")
    .select("id, name, phone, status")
    .in("status", ["interested", "call_back"])
    .order("created_at", { ascending: false })
    .limit(40);

  const [{ data, error, count }, { data: statusRows, error: statsError }, { data: leadRows, error: leadsError }] =
    await Promise.all([listQuery, statsQuery, leadsQuery]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (statsError) return NextResponse.json({ error: statsError.message }, { status: 500 });
  if (leadsError) return NextResponse.json({ error: leadsError.message }, { status: 500 });

  const stats = { total: 0, pending: 0, interested: 0, callBack: 0, notInterested: 0, called: 0 };
  for (const row of statusRows ?? []) {
    stats.total++;
    if (row.status === "pending") stats.pending++;
    else if (row.status === "interested") stats.interested++;
    else if (row.status === "call_back") stats.callBack++;
    else if (row.status === "not_interested") stats.notInterested++;
    if (row.called_at) stats.called++;
  }

  const leads = leadRows ?? [];

  return NextResponse.json({
    data: data ?? [],
    total: count ?? 0,
    stats,
    interestedLeads: leads.filter((c) => c.status === "interested"),
    callBackLeads: leads.filter((c) => c.status === "call_back"),
  });
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
