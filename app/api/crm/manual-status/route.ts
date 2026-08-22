import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { CALL_STATUSES, type CallStatus } from "@/lib/types";

// Lets a person doing manual (non-AI) calling record the outcome directly
// on the client's row — same `clients` columns the AI pipeline writes
// (see lib/calling/leadScore.ts and app/api/call-response/route.ts),
// just triggered by a human from the AI Calling table instead of a
// webhook. called_at is always stamped to now() here, so a manually
// updated lead shows accurate "Called At" info the same as an AI-called
// one. Session-aware client — RLS's UPDATE policy scopes this to the
// current tenant's own row, same as every other write on this page.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as
    { clientId?: string; status?: string; response?: string } | null;

  const clientId = body?.clientId;
  if (!clientId) {
    return NextResponse.json({ error: "clientId required" }, { status: 400 });
  }
  if (body?.status === undefined && body?.response === undefined) {
    return NextResponse.json({ error: "status or response required" }, { status: 400 });
  }

  const update: { status?: CallStatus; response?: string | null; called_at: string } = {
    called_at: new Date().toISOString(),
  };

  if (body?.status !== undefined) {
    if (!CALL_STATUSES.includes(body.status as CallStatus)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    update.status = body.status as CallStatus;
  }
  if (body?.response !== undefined) {
    update.response = body.response.trim().slice(0, 2000) || null;
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("clients").update(update).eq("id", clientId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
