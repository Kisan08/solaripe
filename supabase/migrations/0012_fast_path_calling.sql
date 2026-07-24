-- Scripted fast-path opening for AI calls. Tracks progress through the
-- two-turn scripted exchange (interest question -> bill question -> close)
-- separately from `stage`, since the AI's own natural conversation can
-- also reach "qualification" — reusing stage for this would make a
-- fallen-through call ambiguous with a genuinely-still-in-fast-path one.
-- Set/cleared only by app/api/call-response/route.ts's fast-path block;
-- never touched by the AI-driven path.
alter table call_sessions
  add column if not exists fast_path_step text;
