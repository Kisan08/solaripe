// Thin fetch-based STREAMING Groq client for the real-time voice pipeline
// POC (server/media-stream-server.ts). Separate from lib/calling/openai.ts,
// which returns one complete JSON object and backs the existing Gather/Say
// call flow — do not merge these. This one reads Groq's OpenAI-compatible
// SSE stream and invokes onToken for each text delta as it arrives, so
// downstream TTS can start speaking before the full reply has generated.
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function streamGroqChat(
  messages: ChatMessage[],
  onToken: (delta: string) => void | Promise<void>,
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-20b",
      messages,
      temperature: 0.6,
      // Headroom for hidden reasoning + visible content. NOTE on the
      // empty-response bug this was originally raised to fix: live
      // diagnosis (dumping raw SSE chunks, checking delta.reasoning and
      // finish_reason) showed it is NOT a token-budget problem — failing
      // turns finish_reason is always null (the stream just stops after a
      // tiny, ~20-30 char reasoning chunk, never "length"), and it
      // reproduces identically at max_tokens 350 or 500 and at every
      // reasoning_effort level (low/medium/default all fail similarly).
      // The dominant factor turned out to be SYSTEM_PROMPT length in the
      // caller (server/media-stream-server.ts) — see that file's comment.
      // Left at 350 since it's not the actual lever, and there's no
      // reason to shrink it back down either.
      max_tokens: 350,
      // Per Groq's docs, "low" is the lowest reasoning_effort this model
      // supports ("minimal"/"none" exist only for Qwen 3 32B). Confirmed
      // via testing this doesn't meaningfully change the empty-response
      // rate either way (see max_tokens comment above) — kept at "low"
      // since it's at least the fastest/cheapest option among ones that
      // are equally exposed to the bug.
      reasoning_effort: "low",
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(`Groq stream request failed: ${res.status} ${bodyText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // keep the last (possibly incomplete) line for next chunk

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload);
        const delta: string | undefined = json.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          await onToken(delta);
        }
      } catch {
        // Malformed/partial SSE line — the next chunk completes it, so just skip.
      }
    }
  }

  return full;
}
