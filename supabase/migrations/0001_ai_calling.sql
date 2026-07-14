-- AI calling redesign: richer CRM fields + per-call conversation state/logs.
-- Run this once in the Supabase SQL editor before deploying the new
-- call-twiml / call-response routes — they read/write these columns.

alter table clients
  add column if not exists city text,
  add column if not exists electricity_bill text,
  add column if not exists property_type text,
  add column if not exists lead_source text,
  add column if not exists notes text;

-- One row per phone call (keyed by Twilio CallSid). Carries the entire
-- conversation state across the stateless Twilio webhook round-trips —
-- Twilio calls your action URL fresh on every turn, so this table IS the
-- call's memory between turns.
create table if not exists call_sessions (
  id uuid primary key default gen_random_uuid(),
  call_sid text unique not null,
  client_id uuid references clients(id) on delete cascade,
  stage text not null default 'greeting',
  turn_count int not null default 0,
  silence_count int not null default 0,
  transcript jsonb not null default '[]'::jsonb,
  slots jsonb not null default '{}'::jsonb,
  intent text,
  emotion text,
  ended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists call_sessions_call_sid_idx on call_sessions (call_sid);

-- Per-turn log: what the customer said, what the AI replied, and the
-- classification/timing for that turn — powers analytics and debugging
-- without having to replay transcripts.
create table if not exists call_logs (
  id uuid primary key default gen_random_uuid(),
  call_sid text not null,
  client_id uuid references clients(id) on delete set null,
  turn int not null,
  customer_text text,
  ai_text text,
  intent text,
  stage text,
  latency_ms int,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists call_logs_call_sid_idx on call_logs (call_sid);
