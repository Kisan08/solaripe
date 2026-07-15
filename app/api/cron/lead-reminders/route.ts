import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendOwnerWhatsApp, formatFollowUpReminderMessage } from "@/lib/whatsappNotify";

// Today's date in IST (Asia/Kolkata), not the server's UTC date — Vercel
// Cron schedules are UTC, and "today" for a business running in India
// should mean the Indian calendar day regardless of what UTC time the
// cron happens to fire at.
function todayInIst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()); // en-CA => YYYY-MM-DD
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = todayInIst();

  const { data: leads, error } = await supabaseAdmin
    .from("leads")
    .select("id, name, phone, stage, notes, follow_up_date")
    .eq("follow_up_date", today);

  if (error) {
    console.error("[cron/lead-reminders] failed to query leads", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = await Promise.all(
    (leads ?? []).map(async lead => {
      const message = formatFollowUpReminderMessage({
        name: lead.name,
        phone: lead.phone,
        stage: lead.stage,
        notes: lead.notes,
      });
      const result = await sendOwnerWhatsApp(message);
      return { leadId: lead.id, name: lead.name, sent: result.ok, error: result.error };
    }),
  );

  return NextResponse.json({
    date: today,
    due: results.length,
    sent: results.filter(r => r.sent).length,
    failed: results.filter(r => !r.sent),
  });
}
