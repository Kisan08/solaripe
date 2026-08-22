-- Precise-time WhatsApp reminders (app/api/cron/send-reminders/route.ts),
-- separate from the existing date-only daily digest at
-- app/api/cron/lead-reminders/route.ts (untouched — that route only ever
-- reads follow_up_date, never the new follow_up_time/reminder_sent_at
-- columns below, so it keeps working exactly as it did before this).

-- leads.follow_up_date is date-only (no time-of-day) — add the paired
-- time column so a follow-up can be scheduled for a specific moment, not
-- just "sometime today".
alter table public.leads
  add column if not exists follow_up_time time,
  add column if not exists reminder_sent_at timestamptz;

-- clients (AI Calling) had no scheduled-callback field at all — a manual
-- caller marks someone "Call Back" (see the status dropdown added
-- earlier) but there was nowhere to say WHEN. callback_at is the single
-- date+time field for that, paired with reminder_sent_at the same way as
-- leads above.
alter table public.clients
  add column if not exists callback_at timestamptz,
  add column if not exists reminder_sent_at timestamptz;
