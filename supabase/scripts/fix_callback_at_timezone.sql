-- ONE-TIME DATA CORRECTION — run this exactly once, by hand, in the
-- Supabase SQL editor, and run it BEFORE anyone sets any NEW callback
-- time through the (now-fixed) AI Calling table picker.
--
-- Bug: app/crm/page.tsx's callback_at picker used to convert the
-- datetime-local input via `new Date(v)` / device-local Date getters
-- instead of an explicit +05:30 (IST) offset. On any device whose OS
-- timezone wasn't itself IST — e.g. one set to UTC — a value the user
-- typed meaning "7:43 PM India time" got saved with the clock digits
-- 19:43 stamped as UTC instead of being converted to the correct UTC
-- instant (14:13 UTC). Every callback_at written through that picker
-- before the fix landed is off by exactly the gap between IST and
-- whatever timezone the saving device happened to be in — which, given
-- the reported example (19:43 saved as "19:43:00+00"), was UTC, making
-- every affected row off by exactly 5 hours 30 minutes.
--
-- This subtracts 5:30 from every currently-stored callback_at, undoing
-- that. Once this has been run, the picker's own onChange/onBlur save
-- path (now fixed) is correct going forward — do NOT run this again
-- after that point, or it will shift already-correct rows backward by
-- another 5:30 and reintroduce the exact same bug in the other direction.
--
-- Preview first — read this before running the UPDATE below:
--   select id, name, callback_at, callback_at - interval '5:30' as corrected
--   from public.clients
--   where callback_at is not null;

update public.clients
set callback_at = callback_at - interval '5:30'
where callback_at is not null;
