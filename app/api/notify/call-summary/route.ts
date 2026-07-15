import { NextRequest, NextResponse } from "next/server";
import { sendOwnerWhatsApp, formatCallSummaryMessage } from "@/lib/whatsappNotify";

// Fires a WhatsApp message to the business owner (never the lead) the
// moment a call finishes. Also directly callable for manual testing —
// see the testing checklist in the task this was built from.
export async function POST(req: NextRequest) {
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

  const result = await sendOwnerWhatsApp(message);

  // A notification failure is never a reason to fail the calling flow that
  // triggered it — always 200, with the actual outcome in the body so a
  // caller that cares (like the test checklist) can still see what happened.
  return NextResponse.json({ sent: result.ok, sid: result.sid, error: result.error });
}
