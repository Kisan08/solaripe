import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { CALL_STATUSES, type CallStatus } from "@/lib/types";

// Lets a person doing manual (non-AI) calling record the outcome directly
// on the client's row — same `clients` columns the AI pipeline writes
// (see lib/calling/leadScore.ts and app/api/call-response/route.ts),
// just triggered by a human from the AI Calling table instead of a
// webhook. called_at is stamped to now() whenever status or response
// changes, so a manually updated lead shows accurate "Called At" info the
// same as an AI-called one. Also doubles as the write path for
// callback_at (see supabase/migrations/0017_reminder_scheduling.sql),
// which doesn't stamp called_at since scheduling a callback isn't a call
// outcome. Session-aware client — RLS's UPDATE policy scopes this to the
// current tenant's own row, same as every other write on this page.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as
    { clientId?: string; status?: string; response?: string; callback_at?: string | null } | null;

  const clientId = body?.clientId;
  if (!clientId) {
    return NextResponse.json({ error: "clientId required" }, { status: 400 });
  }
  if (body?.status === undefined && body?.response === undefined && body?.callback_at === undefined) {
    return NextResponse.json({ error: "status, response or callback_at required" }, { status: 400 });
  }

  const update: { status?: CallStatus; response?: string | null; callback_at?: string | null; called_at?: string } = {};

  if (body?.status !== undefined) {
    if (!CALL_STATUSES.includes(body.status as CallStatus)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    update.status = body.status as CallStatus;
  }
  if (body?.response !== undefined) {
    update.response = body.response.trim().slice(0, 2000) || null;
  }
  // Scheduling a callback isn't itself a call outcome, so unlike
  // status/response below it doesn't stamp called_at.
  if (body?.callback_at !== undefined) {
    if (body.callback_at !== null && Number.isNaN(Date.parse(body.callback_at))) {
      return NextResponse.json({ error: "Invalid callback_at" }, { status: 400 });
    }
    update.callback_at = body.callback_at;
  }
  if (body?.status !== undefined || body?.response !== undefined) {
    update.called_at = new Date().toISOString();
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("clients").update(update).eq("id", clientId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
