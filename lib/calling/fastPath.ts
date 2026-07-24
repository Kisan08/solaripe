// Scripted, zero-AI-latency handling for the two most predictable
// exchanges in a call: the opening "do you want solar" question, and the
// bill-amount follow-up. Anything that doesn't cleanly match a simple
// keyword pattern falls through to the existing full AI flow in
// app/api/call-response/route.ts — this file only ever says "yes",
// "no", or "not sure, let the AI handle it."

export type OpeningAnswer = "positive" | "negative" | "unclear";

// Negative checked FIRST — "nahi chahiye" ("don't want it") contains
// "chahiye", a positive keyword, so checking positive first would
// misclassify a clear decline as interest. This mirrors the existing
// digitToText() function's plain-pattern style in call-response/route.ts,
// just extended from digits to speech text.
const NEGATIVE_PATTERNS = ["nahi", "nahin", "not interested", "no"];
const POSITIVE_PATTERNS = ["haan", "ji haan", "haa", "ji", "chahiye", "interested", "yes", "sahi hai"];

export function classifyOpeningResponse(text: string): OpeningAnswer {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return "unclear";
  if (NEGATIVE_PATTERNS.some((p) => normalized.includes(p))) return "negative";
  if (POSITIVE_PATTERNS.some((p) => normalized.includes(p))) return "positive";
  return "unclear";
}

// Deliberately permissive, not a real parser — the instruction is to
// capture whatever was said for a human to review later, not validate it.
// The only thing this rules out is an obvious non-answer (a question, an
// objection) that contains no digits at all, e.g. "aap kaunsi company se
// ho?" — that falls through to the AI instead of being force-captured as
// a bill figure.
export function looksLikeBillAmount(text: string): boolean {
  return /\d/.test(text);
}

export const FAST_PATH_BILL_QUESTION =
  "Bahut badhiya! Bas ek chhota sa sawaal — aapka monthly light bill lagbhag kitna aata hai?";

export const FAST_PATH_INTERESTED_CLOSE =
  "Dhanyavaad! Hamari sales team aapse jaldi hi contact karke poori jaankari aur best price bataayegi. Aapka din shubh ho!";

export const FAST_PATH_DECLINE_CLOSE =
  "Koi baat nahi! Agar future mein interest ho, toh humein zaroor call kijiye. Dhanyavaad, aapka din shubh ho!";
