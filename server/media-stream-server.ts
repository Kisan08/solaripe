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
import twilio from "twilio";
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
if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
  console.error("[media-stream-server] TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN not set — add them to .env.local and restart.");
  process.exit(1);
}

// Same client construction as app/api/make-call/route.ts — used here only
// to actively hang up (calls(sid).update({status:"completed"})) once the
// AI's closing message has been spoken, instead of leaving the call open
// to keep listening and re-triggering the same closing line forever.
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Single hardcoded system prompt for this POC — real prompt engineering
// (persona, company context, CRM data) is a later phase, not this one.
// const SYSTEM_PROMPT =
//   "You are a helpful assistant. Respond briefly (1-2 sentences) in Hindi/Hinglish, matching whatever mix of Hindi and English the caller used.";

// Kept deliberately tight (not just terse for its own sake): a longer,
// more elaborate version of this prompt was directly implicated in the
// empty-response bug during diagnosis — the exact same conversation shape
// (this model's scripted-greeting-then-short-caller-reply pattern, e.g.
// "Mumbai.") failed close to 100% of the time with the old, longer
// prompt, and roughly half as often once trimmed to this length. See
// runLlmTurn/handleFinalTranscript below for the retry + fallback filler
// that still catches the remainder — trimming this prompt measurably
// helps but does not fully eliminate what looks like a Groq-side
// streaming defect for this model.
const SYSTEM_PROMPT = `You are काजल, a friendly telecalling executive at Omkar Power Solutions, a solar EPC company, calling a potential customer who enquired about solar panels.

Goal: get their city/area, then their average monthly electricity bill (or units), then close the call saying the team will follow up with a personalized quote.

Rules: Already greeted the caller once (scripted, before this conversation) — don't re-greet. Name always काजल. Write ALL Hindi words in Devanagari (मैं, आप, कैसे, बात, करना), never romanized (not "main", "aap", "kaise", "baat"); only casual English words (sir, city, solar, thank you) stay Roman, every reply, all call long — e.g. "मैं काजल बोल रही हूँ Omkar Power Solutions से" or "आपका area या city क्या है?" Never formal/Sanskritized Hindi (not "आपका दिन शुभ रहे"). One short sentence per reply. Skip technical details (roof, appliances, shading) — that's for the site visit. Don't guess on pricing — say the team will explain later. Once you have city + bill, or if they're not interested, close right away and stop — e.g. "Thank you sir, हम जल्दी आपको contact करेंगे quote के साथ! [END_CALL]" — always end that final closing message with [END_CALL] right after the sentence, a silent signal never spoken aloud, only on that one final message, nowhere else. Close in 4-6 exchanges total.`;

// Scripted opening line, spoken immediately on call connect instead of
// waiting for the caller's first word (Part 2) — faster and more reliable
// than asking the LLM to generate turn 1 live. All Hindi words spelled in
// Devanagari, matching SYSTEM_PROMPT's rule for every other turn — only
// the English loanwords (Omkar Power Solutions, solar, city, area) stay
// Roman, same mixing pattern as the prompt's own example sentences.
const OPENING_GREETING =
  "नमस्ते! मैं काजल बोल रही हूँ Omkar Power Solutions से, आपने solar के बारे में enquiry किया था ना? आपका city या area क्या है?";

function ts(): string {
  return new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
}

// Machine-only end-of-call signal the LLM is instructed (SYSTEM_PROMPT) to
// append once, right after its closing message. Two separate regexes on
// purpose: END_CALL_DETECT has no "g" flag so repeated .test() calls are
// always evaluated fresh (a shared global-flag regex's .test() mutates
// lastIndex across calls and silently alternates true/false — the classic
// footgun); END_CALL_STRIP's "g" flag is fine because .replace() resets
// lastIndex itself before running, so state doesn't leak between calls.
const END_CALL_DETECT = /\[END_CALL\]/i;
const END_CALL_STRIP = /\s*\[END_CALL\]\s*/gi;

function stripEndCallMarker(text: string): string {
  return text.replace(END_CALL_STRIP, " ").trim();
}

// Natural-sounding filler lines for when Groq returns an empty response
// even after a retry (see SYSTEM_PROMPT's comment and handleFinalTranscript
// for the diagnosis) — spoken instead of dead air, picked at random so it
// doesn't sound scripted.
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

  // Guards against overlapping turns: Deepgram's endpointing can emit more
  // than one is_final Results message in quick succession for what's
  // really one utterance, which used to fire concurrent Groq requests for
  // the same call and could interleave conversationHistory writes out of
  // order (see handleFinalTranscript below). A final transcript that
  // arrives while the previous turn is still in flight is dropped rather
  // than starting a second overlapping request.
  let turnInFlight = false;

  // Per-connection conversation history — one array per call, scoped to
  // this closure, never shared across calls. Seeded with just the system
  // message; the scripted opening greeting is appended as soon as it's
  // spoken (see speakOpeningGreeting), then each turn appends the user
  // utterance and the assistant's reply so later turns have full context.
  const conversationHistory: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];

  // Shared TTS-speaking helper — used both for the scripted opening
  // greeting and for each LLM turn's sentences, each call getting its own
  // firstTtsChunkKicked so the "first byte" latency log is timed per
  // utterance, not once for the whole call.
  function makeSentenceSpeaker() {
    let firstTtsChunkKicked = false;
    return async function flushSentence(raw: string) {
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
  }

  // Part 2: speak the opening line immediately on call connect instead of
  // waiting for the caller's first word — a scripted line for speed/
  // reliability rather than an LLM turn (see OPENING_GREETING). Recorded
  // into history as this call's first assistant turn so later LLM turns
  // know it already happened (SYSTEM_PROMPT's "already greeted" rule).
  async function speakOpeningGreeting() {
    // Also covered by turnInFlight: if the caller starts talking before
    // this finishes, that first transcript gets dropped by
    // handleFinalTranscript's guard rather than racing this greeting's
    // own appendToHistory call. Barge-in handling is out of scope for
    // this POC (see file header) — the caller just repeats themselves.
    turnInFlight = true;
    console.log(`[${ts()}] [llm] speaking scripted opening greeting`);
    try {
      const flushSentence = makeSentenceSpeaker();
      await flushSentence(OPENING_GREETING);
      appendToHistory(conversationHistory, { role: "assistant", content: OPENING_GREETING });
    } finally {
      turnInFlight = false;
    }
  }

  // ── Deepgram real-time STT connection, one per call ──────────────────
  // model=nova-3 (was nova-2): confirmed against Deepgram's current docs
  // that nova-3 supports language=multi for the same Hindi/English
  // code-switching this pipeline needs (Deepgram's multilingual
  // code-switching page explicitly lists Hindi among nova-3's supported
  // languages for `multi`) — this param carries over unchanged. Also
  // switched endpointing 300 -> 100: Deepgram's own code-switching guide
  // specifically recommends endpointing=100 for this scenario, which
  // wasn't being followed before.
  const dgUrl =
    "wss://api.deepgram.com/v1/listen" +
    "?model=nova-3&language=multi&encoding=mulaw&sample_rate=8000&channels=1" +
    "&punctuate=true&interim_results=true&endpointing=100";
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

  // Runs one Groq turn against the given history and speaks it via TTS as
  // it streams, returning the full accumulated text (marker stripped) and
  // whether SYSTEM_PROMPT's [END_CALL] signal was present. Factored out
  // of handleFinalTranscript so a genuinely empty response can be retried
  // once with a fresh request before falling back to a filler line — see
  // handleFinalTranscript for why that retry is worth doing.
  //
  // The marker is stripped from every per-sentence chunk BEFORE it's
  // handed to TTS, not just from the leftover buffer after streaming
  // ends — the model could in principle emit "...quote ke saath [END_CALL]!"
  // with the marker before the closing punctuation, which would otherwise
  // flush it straight to speech as literal bracket text.
  async function runLlmTurn(): Promise<{ reply: string; endCall: boolean }> {
    let sentenceBuffer = "";
    let endCall = false;
    const flushSentence = makeSentenceSpeaker();

    const speakCleaned = async (raw: string) => {
      if (END_CALL_DETECT.test(raw)) endCall = true;
      const cleaned = stripEndCallMarker(raw);
      if (cleaned) await flushSentence(cleaned);
    };

    const fullReplyRaw = await streamGroqChat(conversationHistory, async (delta) => {
      sentenceBuffer += delta;
      // Flush on a sentence-ish boundary (Hindi/Devanagari full stop
      // included) so TTS can start speaking before the whole reply has
      // finished generating, instead of waiting for the complete text.
      const boundary = /[.!?।\n]/.exec(sentenceBuffer);
      if (boundary && boundary.index > 2) {
        const sentence = sentenceBuffer.slice(0, boundary.index + 1);
        sentenceBuffer = sentenceBuffer.slice(boundary.index + 1);
        await speakCleaned(sentence);
      }
    });
    await speakCleaned(sentenceBuffer); // whatever's left after the stream ends

    return { reply: stripEndCallMarker(fullReplyRaw), endCall: endCall || END_CALL_DETECT.test(fullReplyRaw) };
  }

  // ── LLM -> TTS -> Twilio for one finalized transcript ─────────────────
  async function handleFinalTranscript(userText: string) {
    if (turnInFlight) {
      // Deepgram fired another is_final while the previous turn was still
      // running — almost certainly the same utterance split into two
      // finalized segments, not a genuinely new one. Dropping it (rather
      // than firing a second concurrent Groq request for the same call)
      // avoids one contributor to the empty-response bug below; the
      // dominant one turned out to be SYSTEM_PROMPT length (see its
      // comment), not overlapping requests, but this guard is cheap
      // correctness regardless and also prevents conversationHistory
      // from being mutated out of order by two turns running at once.
      console.warn(`[${ts()}] [pipeline] dropping transcript, turn already in flight: "${userText}"`);
      return;
    }
    turnInFlight = true;

    const llmStart = Date.now();
    console.log(`[${ts()}] [llm] request start`);

    appendToHistory(conversationHistory, { role: "user", content: userText });

    try {
      let { reply: fullReply, endCall } = await runLlmTurn();

      if (!fullReply.trim()) {
        // A genuinely empty response (finish_reason never even arrived,
        // not a token-budget "length" truncation — see diagnosis notes on
        // streamGroqChat) reliably succeeded on a fresh retry during
        // testing, so try once more before resorting to a filler.
        console.warn(`[${ts()}] [llm] empty response, retrying once`);
        ({ reply: fullReply, endCall } = await runLlmTurn());
      }

      let replyForHistory = fullReply;
      if (!fullReply.trim()) {
        // Safety net: never let a turn produce total silence, even after
        // the retry above. Speak a natural filler instead of a robotic
        // error or dead air, and record THAT (not the empty string) as
        // this turn's assistant message so history stays coherent.
        const filler = pickFallbackFiller();
        const flushSentence = makeSentenceSpeaker();
        console.warn(`[${ts()}] [llm] still empty after retry — using fallback filler: "${filler}"`);
        await flushSentence(filler);
        replyForHistory = filler;
        endCall = false; // never hang up on a filler turn — nothing was actually closed
      }

      appendToHistory(conversationHistory, { role: "assistant", content: replyForHistory });
      console.log(`[${ts()}] [llm] response end (+${Date.now() - llmStart}ms total)`);

      if (endCall) {
        // Don't await inside the try/finally below — turnInFlight should
        // clear immediately once speaking is done, not stay held for the
        // few extra seconds the hangup takes.
        endCallSoon();
      }
    } catch (err) {
      console.error(`[${ts()}] [llm] error`, err);
    } finally {
      turnInFlight = false;
    }
  }

  // Part 1: actively hang up via Twilio's REST API once the AI's closing
  // message has finished being spoken, instead of leaving the WebSocket
  // open to keep listening and re-triggering the same closing line on
  // every subsequent utterance. Guarded so it only ever fires once even
  // if [END_CALL] somehow shows up on more than one turn.
  let callEnded = false;
  async function endCallSoon() {
    if (callEnded) return;
    callEnded = true;
    if (!callSid) {
      console.warn(`[${ts()}] [twilio] end-call requested but no callSid captured yet — skipping hangup`);
      return;
    }
    // Sending the last audio chunk over the media WebSocket only means
    // Twilio has received the bytes, not that the caller has finished
    // hearing them play out over the phone line — a short grace period
    // avoids cutting the closing sentence off mid-word.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      console.log(`[${ts()}] [twilio] ending call ${callSid} after closing message`);
      await twilioClient.calls(callSid).update({ status: "completed" });
    } catch (err) {
      console.error(`[${ts()}] [twilio] failed to end call ${callSid}`, err);
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
        // Part 2: greet immediately, don't wait for the caller's first
        // word — sendAudioToTwilio needs streamSid, which is set above.
        speakOpeningGreeting().catch((err) => {
          console.error(`[${ts()}] [pipeline] error speaking opening greeting`, err);
        });
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
