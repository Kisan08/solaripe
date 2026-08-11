"use client";

// Floating chat entry point for Gigi (app/api/gigi/route.ts), mounted once
// globally in AppShell so it's available on every authenticated page.
// Positioned above BottomNav's z-40 fixed bar, and lifted clear of it on
// mobile (bottom-20) since BottomNav is only hidden at md: and up.
//
// Voice is purely front-end here: browser SpeechRecognition transcribes
// into the SAME send() the text input uses, and SpeechSynthesis reads
// Gigi's reply back. Nothing about /api/gigi or lib/gigi/tools.ts changes —
// this is placeholder-quality browser TTS/STT, not the ElevenLabs/Deepgram
// pipeline used by the real calling flow.
import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Mic, Volume2, VolumeX, Ear, EarOff, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// webkitSpeechRecognition/SpeechRecognition aren't in TS's default DOM lib —
// kept loosely typed rather than pulling in a third-party types package for
// a Chrome-only, feature-detected API.
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  return (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null;
}

const WAKE_STORAGE_KEY = "gigi-wake-enabled";

// Loose, case-insensitive match — Chrome's STT has been observed mishearing
// "Gigi" as "Jiji" in real testing, so this covers known variants rather
// than requiring an exact "hey gigi".
const WAKE_PATTERNS = ["hey gigi", "hey jiji", "hey g g", "hey g", "a gigi", "ok gigi", "okay gigi", "hey giggy"];

function matchWakeWord(lowerTranscript: string): { matched: boolean; endIndex: number } {
  for (const pattern of WAKE_PATTERNS) {
    const idx = lowerTranscript.indexOf(pattern);
    if (idx !== -1) return { matched: true, endIndex: idx + pattern.length };
  }
  return { matched: false, endIndex: -1 };
}

// Guards against a real, reproduced bug: right at the "hey gigi" boundary,
// Chrome sometimes finalizes a short trailing breath/filler sound (e.g.
// "i.") as part of/right after the wake phrase's own segment, which would
// otherwise get auto-sent to /api/gigi as if it were the actual command.
const MIN_COMMAND_CHARS = 4;
const FILLER_WORDS = new Set([
  "i", "um", "uh", "uhh", "umm", "hmm", "huh", "the", "a", "and", "so", "yeah", "ok", "okay",
]);
// A grace window right after entering active-listening mode (whether via
// wake-word detection or the manual mic button) during which even a
// final result has to look like a real, substantive phrase before it's
// accepted — filters the spurious short tail fragment without waiting on
// an artificial delay before recognition can start capturing at all.
const ACTIVE_MODE_SETTLE_MS = 300;

function isViableCommand(text: string, msSinceActiveModeStarted: number): boolean {
  const cleaned = text.trim().replace(/[.,!?]+$/g, "");
  if (!cleaned) return false;
  if (cleaned.length < MIN_COMMAND_CHARS) return false;
  if (FILLER_WORDS.has(cleaned.toLowerCase())) return false;
  if (msSinceActiveModeStarted < ACTIVE_MODE_SETTLE_MS) return false;
  return true;
}

type MicMode = "active" | "wake";
type VoiceState = "off" | "wake" | "active" | "thinking" | "speaking";

export function GigiWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [micMode, setMicMode] = useState<MicMode | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [speakEnabled, setSpeakEnabled] = useState(true);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [synthesisSupported, setSynthesisSupported] = useState(false);
  const [wakeEnabled, setWakeEnabled] = useState(false);
  const [voiceOutputFailed, setVoiceOutputFailed] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Whether recognition SHOULD keep running — checked in onend to decide
  // whether Chrome's early stop (it fires onend on brief pauses even with
  // continuous=true) should be silently restarted, vs. a real stop.
  const keepListeningRef = useRef(false);
  const modeRef = useRef<MicMode>("active");
  const commandBufferRef = useRef("");
  // Which result index (within the current continuous session) first
  // matched the wake word, and the character offset right after it — used
  // to re-derive the command text each time Chrome re-fires that SAME
  // result as it finalizes, instead of naively concatenating and ending up
  // with "hey gigi" duplicated into the command sent to /api/gigi.
  const wakeResultIndexRef = useRef(-1);
  const wakeEndOffsetRef = useRef(0);
  // SpeechRecognition result indices RESET to 0 every time .start() is
  // called on an instance, even when we're internally restarting the SAME
  // JS object after Chrome's onend auto-stop (e.g. from the pause right
  // after saying "hey gigi"). Without this generation guard, a stale
  // wakeResultIndexRef (say, 0, from the pre-restart session) could
  // coincidentally match the RESTARTED session's own index-0 result — the
  // user's actual real command — causing it to be mis-treated as "the
  // wake phrase's own result re-finalizing" and sliced/mangled using the
  // old wake-word offset. Bumped every real .start() call; a wake-word
  // match is only honored as "the same result" if the generation also
  // matches.
  const sessionGenerationRef = useRef(0);
  const wakeResultGenerationRef = useRef(-1);
  // Timestamp active-listening mode was entered (manual mic click, or the
  // moment "hey gigi" was detected) — used by isViableCommand()'s settle
  // window, see its comment above.
  const activeModeEnteredAtRef = useRef(0);
  const wakeEnabledRef = useRef(false);
  // The wake-word recognition session is armed once from the mount effect
  // (and re-arms itself imperatively from within send()'s own closure
  // chain afterward) — a plain `messages` read in send() would stay frozen
  // at whatever it was when that closure chain was first created (empty,
  // at mount), silently sending truncated history on every wake-triggered
  // turn even though the UI itself renders the full, correct history from
  // live state. Mirroring messages into a ref keeps send() reading the
  // ACTUAL latest conversation regardless of which stale closure calls it.
  const messagesRef = useRef<ChatMessage[]>([]);
  // iOS Safari can return an empty getVoices() list until 'voiceschanged'
  // fires (sometimes not until well after mount) — cache the list from
  // that event instead of re-querying at speak-time, where it may still be
  // empty on first use.
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  // iOS Safari also requires speak() to happen inside (or very soon after)
  // a direct user-gesture call stack the FIRST time, or it silently drops
  // it — later async speak() calls (e.g. after a fetch resolves) work fine
  // once one real utterance has gone through inside a gesture handler.
  // This one-time "priming" utterance (empty text, silent) unlocks that.
  const speechPrimedRef = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    setVoiceSupported(getSpeechRecognitionCtor() !== null);
    const hasSynthesis = typeof window !== "undefined" && "speechSynthesis" in window;
    setSynthesisSupported(hasSynthesis);

    let updateVoices: (() => void) | null = null;
    if (hasSynthesis) {
      updateVoices = () => { voicesRef.current = window.speechSynthesis.getVoices(); };
      updateVoices();
      window.speechSynthesis.addEventListener("voiceschanged", updateVoices);
    }

    const stored = typeof window !== "undefined" ? window.localStorage.getItem(WAKE_STORAGE_KEY) : null;
    if (stored === "1" && getSpeechRecognitionCtor()) {
      setWakeEnabled(true);
      wakeEnabledRef.current = true;
      startRecognitionSession("wake", "wake");
    }

    return () => {
      keepListeningRef.current = false;
      recognitionRef.current?.abort();
      if (hasSynthesis) {
        window.speechSynthesis.cancel();
        if (updateVoices) window.speechSynthesis.removeEventListener("voiceschanged", updateVoices);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Call once from inside a real click handler (mic button, wake toggle,
  // launcher button) before any await/async gap — see speechPrimedRef's
  // comment above for why this specifically matters on iOS Safari.
  function primeSpeechSynthesis() {
    if (speechPrimedRef.current || !synthesisSupported) return;
    speechPrimedRef.current = true;
    try {
      // Empty text is inherently silent on its own — deliberately NOT
      // setting primer.volume = 0 here. Some WebKit builds don't fully
      // reset per-utterance volume state between calls, so a muted primer
      // risks leaving every REAL utterance that follows silently muted
      // too (speak() still "succeeds" — onstart/onend fire, no error —
      // it just produces no audible sound, which looks exactly like what
      // was reported).
      const primer = new SpeechSynthesisUtterance("");
      window.speechSynthesis.speak(primer);
    } catch (err) {
      console.error("[gigi] speech priming failed", err);
    }
  }

  function speak(text: string, onDone?: () => void) {
    if (!speakEnabled || !synthesisSupported) {
      onDone?.();
      return;
    }
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    // Explicit, defensive full volume — some WebKit builds have been
    // observed not resetting per-utterance volume state between calls.
    utterance.volume = 1;
    const voices = voicesRef.current.length > 0 ? voicesRef.current : window.speechSynthesis.getVoices();
    const preferred = voices.find((v) => /en-IN|hi-IN/i.test(v.lang));
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => {
      console.log("[gigi] speech started");
      setSpeaking(true);
      setVoiceOutputFailed(false);
    };
    utterance.onend = () => {
      console.log("[gigi] speech ended");
      setSpeaking(false);
      onDone?.();
    };
    utterance.onerror = (e: SpeechSynthesisErrorEvent) => {
      console.error("[gigi] speech error", e.error);
      setSpeaking(false);
      setVoiceOutputFailed(true);
      onDone?.();
    };

    try {
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error("[gigi] speechSynthesis.speak threw", err);
      setVoiceOutputFailed(true);
      onDone?.();
    }
  }

  // resumeMode: what to automatically start listening for again once the
  // reply has been spoken — "active" keeps a hands-free back-and-forth
  // going (manual mic-button flow), "wake" drops back to quiet
  // background wake-word listening (wake-word-triggered flow), null means
  // don't auto-resume (typed messages).
  async function send(overrideText?: string, resumeMode: MicMode | null = null) {
    const text = (overrideText ?? input).trim();
    if (!text || busy) return;

    const next = [...messagesRef.current, { role: "user" as const, content: text }];
    setMessages(next);
    messagesRef.current = next;
    setInput("");
    setBusy(true);

    const resumeIfNeeded = () => {
      console.log("[gigi:voice] resumeIfNeeded — resumeMode:", resumeMode, "wakeEnabled:", wakeEnabledRef.current);
      if (resumeMode === "active") startRecognitionSession("active", "active");
      else if (resumeMode === "wake" && wakeEnabledRef.current) startRecognitionSession("wake", "wake");
    };

    try {
      const outgoingHistory = next.map((m) => ({ role: m.role, content: m.content }));
      // TEMPORARY diagnostic for the wake-word history bug — remove once
      // confirmed fixed in the browser console.
      console.log("[gigi] outgoing conversationHistory length:", outgoingHistory.length);
      const res = await fetch("/api/gigi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          conversationHistory: outgoingHistory,
        }),
      });
      const data = await res.json();
      const reply = data.reply ?? "(no reply)";
      const withReply = [...next, { role: "assistant" as const, content: reply }];
      setMessages(withReply);
      messagesRef.current = withReply;
      speak(reply, resumeIfNeeded);
    } catch {
      const reply = "Something went wrong — try again.";
      const withReply = [...next, { role: "assistant" as const, content: reply }];
      setMessages(withReply);
      messagesRef.current = withReply;
      speak(reply, resumeIfNeeded);
    } finally {
      setBusy(false);
    }
  }

  // Starts (or, from onend, silently restarts) a continuous speech
  // recognition session. `initialMode` is "active" for the plain mic
  // button (capture a command right away) or "wake" for background
  // wake-word listening (watch for "hey gigi" before capturing anything).
  // `resumeMode` is what to restart into after a captured command's reply
  // has been handled — see send()'s resumeIfNeeded.
  function startRecognitionSession(initialMode: MicMode, resumeMode: MicMode | null) {
    console.log("[gigi:voice] startRecognitionSession — initialMode:", initialMode, "resumeMode:", resumeMode);
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = "en-IN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    // Once a new instance replaces this one in recognitionRef, its events
    // are stale — Chrome can deliver a result/error/end for an instance
    // AFTER it's been stopped/superseded, and without this guard that
    // late event would still mutate shared state (killing voice mode,
    // popping a spurious "Didn't catch that") even though a newer
    // instance is already listening fine.
    const isCurrent = () => recognitionRef.current === recognition;

    modeRef.current = initialMode;
    setMicMode(initialMode);
    commandBufferRef.current = "";
    wakeResultIndexRef.current = -1;
    wakeEndOffsetRef.current = 0;
    if (initialMode === "active") activeModeEnteredAtRef.current = Date.now();

    // clearOnReject: whether a rejected (too-short/filler) attempt should
    // wipe commandBufferRef. Safe (and necessary) for the wake-boundary
    // branches below, since they always OVERWRITE commandBufferRef fresh
    // from the raw transcript slice next time regardless — clearing loses
    // nothing there. NOT safe for genuine multi-chunk accumulation (a
    // later, separate result index that APPENDS onto commandBufferRef):
    // clearing there would have silently glued a stale rejected fragment
    // (e.g. "i.") onto the front of the real command that arrives next,
    // producing "i. Can you add a lead?" instead of the clean command.
    function finishCommand(clearOnReject: boolean) {
      const text = commandBufferRef.current.trim();
      const elapsed = Date.now() - activeModeEnteredAtRef.current;
      if (!isViableCommand(text, elapsed)) {
        console.log("[gigi:voice] REJECTED low-confidence transcript:", JSON.stringify(text), "elapsedMs:", elapsed, "clearOnReject:", clearOnReject);
        if (clearOnReject) commandBufferRef.current = "";
        return;
      }
      console.log("[gigi:voice] ACCEPTED command, sending:", JSON.stringify(text));
      commandBufferRef.current = "";
      keepListeningRef.current = false;
      recognition.stop();
      send(text, resumeMode);
    }

    recognition.onresult = (e: any) => {
      if (!isCurrent()) return;

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const transcriptRaw: string = result[0].transcript ?? "";
        const lower = transcriptRaw.toLowerCase();

        console.log("[gigi:voice] onresult — mode:", modeRef.current, "i:", i, "isFinal:", result.isFinal, "transcript:", JSON.stringify(transcriptRaw));

        if (modeRef.current === "wake") {
          const { matched, endIndex } = matchWakeWord(lower);
          if (!matched) continue;

          console.log("[gigi:voice] WAKE WORD MATCHED — endIndex:", endIndex, "switching to active mode");
          modeRef.current = "active";
          setMicMode("active");
          activeModeEnteredAtRef.current = Date.now();
          wakeResultIndexRef.current = i;
          wakeResultGenerationRef.current = sessionGenerationRef.current;
          wakeEndOffsetRef.current = endIndex;
          const remainder = transcriptRaw.slice(endIndex).trim();
          commandBufferRef.current = remainder;
          console.log("[gigi:voice] remainder after stripping wake phrase:", JSON.stringify(remainder));
          if (result.isFinal && remainder) {
            finishCommand(true);
            return;
          }
          continue;
        }

        // modeRef.current === "active" from here on.
        if (i === wakeResultIndexRef.current && sessionGenerationRef.current === wakeResultGenerationRef.current) {
          // Same result Chrome keeps re-firing as it finalizes — re-derive
          // the command from the wake-word offset each time instead of
          // appending, or "hey gigi" would end up duplicated into the text
          // sent to /api/gigi.
          const remainder = transcriptRaw.slice(wakeEndOffsetRef.current).trim();
          commandBufferRef.current = remainder;
          console.log("[gigi:voice] re-finalizing wake-boundary result, remainder:", JSON.stringify(remainder));
          if (result.isFinal && remainder) finishCommand(true);
          continue;
        }

        if (result.isFinal) {
          const chunk = transcriptRaw.trim();
          if (chunk) {
            commandBufferRef.current = (commandBufferRef.current ? commandBufferRef.current + " " : "") + chunk;
            console.log("[gigi:voice] accumulating command chunk, buffer now:", JSON.stringify(commandBufferRef.current));
            finishCommand(false);
            return;
          }
        }
      }
    };

    recognition.onerror = (e: any) => {
      if (!isCurrent()) return;
      console.log("[gigi:voice] onerror —", e.error, "mode:", modeRef.current);
      // "no-speech"/"aborted"/"network" are transient/expected (Chrome
      // fires these routinely on pauses or brief connectivity blips) —
      // let onend's restart logic silently retry. Only a genuinely fatal
      // error (mic permission denied, no mic, etc.) should stop listening
      // and surface a message. Background wake-listening stays silent even
      // then, since it's not a user-initiated command attempt.
      if (e.error === "no-speech" || e.error === "aborted" || e.error === "network") return;
      keepListeningRef.current = false;
      setListening(false);
      setMicMode(null);
      if (initialMode === "active") {
        setMessages((prev) => [...prev, { role: "assistant", content: "Didn't catch that — try again." }]);
      }
    };

    recognition.onend = () => {
      if (!isCurrent()) return;
      console.log("[gigi:voice] onend — keepListening:", keepListeningRef.current, "mode:", modeRef.current);
      if (keepListeningRef.current) {
        // A short cooldown before restarting — calling start() immediately
        // inside onend is a known trigger for Chrome to immediately
        // re-error instead of actually listening again.
        window.setTimeout(() => {
          if (!isCurrent() || !keepListeningRef.current) return;
          // Reusing the SAME SpeechRecognition object across many restarts
          // is known to get Chrome into a permanently-broken state where
          // every subsequent .start() immediately fires an "aborted" error
          // forever — exactly what was observed live (generation kept
          // climbing, 40, 41, 42... with an onerror/onend pair between
          // every single one, never actually capturing anything again).
          // Building a brand-new instance per restart avoids that: the old
          // (possibly wedged) object is abandoned — its isCurrent() guard
          // means any further stray events from it are ignored — and the
          // new one gets a clean underlying recognition session.
          console.log("[gigi:voice] restarting with a FRESH recognition instance, mode:", modeRef.current);
          const preservedBuffer = commandBufferRef.current;
          startRecognitionSession(modeRef.current, resumeMode);
          commandBufferRef.current = preservedBuffer;
        }, 300);
        return;
      }
      setListening(false);
      setMicMode(null);
    };

    recognitionRef.current = recognition;
    keepListeningRef.current = true;
    setListening(true);
    try {
      recognition.start();
      sessionGenerationRef.current += 1;
      console.log("[gigi:voice] session started, generation:", sessionGenerationRef.current);
    } catch (err) {
      console.error("[gigi:voice] recognition.start() threw on initial start", err);
      keepListeningRef.current = false;
      setListening(false);
      setMicMode(null);
    }
  }

  function toggleMic() {
    primeSpeechSynthesis();
    // Barge-in: clicking the mic always interrupts any reply Gigi is
    // currently reading out, rather than listening over it.
    if (synthesisSupported) window.speechSynthesis.cancel();
    setSpeaking(false);

    if (listening && micMode === "active") {
      keepListeningRef.current = false;
      recognitionRef.current?.stop();
      return;
    }

    // Also supersedes an idle background wake-listening session, if one is
    // running — the isCurrent() guard means its now-stale events are
    // simply ignored.
    startRecognitionSession("active", "active");
  }

  function toggleWake() {
    primeSpeechSynthesis();
    const next = !wakeEnabled;
    setWakeEnabled(next);
    wakeEnabledRef.current = next;
    if (typeof window !== "undefined") window.localStorage.setItem(WAKE_STORAGE_KEY, next ? "1" : "0");

    if (next) {
      if (!listening) startRecognitionSession("wake", "wake");
    } else if (listening && micMode === "wake") {
      keepListeningRef.current = false;
      recognitionRef.current?.stop();
    }
  }

  const voiceState: VoiceState = busy
    ? "thinking"
    : speaking
    ? "speaking"
    : listening && micMode === "active"
    ? "active"
    : listening && micMode === "wake"
    ? "wake"
    : "off";

  const VOICE_STATE_LABEL: Record<VoiceState, string> = {
    off: "Voice off",
    wake: 'Listening for "Hey Gigi"',
    active: "Listening…",
    thinking: "Thinking…",
    speaking: "Speaking…",
  };
  const VOICE_STATE_DOT: Record<VoiceState, string> = {
    off: "bg-muted-foreground/40",
    wake: "bg-blue-500 animate-pulse",
    active: "bg-red-500 animate-pulse",
    thinking: "bg-amber-500 animate-pulse",
    speaking: "bg-emerald-500 animate-pulse",
  };

  return (
    <>
      {open && (
        <div className="fixed bottom-36 right-4 z-50 flex h-[460px] w-[340px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl md:bottom-24 md:right-6">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <img src="/brand/amsu-mark.png" alt="" className="size-6 object-contain" />
              <span className="text-sm font-semibold text-foreground">Gigi</span>
            </div>
            <div className="flex items-center gap-1">
              {voiceSupported && (
                <button
                  onClick={toggleWake}
                  title={wakeEnabled ? 'Wake word on — say "Hey Gigi" anytime. Click to disable.' : 'Enable "Hey Gigi" wake word'}
                  className={cn(
                    "text-muted-foreground hover:text-foreground",
                    wakeEnabled && "text-primary",
                  )}
                >
                  {wakeEnabled ? <Ear className="size-4" /> : <EarOff className="size-4" />}
                </button>
              )}
              {synthesisSupported && (
                // setSpeakEnabled is called ONLY from this click handler —
                // nowhere else in this file, including speak()'s onerror/
                // catch paths, may flip it. A TTS failure should skip
                // speaking that one reply (voiceOutputFailed handles that)
                // without silently opting the user out of voice for every
                // reply after.
                <button
                  onClick={() => {
                    primeSpeechSynthesis();
                    setSpeakEnabled((v) => {
                      const next = !v;
                      if (!next) window.speechSynthesis.cancel();
                      return next;
                    });
                  }}
                  title={speakEnabled ? "Voice replies on — click to mute" : "Voice replies off — click to unmute"}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {speakEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
                </button>
              )}
              {synthesisSupported && speakEnabled && voiceOutputFailed && (
                <span title="Voice output isn't working on this device — replies will still show as text.">
                  <AlertTriangle className="size-4 text-amber-500" />
                </span>
              )}
              <button
                onClick={() => {
                  // Closing the panel does NOT turn off wake-listening —
                  // that's a background feature independent of the panel
                  // being open. Only an active (post-wake-word) capture or
                  // a manual mic session gets cut off here.
                  if (micMode === "active") {
                    keepListeningRef.current = false;
                    recognitionRef.current?.stop();
                  }
                  if (synthesisSupported) window.speechSynthesis.cancel();
                  setOpen(false);
                }}
                className="text-muted-foreground hover:text-foreground"
                title="Close"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-4 py-1.5">
            <span className={cn("size-1.5 rounded-full", VOICE_STATE_DOT[voiceState])} />
            <span className="text-[11px] text-muted-foreground">{VOICE_STATE_LABEL[voiceState]}</span>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Try: &ldquo;add a lead named Ravi, phone 9876543210&rdquo;
                {voiceSupported && <> — or enable the ear icon above and just say &ldquo;Hey Gigi&rdquo;.</>}
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <span
                  className={cn(
                    "inline-block max-w-[85%] rounded-lg px-3 py-1.5 text-sm",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-foreground",
                  )}
                >
                  {m.content}
                </span>
              </div>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-2 border-t border-border p-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={voiceState === "active" ? "Listening…" : "Message Gigi…"}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            {voiceSupported && (
              <button
                onClick={toggleMic}
                title={voiceState === "active" ? "Stop listening" : "Speak a command"}
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg border",
                  voiceState === "active"
                    ? "animate-pulse border-red-300 bg-red-50 text-red-600"
                    : "border-border bg-background text-foreground hover:bg-secondary",
                )}
              >
                <Mic className="size-4" />
              </button>
            )}
            <button
              onClick={() => send()}
              disabled={busy}
              className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
              title="Send"
            >
              <Send className="size-4" />
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => {
          primeSpeechSynthesis();
          setOpen((v) => !v);
        }}
        className="fixed bottom-20 right-4 z-50 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 md:bottom-6 md:right-6"
        title="Ask Gigi"
      >
        {open ? <X className="size-6" /> : <MessageCircle className="size-6" />}
        {/* Visible even when the panel is closed — the wake-word session
            (and any in-flight command) keeps running in the background. */}
        {voiceState !== "off" && (
          <span
            className={cn(
              "absolute -right-0.5 -top-0.5 size-3.5 rounded-full border-2 border-background",
              VOICE_STATE_DOT[voiceState],
            )}
          />
        )}
      </button>
    </>
  );
}
