import type { Intent, Emotion, Slots } from "./types";

export type LeadScore = "hot" | "warm" | "cold";

// A minor upgrade signal only — never enough to downgrade a tier, and
// never enough to override a clear negative (not_interested / angry)
// below. A customer who gave concrete, specific answers (a real bill
// figure, their city, property type) AND explicitly asked for a
// quotation or a site visit is showing real engagement the intent/
// emotion classification alone may understate.
function hasStrongSlotSignal(slots: Partial<Slots>): boolean {
  const concreteFieldCount = [slots.city, slots.electricity_bill, slots.property_type, slots.decision_maker]
    .filter((v) => v !== undefined && v !== null && v !== "").length;
  const askedToMoveForward = slots.wants_quotation === true || Boolean(slots.site_visit_preferred_time);
  return concreteFieldCount >= 2 && askedToMoveForward;
}

// Built from the REAL intent/emotion vocabulary the AI actually returns
// (lib/calling/types.ts INTENTS/EMOTIONS, enforced by
// promptBuilder.ts's parseAiTurnResult) — not a generic
// positive/negative/neutral guess. See the Phase 8 report for the full
// list and the reasoning behind each tier below.
//
// Intent is the primary signal. Emotion gates/tempers it. Slots are a
// minor, upgrade-only adjustment on top. Where the AI's own vocabulary
// doesn't give a confident hot/cold read (comparing, price_sensitive,
// curious, technical, busy, confused, unclear, or a merely-neutral
// returning_customer), this deliberately lands on "warm" rather than
// forcing a false-confident call either way.
export function scoreLeadFromCall(intent: Intent, emotion: Emotion, slots: Partial<Slots> = {}): LeadScore {
  // Clear negative signals win outright regardless of anything else — an
  // angry customer (whether "angry" shows up as the intent or the
  // emotion — both exist independently in this codebase's vocabulary,
  // and mapEndStatus() in app/api/call-response/route.ts already treats
  // intent === "angry" the same as not_interested for CRM status, so
  // scoring matches that same precedent) or an explicit "not interested"
  // is not a lead no matter what specifics they happened to share along
  // the way.
  if (intent === "not_interested" || intent === "angry" || emotion === "angry") return "cold";

  // "high_intent" is a category the AI itself distinguishes from plain
  // "interested" — trust it (angry already filtered above; there's no
  // positive-emotion gate needed since the intent itself is the strong
  // signal here).
  if (intent === "high_intent") return "hot";

  // Plain "interested" only counts as hot alongside a genuinely positive
  // read — paired with impatient/confused, that's hesitation undercutting
  // the stated interest, so it stays warm instead.
  if (intent === "interested" && ["friendly", "happy", "excited", "neutral"].includes(emotion)) {
    return "hot";
  }

  // An existing customer re-engaging warmly is a strong signal; the same
  // customer sounding neutral/confused isn't confidently hot, just warm.
  if (intent === "returning_customer" && ["friendly", "happy", "excited"].includes(emotion)) {
    return "hot";
  }

  // Everything else — comparing, price_sensitive, curious, technical,
  // busy, confused, unclear, "interested" tempered by a negative-leaning
  // emotion, or returning_customer without a clearly positive read — is
  // genuine-but-uncommitted territory. Slots can nudge this up to hot,
  // never down, never past a negative verdict already returned above.
  return hasStrongSlotSignal(slots) ? "hot" : "warm";
}
