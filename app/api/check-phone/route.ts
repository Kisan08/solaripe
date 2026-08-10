// Cross-table duplicate-phone lookup for client-side forms (lead-modal.tsx,
// the CRM "+ Add Client" modal). Gigi's tools call findDuplicatePhone
// directly (server-side already) instead of round-tripping through here.
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { cleanPhone } from "@/lib/phone";
import { findDuplicatePhone, TABLE_LABELS, type PhoneTable } from "@/lib/duplicateCheck";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { phone?: string; excludeTable?: PhoneTable }
    | null;

  const phone = cleanPhone(body?.phone ?? "");
  if (!phone) {
    return NextResponse.json({ matches: [] });
  }

  const supabase = await createServerSupabaseClient();
  const matches = await findDuplicatePhone(supabase, phone, body?.excludeTable);

  return NextResponse.json({
    matches: matches.map((m) => ({ ...m, label: TABLE_LABELS[m.table] })),
  });
}
