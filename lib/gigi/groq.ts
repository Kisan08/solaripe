// Thin fetch-based Groq tool-calling client for Gigi (app/api/gigi/route.ts).
// Deliberately a NEW, separate file from lib/calling/openai.ts — that one
// is used by the live production call flow (call-response/route.ts) and
// only supports a single non-streaming JSON-mode response, no
// tools/function-calling. Reusing it here would mean either changing its
// signature (risking the production call flow) or bolting tool-calling
// onto a function that was never designed for it. Same "thin fetch, no
// provider SDK" philosophy as that file, just for a different API shape.

export interface GigiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: GigiToolCall[];
  tool_call_id?: string;
}

export interface GigiToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface GigiTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

interface GroqChatResponse {
  choices: Array<{ message: GigiMessage }>;
}

// Llama models served via Groq occasionally emit a tool call as this
// inline textual pattern inside `content` instead of populating the
// structured `tool_calls` field (a leftover of Llama's own prompt-format
// convention for function calling). When that happens, app/api/gigi/route.ts
// would otherwise treat `content` as the final reply and both display AND
// speak the raw tag. Converting it into a real tool_calls entry here means
// the rest of the pipeline never has to know the difference.
const INLINE_FUNCTION_CALL_RE = /<function=([a-zA-Z_][\w]*)>([\s\S]*?)<\/function>/;

function extractInlineFunctionCall(message: GigiMessage): GigiMessage {
  if ((message.tool_calls?.length ?? 0) > 0 || !message.content) return message;

  const match = message.content.match(INLINE_FUNCTION_CALL_RE);
  if (!match) return message;

  const [fullMatch, name, argsText] = match;
  const remaining = message.content.replace(fullMatch, "").trim();

  return {
    ...message,
    content: remaining || null,
    tool_calls: [{ id: `inline-${Date.now()}`, type: "function", function: { name, arguments: argsText.trim() } }],
  };
}

// Belt-and-suspenders: strips any stray tool-call-shaped text that slips
// through into text about to reach the user (displayed AND spoken).
export function stripToolCallSyntax(text: string | null | undefined): string | null {
  if (!text) return text ?? null;
  return text.replace(INLINE_FUNCTION_CALL_RE, "").trim() || null;
}

// tools omitted (or empty) => a plain completion, still going through the
// same function so both the tool-call turn and the natural-language
// follow-up turn share one code path.
export async function callGroqWithTools(
  messages: GigiMessage[],
  tools?: GigiTool[],
): Promise<GigiMessage> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b",
      messages,
      ...(tools && tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
      // Lower than the call flow's 0.6 — tool-calling benefits from more
      // deterministic argument extraction than a conversational reply does.
      temperature: 0.3,
      max_tokens: 400,
    }),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(`Groq request failed: ${res.status} ${bodyText}`);
  }

  const json = (await res.json()) as GroqChatResponse;
  const message = json.choices?.[0]?.message;
  if (!message) throw new Error("Groq returned no message");
  return extractInlineFunctionCall(message);
}
