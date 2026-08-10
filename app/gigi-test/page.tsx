"use client";

// Temporary, unpolished text-only test harness for Gigi's tool-calling
// engine (app/api/gigi/route.ts). Not linked from nav — visit directly.
import { useState } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export default function GigiTestPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/gigi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          conversationHistory: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply ?? "(no reply)" }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Request failed — check the console." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: "40px auto", padding: 16, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Gigi test (text-only)</h1>

      <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, minHeight: 300, marginBottom: 12 }}>
        {messages.length === 0 && <p style={{ color: "#888", fontSize: 14 }}>Try: "add a lead named Ravi, phone 9876543210"</p>}
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 8, textAlign: m.role === "user" ? "right" : "left" }}>
            <span
              style={{
                display: "inline-block",
                padding: "6px 10px",
                borderRadius: 8,
                background: m.role === "user" ? "#1A4F8A" : "#f0f0f0",
                color: m.role === "user" ? "#fff" : "#111",
                fontSize: 14,
                maxWidth: "80%",
              }}
            >
              {m.content}
            </span>
          </div>
        ))}
        {busy && <p style={{ color: "#888", fontSize: 14 }}>Gigi is thinking…</p>}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Type a message…"
          style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: "1px solid #ccc", fontSize: 14 }}
        />
        <button
          onClick={send}
          disabled={busy}
          style={{ padding: "8px 16px", borderRadius: 6, background: "#1A4F8A", color: "#fff", border: "none", fontSize: 14 }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
