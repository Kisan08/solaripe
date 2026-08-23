import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/admin";
import { sendWhatsAppTo, formatScheduledReminderMessage } from "@/lib/whatsappNotify";

// Precise-time WhatsApp reminders — distinct from the existing
// cron/lead-reminders (a "due sometime today" digest to one hardcoded
// number). This one fires within a specific window of the actual
// scheduled moment, covers both leads.follow_up_date+follow_up_time and
// clients.callback_at, sends each tenant's own owner_phone (not a shared
// number), and de-dupes via reminder_sent_at so the same reminder never
// goes out twice even though the window overlaps between runs.
const WINDOW_MINUTES = 30;

// This route isn't in vercel.json's crons (Vercel Hobby only runs crons
// once a day — see the commit that removed it — so a real 15-minute
// schedule has to come from an external scheduler hitting this URL
// instead). That means, unlike the other two cron routes, this one is
// reachable by anyone who knows the path — CRON_SECRET is what stands in
// for Vercel's own cron-invocation guarantee. Accepted two ways since not
// every external scheduler can set a custom header: the standard
// `Authorization: Bearer <secret>` header, or a `?secret=<secret>` query
// param for schedulers that only support a plain URL. Also accepts a
// logged-in platform admin's normal session — no separate test button
// needed; just hit this URL directly in the browser while logged in as
// the admin account to trigger it manually.
async function isAuthorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth === `Bearer ${secret}`) return true;
    if (req.nextUrl.searchParams.get("secret") === secret) return true;
  }
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return isPlatformAdmin(user?.id);
}

// Postgres `time` sometimes comes back as "HH:MM:SS" and sometimes
// "HH:MM" depending on precision — pad to a form Date.parse accepts.
function normalizeTime(t: string): string {
  return t.length === 5 ? `${t}:00` : t;
}

interface DueItem {
  table: "leads" | "clients";
  id: string;
  tenantId: string;
  name: string;
  phone: string | null;
  scheduledFor: Date;
}

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const windowEnd = now + WINDOW_MINUTES * 60_000;

  const { data: leadRows, error: leadsError } = await supabaseAdmin
    .from("leads")
    .select("id, tenant_id, name, phone, follow_up_date, follow_up_time")
    .not("follow_up_date", "is", null)
    .not("follow_up_time", "is", null)
    .is("reminder_sent_at", null);

  if (leadsError) {
    console.error("[cron/send-reminders] failed to query leads", leadsError);
    return NextResponse.json({ error: leadsError.message }, { status: 500 });
  }

  const { data: clientRows, error: clientsError } = await supabaseAdmin
    .from("clients")
    .select("id, tenant_id, name, phone, callback_at")
    .not("callback_at", "is", null)
    .is("reminder_sent_at", null);

  if (clientsError) {
    console.error("[cron/send-reminders] failed to query clients", clientsError);
    return NextResponse.json({ error: clientsError.message }, { status: 500 });
  }

  const due: DueItem[] = [];

  // follow_up_date/follow_up_time are stored as plain IST calendar
  // values (no timezone of their own) — same "business day is the
  // Indian calendar day" assumption cron/lead-reminders already makes,
  // just down to the minute instead of the whole day.
  for (const lead of leadRows ?? []) {
    const scheduledMs = Date.parse(
      `${lead.follow_up_date}T${normalizeTime(lead.follow_up_time as string)}+05:30`,
    );
    if (Number.isNaN(scheduledMs)) continue;
    if (scheduledMs >= now && scheduledMs <= windowEnd) {
      due.push({
        table: "leads", id: lead.id as string, tenantId: lead.tenant_id as string,
        name: lead.name as string, phone: lead.phone as string | null,
        scheduledFor: new Date(scheduledMs),
      });
    }
  }

  for (const client of clientRows ?? []) {
    const scheduledMs = new Date(client.callback_at as string).getTime();
    if (scheduledMs >= now && scheduledMs <= windowEnd) {
      due.push({
        table: "clients", id: client.id as string, tenantId: client.tenant_id as string,
        name: client.name as string, phone: client.phone as string | null,
        scheduledFor: new Date(scheduledMs),
      });
    }
  }

  if (due.length === 0) {
    return NextResponse.json({ due: 0, sent: 0, skipped: 0, failed: [] });
  }

  const tenantIds = Array.from(new Set(due.map((d) => d.tenantId)));
  const { data: settingsRows, error: settingsError } = await supabaseAdmin
    .from("settings")
    .select("tenant_id, owner_phone")
    .in("tenant_id", tenantIds);

  if (settingsError) {
    console.error("[cron/send-reminders] failed to query settings", settingsError);
    return NextResponse.json({ error: settingsError.message }, { status: 500 });
  }

  const phoneByTenant = new Map(
    (settingsRows ?? []).map((s) => [s.tenant_id as string, s.owner_phone as string | null]),
  );

  // Each row is handled independently and never throws out of this map —
  // one failed send (bad number, Twilio hiccup, a stray update error)
  // must not stop the rest of the batch from being attempted.
  const results = await Promise.all(due.map(async (item) => {
    const phone = phoneByTenant.get(item.tenantId);
    if (!phone) {
      console.error(`[cron/send-reminders] tenant ${item.tenantId} has no owner_phone set, skipping ${item.table} ${item.id}`);
      return { ...item, sent: false, skipped: true, error: undefined as string | undefined };
    }

    try {
      const message = formatScheduledReminderMessage({
        name: item.name, phone: item.phone, scheduledFor: item.scheduledFor,
      });
      const result = await sendWhatsAppTo(phone, message);
      if (!result.ok) {
        console.error(`[cron/send-reminders] send failed for ${item.table} ${item.id}`, result.error);
        return { ...item, sent: false, skipped: false, error: result.error };
      }

      const { error: updateError } = await supabaseAdmin
        .from(item.table)
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", item.id)
        .eq("tenant_id", item.tenantId);

      if (updateError) {
        // Sent but couldn't mark it — logged loudly since this is the one
        // failure mode that risks a duplicate reminder on the next run.
        console.error(`[cron/send-reminders] sent but failed to mark reminder_sent_at for ${item.table} ${item.id}`, updateError);
        return { ...item, sent: true, skipped: false, error: `sent but not marked: ${updateError.message}` };
      }

      return { ...item, sent: true, skipped: false, error: undefined as string | undefined };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[cron/send-reminders] unexpected error for ${item.table} ${item.id}`, message);
      return { ...item, sent: false, skipped: false, error: message };
    }
  }));

  return NextResponse.json({
    due: due.length,
    sent: results.filter((r) => r.sent).length,
    skipped: results.filter((r) => r.skipped).length,
    failed: results
      .filter((r) => !r.sent && !r.skipped)
      .map((r) => ({ table: r.table, id: r.id, name: r.name, error: r.error })),
  });
}
