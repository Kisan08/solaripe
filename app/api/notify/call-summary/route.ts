import { NextRequest, NextResponse } from "next/server";
import { sendWhatsAppTo, formatCallSummaryMessage } from "@/lib/whatsappNotify";
import { createServerSupabaseClient } from '@/lib/supabase/server';

// Fires a WhatsApp message to the business owner (never the lead) the
// moment a call finishes. Also directly callable for manual testing —
// see the testing checklist in the task this was built from.
export async function POST(req: NextRequest) {
  const db = await createServerSupabaseClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: settings, error } = await db.from('settings').select('owner_phone').eq('tenant_id', user.id).maybeSingle();
  if (error || !settings?.owner_phone) return NextResponse.json({ error: 'Configure your notification phone number first.' }, { status: 400 });
  const body = await req.json().catch(() => null) as {
    leadName?: string;
    leadPhone?: string;
    notes?: string;
    stage?: string;
  } | null;

  if (!body?.leadName) {
    return NextResponse.json({ error: "leadName is required" }, { status: 400 });
  }

  const message = formatCallSummaryMessage({
    name: body.leadName,
    phone: body.leadPhone ?? null,
    stage: body.stage ?? null,
    notes: body.notes ?? null,
  });

  const result = await sendWhatsAppTo(settings.owner_phone, message, user.id);

  // A plan limit is the one failure the caller must be told about clearly.
  if (result.limitReached) {
    return NextResponse.json({ sent: false, error: result.error, limitReached: true }, { status: 429 });
  }

  // Any other notification failure is never a reason to fail the calling
  // flow that triggered it — 200, with the actual outcome in the body.
  return NextResponse.json({ sent: result.ok, sid: result.sid, error: result.error });
}
