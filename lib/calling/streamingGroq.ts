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
      // 350 (up from 200): more headroom for hidden reasoning + actual
      // visible content on inputs that need more reasoning tokens, on top
      // of the reasoning_effort floor below.
      max_tokens: 350,
      // gpt-oss models spend part of max_tokens on hidden reasoning before
      // any visible content. Per Groq's docs, "low" is the lowest
      // reasoning_effort this model supports — "minimal"/"none" aren't
      // available for gpt-oss (only for Qwen 3 32B) — so this is already
      // the most headroom-favoring setting available; nothing lower to
      // switch to.
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
