// ⏸ PAUSED (not abandoned): blocked on ElevenLabs paid-plan access to the
// library-voice API this pipeline needs for TTS. Intentionally left intact,
// wired, and untouched so work can resume the moment that's unblocked —
// this is a deliberate hold, not orphaned/forgotten code. If you're a
// future session picking this up: nothing here is broken, it's just
// waiting on that external dependency.
//
// Standalone POC: real-time streaming voice pipeline (Twilio Media Stream
// -> Deepgram STT -> Groq LLM -> ElevenLabs TTS -> back to Twilio).
//
// Deliberately NOT a Next.js API route — Next's route handlers are plain
// HTTP request/response and can't take over a raw WebSocket `upgrade`, and
// a Twilio Media Stream needs a socket that stays open for the whole call.
// This is a separate Node process with its own `ws` server, completely
// independent of the existing Gather/Say call flow (call-twiml/route.ts,
// call-response/route.ts) — nothing here is wired into that path.
//
// SCOPE: this proves the pipeline works and measures per-stage latency via
// the console logs below. It deliberately does NOT implement barge-in/
// interruption handling, lead scoring, CRM lookups, the scripted Hindi
// fast-path opener, or error-fallback TwiML — those are later phases.
//
// ── Running this ──────────────────────────────────────────────────────
//   npm run stream-server
// (loads .env.local via Node's --env-file flag — see the "stream-server"
// script in package.json. Needs Node 20.6+ for --env-file; this repo is on
// Node 24, so that's already covered.)
//
// ── Exposing it to a real Twilio call ─────────────────────────────────
// Twilio needs a PUBLIC wss:// URL — localhost won't work. This server is
// intentionally on its own port (MEDIA_STREAM_PORT, default 8081),
// separate from the main Next.js dev server's port 3000 / existing ngrok
// tunnel, so testing this never touches the production call flow's
// tunnel. In a second terminal:
//   ngrok http 8081
// Then set in .env.local:
//   MEDIA_STREAM_WS_URL=wss://<that-ngrok-subdomain>/media-stream
// and point a test call's TwiML `url` at /api/call-stream-twiml instead of
// /api/call-twiml.

import { createServer } from "http";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { streamGroqChat, type ChatMessage } from "../lib/calling/streamingGroq";
import { streamElevenLabsTts } from "../lib/calling/streamingTts";

const PORT = Number(process.env.MEDIA_STREAM_PORT || 8081);
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

if (!DEEPGRAM_API_KEY) {
  console.error("[media-stream-server] DEEPGRAM_API_KEY not set — add it to .env.local and restart.");
  process.exit(1);
}
if (!process.env.GROQ_API_KEY) {
  console.error("[media-stream-server] GROQ_API_KEY not set — add it to .env.local and restart.");
  process.exit(1);
}
if (!process.env.ELEVENLABS_API_KEY) {
  console.error("[media-stream-server] ELEVENLABS_API_KEY not set — add it to .env.local and restart.");
  process.exit(1);
}

// Single hardcoded system prompt for this POC — real prompt engineering
// (persona, company context, CRM data) is a later phase, not this one.
// const SYSTEM_PROMPT =
//   "You are a helpful assistant. Respond briefly (1-2 sentences) in Hindi/Hinglish, matching whatever mix of Hindi and English the caller used.";

const SYSTEM_PROMPT = `You are Kajal, a friendly telecalling executive at Omkar Power Solutions, a solar EPC company. You are calling a potential customer who enquired about solar panels.

YOUR GOAL: Get exactly two pieces of information — (1) their city/area, and (2) their average monthly electricity bill (or units consumed) — then close the call by telling them our team will reach out with a personalized quote.

RULES — follow strictly:
- You have already greeted the caller once at the start of this call — do NOT reintroduce yourself or greet again on later turns. Stay consistent: your name is always Kajal, never anything else.
- Speak casual, natural Hinglish the way a real telecaller in Mumbai actually talks — mix English words naturally into Hindi sentences (e.g. "Thank you sir, hum jaldi contact karenge" not formal Sanskritized Hindi like "aapka din shubh rahe"). Avoid overly formal or literary Hindi phrasing entirely — keep it conversational and warm, like a real phone call, not a script being read aloud.
- Keep every response to 1 short sentence. This is a phone call, not a chat — be brief and natural, like a real telecaller, not an assistant explaining things.
- Start with a warm, brief greeting and introduce yourself and the company in your very first line, casual style — e.g. "Hii, main Kajal bol rahi hoon Omkar Power Solutions se, aapne solar ke baare mein enquiry kiya tha na?"
- Ask for city/area FIRST. Once given, ask for their average monthly electricity bill (or units consumed) NEXT.
- Do NOT ask about roof type, roof size, household size, appliance load, shading, or any other technical detail — those are covered later during an in-person site visit, not this call.
- If the caller asks a pricing or technical question you don't have specifics for, don't guess — just say our team will explain everything in detail when they call back.
- Once you have BOTH city and electricity bill, immediately close the call: thank them, confirm our team will call them back shortly with a quote, and end warmly, casual style — e.g. "Thank you sir, hum jaldi aapko contact karenge quote ke saath!" Do not keep the conversation going after this.
- If the caller is not interested, or asks to not be called, acknowledge politely and end the call — don't push.
- Target: close this call in 4-6 exchanges total, not more.`;

function ts(): string {
  return new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
}

// Natural-sounding filler lines for when Groq returns an empty response
// (e.g. it burns its whole token budget on hidden reasoning) — spoken
// instead of dead air, picked at random so it doesn't sound scripted.
const FALLBACK_FILLERS = ["Sorry, ek second...", "Haan bataiye?", "Maaf kijiye, phir se boliye?"];

function pickFallbackFiller(): string {
  return FALLBACK_FILLERS[Math.floor(Math.random() * FALLBACK_FILLERS.length)];
}

// Keep system message + last N exchanges (user+assistant pairs) so token
// usage doesn't grow unbounded on a long call — same discipline as Gigi's
// fullHistory.slice(-8) trimming (lib/gigi/groq.ts's caller), just a higher
// cap since a call has no widget-side history to also fall back on.
const MAX_HISTORY_EXCHANGES = 12;

// Mutates `history` in place: appends `message`, then trims down to the
// system message (index 0) plus the most recent MAX_HISTORY_EXCHANGES*2
// messages, dropping the oldest exchanges first.
function appendToHistory(history: ChatMessage[], message: ChatMessage): void {
  history.push(message);
  const maxRest = MAX_HISTORY_EXCHANGES * 2;
  const excess = history.length - 1 - maxRest;
  if (excess > 0) history.splice(1, excess);
}

const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer, path: "/media-stream" });

wss.on("connection", (twilioWs) => {
  console.log(`[${ts()}] [twilio] connected`);

  let streamSid: string | null = null;
  let callSid: string | null = null;
  let firstAudioReceived = false;
  let firstAudioSentBack = false;

  // Per-connection conversation history — one array per call, scoped to
  // this closure, never shared across calls. Seeded with just the system
  // message; each turn appends the user utterance and the assistant's
  // reply so later turns have full context instead of starting fresh.
  const conversationHistory: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];

  // ── Deepgram real-time STT connection, one per call ──────────────────
  // language=multi enables Nova-2's multilingual code-switching (needed
  // for Hindi/English mixing). NOTE: per Deepgram's current docs, Nova-3
  // has meaningfully better Hindi/Hinglish code-switching accuracy than
  // Nova-2 — this uses Nova-2 per the brief, but swap the model param to
  // nova-3 here if transcript quality turns out to be the bottleneck.
  const dgUrl =
    "wss://api.deepgram.com/v1/listen" +
    "?model=nova-2&language=multi&encoding=mulaw&sample_rate=8000&channels=1" +
    "&punctuate=true&interim_results=true&endpointing=300";
  const dgWs = new WebSocket(dgUrl, { headers: { Authorization: `Token ${DEEPGRAM_API_KEY}` } });

  let dgReady = false;
  const pendingAudio: Buffer[] = []; // audio that arrives before Deepgram's socket is open

  dgWs.on("open", () => {
    dgReady = true;
    console.log(`[${ts()}] [deepgram] connected`);
    for (const chunk of pendingAudio.splice(0)) dgWs.send(chunk);
  });

  dgWs.on("message", (data: RawData) => {
    let msg: any;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (msg.type !== "Results") return;
    const transcript: string | undefined = msg.channel?.alternatives?.[0]?.transcript?.trim();
    if (!transcript) return;
    if (!msg.is_final) return; // only act on finalized chunks — interim results are just for live captions, not used here

    console.log(`[${ts()}] [stt] final transcript: "${transcript}"`);
    handleFinalTranscript(transcript).catch((err) => {
      console.error(`[${ts()}] [pipeline] error handling transcript`, err);
    });
  });

  dgWs.on("error", (err) => console.error(`[${ts()}] [deepgram] error`, err));
  dgWs.on("close", () => console.log(`[${ts()}] [deepgram] closed`));

  // ── LLM -> TTS -> Twilio for one finalized transcript ─────────────────
  async function handleFinalTranscript(userText: string) {
    const llmStart = Date.now();
    console.log(`[${ts()}] [llm] request start`);

    appendToHistory(conversationHistory, { role: "user", content: userText });

    let sentenceBuffer = "";
    let firstTtsChunkKicked = false;

    const flushSentence = async (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      const ttsStart = Date.now();
      console.log(`[${ts()}] [tts] request start: "${text}"`);
      try {
        await streamElevenLabsTts(text, (audioChunk) => {
          if (!firstTtsChunkKicked) {
            firstTtsChunkKicked = true;
            console.log(`[${ts()}] [tts] first byte (+${Date.now() - ttsStart}ms)`);
          }
          sendAudioToTwilio(audioChunk);
        });
      } catch (err) {
        console.error(`[${ts()}] [tts] error`, err);
      }
    };

    try {
      const fullReply = await streamGroqChat(conversationHistory, async (delta) => {
        sentenceBuffer += delta;
        // Flush on a sentence-ish boundary (Hindi/Devanagari full stop
        // included) so TTS can start speaking before the whole reply has
        // finished generating, instead of waiting for the complete text.
        const boundary = /[.!?।\n]/.exec(sentenceBuffer);
        if (boundary && boundary.index > 2) {
          const sentence = sentenceBuffer.slice(0, boundary.index + 1);
          sentenceBuffer = sentenceBuffer.slice(boundary.index + 1);
          await flushSentence(sentence);
        }
      });
      await flushSentence(sentenceBuffer); // whatever's left after the stream ends

      let replyForHistory = fullReply;
      if (!fullReply.trim()) {
        // Safety net: never let a turn produce total silence, even if Part
        // 2's extra headroom makes this rare. Speak a natural filler
        // instead of a robotic error or dead air, and record THAT (not the
        // empty string) as this turn's assistant message so history stays
        // coherent.
        const filler = pickFallbackFiller();
        console.warn(`[${ts()}] [llm] empty response — using fallback filler: "${filler}"`);
        await flushSentence(filler);
        replyForHistory = filler;
      }

      appendToHistory(conversationHistory, { role: "assistant", content: replyForHistory });
      console.log(`[${ts()}] [llm] response end (+${Date.now() - llmStart}ms total)`);
    } catch (err) {
      console.error(`[${ts()}] [llm] error`, err);
    }
  }

  function sendAudioToTwilio(mulawChunk: Buffer) {
    if (!streamSid || twilioWs.readyState !== WebSocket.OPEN) return;
    if (!firstAudioSentBack) {
      firstAudioSentBack = true;
      console.log(`[${ts()}] [twilio] first audio chunk sent back`);
    }
    twilioWs.send(
      JSON.stringify({
        event: "media",
        streamSid,
        media: { payload: mulawChunk.toString("base64") },
      }),
    );
  }

  // ── Inbound Twilio Media Stream events ────────────────────────────────
  twilioWs.on("message", (raw: RawData) => {
    let msg: any;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.event) {
      case "start":
        streamSid = msg.start?.streamSid ?? null;
        callSid = msg.start?.callSid ?? null;
        console.log(`[${ts()}] [twilio] stream started callSid=${callSid} streamSid=${streamSid}`);
        break;

      case "media": {
        if (!firstAudioReceived) {
          firstAudioReceived = true;
          console.log(`[${ts()}] [twilio] audio received (first chunk)`);
        }
        const audio = Buffer.from(msg.media.payload, "base64");
        if (dgReady) dgWs.send(audio);
        else pendingAudio.push(audio);
        break;
      }

      case "stop":
        console.log(`[${ts()}] [twilio] stream stopped`);
        dgWs.close();
        break;
    }
  });

  twilioWs.on("close", () => {
    console.log(`[${ts()}] [twilio] disconnected`);
    if (dgWs.readyState === WebSocket.OPEN) dgWs.close();
  });
  twilioWs.on("error", (err) => console.error(`[${ts()}] [twilio] error`, err));
});

httpServer.listen(PORT, () => {
  console.log(`[media-stream-server] listening on ws://localhost:${PORT}/media-stream`);
  console.log("[media-stream-server] expose this publicly (e.g. `ngrok http " + PORT + "`) and set");
  console.log("[media-stream-server] MEDIA_STREAM_WS_URL=wss://<subdomain>/media-stream in .env.local before testing a real call");
});
