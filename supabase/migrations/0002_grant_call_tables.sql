-- Fixes: PostgREST returning 42501 "permission denied for table call_sessions"
-- on every single call turn. Creating a table does NOT automatically grant
-- the anon/authenticated roles access to it the way existing tables (like
-- clients) already had — that has to be done explicitly, and the original
-- 0001 migration missed it. This is why every real test call hit the
-- generic apology fallback: call-twiml/call-response could read `clients`
-- fine but couldn't read or write `call_sessions` at all.

grant select, insert, update on public.call_sessions to anon, authenticated, service_role;
grant select, insert, update on public.call_logs to anon, authenticated, service_role;
