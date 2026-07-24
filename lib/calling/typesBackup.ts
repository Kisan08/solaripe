// Shared types for the AI calling conversation engine. A CallSession row
// (see supabase/migrations/0001_ai_calling.sql) IS this shape, persisted
// between every Twilio webhook turn since each turn is a fresh stateless
// HTTP request — there's no in-memory conversation to fall back on.

export type Stage =
  | "greeting"
  | "qualification"
  | "need_analysis"
  | "pricing"
  | "subsidy"
  | "objection_handling"
  | "booking"
  | "confirmation"
  | "end";

export const STAGES: Stage[] = [
  "greeting", "qualification", "need_analysis", "pricing",
  "subsidy", "objection_handling", "booking", "confirmation", "end",
];

export type Intent =
  | "interested"
  | "not_interested"
  | "confused"
  | "comparing"
  | "price_sensitive"
  | "technical"
  | "busy"
  | "angry"
  | "curious"
  | "high_intent"
  | "returning_customer"
  | "unclear";

export const INTENTS: Intent[] = [
  "interested", "not_interested", "confused", "comparing", "price_sensitive",
  "technical", "busy", "angry", "curious", "high_intent", "returning_customer", "unclear",
];

export type Emotion = "friendly" | "happy" | "neutral" | "impatient" | "angry" | "excited" | "confused";

export const EMOTIONS: Emotion[] = ["friendly", "happy", "neutral", "impatient", "angry", "excited", "confused"];

export interface Slots {
  city?: string;
  electricity_bill?: string;
  property_type?: string;
  decision_maker?: string;
  wants_quotation?: boolean;
  wants_financing?: boolean;
  site_visit_preferred_time?: string;
  objections?: string[];
}

export interface TranscriptTurn {
  role: "customer" | "ai";
  text: string;
  at: string;
}

export interface CallSession {
  id: string;
  call_sid: string;
  client_id: string;
  stage: Stage;
  turn_count: number;
  silence_count: number;
  transcript: TranscriptTurn[];
  slots: Slots;
  intent: Intent | null;
  emotion: Emotion | null;
  ended: boolean;
}

export interface ClientCrmContext {
  id: string;
  name: string;
  phone: string;
  city: string | null;
  electricity_bill: string | null;
  property_type: string | null;
  lead_source: string | null;
  notes: string | null;
  status: string;
}

// What the model must return for every turn, as strict JSON.
export interface AiTurnResult {
  reply: string;
  stage: Stage;
  intent: Intent;
  emotion: Emotion;
  slots: Partial<Slots>;
  endCall: boolean;
  summary?: string;
  followUp?: string;
}
