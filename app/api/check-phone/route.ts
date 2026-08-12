// Cross-table (AND same-table) duplicate-phone lookup for client-side forms
// (lead-modal.tsx, project-modal.tsx, the CRM "+ Add Client" modal). Gigi's
// tools call findDuplicatePhone directly (server-side already) instead of
// round-tripping through here.
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { cleanPhone } from "@/lib/phone";
import { findDuplicatePhone, describeDuplicateMatch, type PhoneTable } from "@/lib/duplicateCheck";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { phone?: string; currentTable?: PhoneTable }
    | null;

  const phone = cleanPhone(body?.phone ?? "");
  if (!phone) {
    return NextResponse.json({ matches: [] });
  }

  const supabase = await createServerSupabaseClient();
  const matches = await findDuplicatePhone(supabase, phone, body?.currentTable);

  return NextResponse.json({
    matches: matches.map((m) => ({ ...m, label: describeDuplicateMatch(m) })),
  });
}
