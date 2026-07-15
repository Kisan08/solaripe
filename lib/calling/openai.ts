// Thin fetch-based LLM client — deliberately not any provider's npm SDK, so
// this adds zero new dependencies.
//
// Auto-detects the provider from whatever key already exists in the
// environment, preferring Groq: your .env.local already has a
// GROQ_API_KEY (unused before this), Groq's API is OpenAI-compatible (same
// request/response shape, just a different base URL and model), it has a
// usable free tier, and its inference latency is dramatically lower than
// OpenAI's — which directly serves "reduce latency as much as possible."
// If you later add an OPENAI_API_KEY, that takes priority automatically
// (set LLM_PROVIDER=openai to force it either way). No code changes needed
// to switch.
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function resolveProvider(): { apiKey: string; baseUrl: string; model: string } {
  const forced = process.env.LLM_PROVIDER; // "groq" | "openai", optional override
  const hasOpenAi = !!process.env.OPENAI_API_KEY;
  const hasGroq = !!process.env.GROQ_API_KEY;

  const useOpenAi = forced === "openai" || (!forced && hasOpenAi) || (forced === undefined && hasOpenAi && !hasGroq);

  if (useOpenAi && hasOpenAi) {
    return {
      apiKey: process.env.OPENAI_API_KEY!,
      baseUrl: "https://api.openai.com/v1/chat/completions",
      model: process.env.LLM_MODEL || "gpt-4o-mini",
    };
  }
  if (hasGroq) {
    return {
      apiKey: process.env.GROQ_API_KEY!,
      baseUrl: "https://api.groq.com/openai/v1/chat/completions",
      model: process.env.LLM_MODEL || "llama-3.3-70b-versatile",
    };
  }
  throw new Error("No LLM key found — set GROQ_API_KEY or OPENAI_API_KEY in .env.local");
}

export async function callOpenAiJson(messages: ChatMessage[]): Promise<Record<string, unknown>> {
  const { apiKey, baseUrl, model } = resolveProvider();

  const res = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.6,
      // Replies are capped at 1-2 short sentences by the prompt — 180 tokens
      // comfortably covers that plus the JSON scaffolding (stage/intent/
      // slots/etc), and asking the model to generate fewer tokens is itself
      // part of what keeps the "thinking" pause short.
      max_tokens: 180,
      // JSON mode: the model returns exactly one structured object (reply +
      // stage + intent + emotion + slots) in a single round-trip, instead of
      // a separate call per classification — that's what keeps latency and
      // token cost down turn after turn. Groq and OpenAI both support this
      // the same way.
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM request failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM returned no content");

  try {
    return JSON.parse(content);
  } catch {
    throw new Error(`LLM returned non-JSON content: ${content}`);
  }
}
