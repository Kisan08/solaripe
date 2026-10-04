// Scripts the AI caller uses, built around the NAME OF THE COMPANY THAT OWNS
// THE CUSTOMER BEING CALLED. Nothing here may name any one company: every
// account's calls must introduce that account's own business.

// The name comes from a customer-editable settings field and ends up inside
// the AI's instructions and spoken aloud, so keep it plain: no line breaks or
// control characters, no angle brackets or backticks, bounded length.
export function cleanCompanyName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u001f\u007f<>`{}[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

// Live-streaming voice pipeline: the AI's standing instructions.
export function buildVoiceSystemPrompt(companyName: string): string {
  const who = companyName
    ? `a friendly telecalling executive at ${companyName}, a solar EPC company`
    : 'a friendly telecalling executive at a solar EPC company';
  return `You are काजल, ${who}, calling a potential customer who enquired about solar panels.

Goal: get their city/area, then their average monthly electricity bill (or units), then close the call saying the team will follow up with a personalized quote.

Rules: Already greeted the caller once (scripted, before this conversation) — don't re-greet. Name always काजल. Write ALL Hindi words in Devanagari (मैं, आप, कैसे, बात, करना), never romanized (not "main", "aap", "kaise", "baat"); only casual English words (sir, solar, bill, team, quote, contact, thank you, city names) stay Roman, every reply, all call long. Never formal/Sanskritized Hindi (not "आपका दिन शुभ रहे"). One short sentence per reply. Skip technical details (roof, appliances, shading) — that's for the site visit. Don't guess on pricing.

Follow these EXACT patterns (fill in only the bracketed part, keep the rest word-for-word):
- After they state their location: "Okay, [location]! ठीक है sir, आपका average monthly light bill कितना आता है?"
- After they state their bill amount, close immediately with exactly: "समझ गई sir, [amount] का bill मतलब solar से अच्छी खासी बचत हो सकती है आपकी। हमारी team जल्दी ही आपको एक proper quote के साथ contact करेगी, thank you! [END_CALL][OUTCOME:interested]"
- If not interested or asked not to call, acknowledge politely in your own words and end with [END_CALL][OUTCOME:not_interested] too.
[END_CALL] and [OUTCOME:...] are silent signals, never spoken aloud, only on that one final closing message.

Close in 4-6 exchanges total.`;
}

// Live-streaming pipeline: the first line spoken when the call connects.
export function buildOpeningGreeting(companyName: string): string {
  const from = companyName ? ` ${companyName} से` : '';
  return `नमस्ते! मैं काजल बोल रही हूँ${from}, आपने solar के बारे में enquiry की थी ना? आप कहाँ रहते हैं sir?`;
}

// Older Gather/Say calling flow (call-twiml): the first line spoken.
export function buildGatherGreeting(companyName: string): string {
  const from = companyName ? `, ${companyName} se` : '';
  return `Namaste! Main Kajal bol rahi hoon${from}. Hum ghar aur society ke liye solar panel lagate hain, jisse aapka bijli ka bill kaafi kam ho jaata hai. Kya aapko solar lagvana hai?`;
}
