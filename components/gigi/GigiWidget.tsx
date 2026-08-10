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
import { MessageCircle, X, Send, Mic, Volume2, VolumeX, Ear, EarOff } from "lucide-react";
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

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    setVoiceSupported(getSpeechRecognitionCtor() !== null);
    setSynthesisSupported(typeof window !== "undefined" && "speechSynthesis" in window);

    const stored = typeof window !== "undefined" ? window.localStorage.getItem(WAKE_STORAGE_KEY) : null;
    if (stored === "1" && getSpeechRecognitionCtor()) {
      setWakeEnabled(true);
      wakeEnabledRef.current = true;
      startRecognitionSession("wake", "wake");
    }

    return () => {
      keepListeningRef.current = false;
      recognitionRef.current?.abort();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function speak(text: string, onDone?: () => void) {
    if (!speakEnabled || !synthesisSupported) {
      onDone?.();
      return;
    }
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find((v) => /en-IN|hi-IN/i.test(v.lang));
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => { setSpeaking(false); onDone?.(); };
    utterance.onerror = () => { setSpeaking(false); onDone?.(); };
    window.speechSynthesis.speak(utterance);
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

    function finishCommand() {
      const text = commandBufferRef.current.trim();
      commandBufferRef.current = "";
      keepListeningRef.current = false;
      recognition.stop();
      if (text) send(text, resumeMode);
    }

    recognition.onresult = (e: any) => {
      if (!isCurrent()) return;

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const transcriptRaw: string = result[0].transcript ?? "";
        const lower = transcriptRaw.toLowerCase();

        if (modeRef.current === "wake") {
          const { matched, endIndex } = matchWakeWord(lower);
          if (!matched) continue;

          modeRef.current = "active";
          setMicMode("active");
          wakeResultIndexRef.current = i;
          wakeEndOffsetRef.current = endIndex;
          const remainder = transcriptRaw.slice(endIndex).trim();
          commandBufferRef.current = remainder;
          if (result.isFinal && remainder) {
            finishCommand();
            return;
          }
          continue;
        }

        // modeRef.current === "active" from here on.
        if (i === wakeResultIndexRef.current) {
          // Same result Chrome keeps re-firing as it finalizes — re-derive
          // the command from the wake-word offset each time instead of
          // appending, or "hey gigi" would end up duplicated into the text
          // sent to /api/gigi.
          const remainder = transcriptRaw.slice(wakeEndOffsetRef.current).trim();
          commandBufferRef.current = remainder;
          if (result.isFinal && remainder) finishCommand();
          continue;
        }

        if (result.isFinal) {
          const chunk = transcriptRaw.trim();
          if (chunk) {
            commandBufferRef.current = (commandBufferRef.current ? commandBufferRef.current + " " : "") + chunk;
            finishCommand();
            return;
          }
        }
      }
    };

    recognition.onerror = (e: any) => {
      if (!isCurrent()) return;
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
      if (keepListeningRef.current) {
        // A short cooldown before restarting — calling start() immediately
        // inside onend is a known trigger for Chrome to immediately
        // re-error instead of actually listening again. This is what lets
        // the wake-listening session survive Chrome's periodic auto-stops
        // indefinitely without the user noticing a gap.
        window.setTimeout(() => {
          if (isCurrent() && keepListeningRef.current) recognition.start();
        }, 300);
        return;
      }
      setListening(false);
      setMicMode(null);
    };

    recognitionRef.current = recognition;
    keepListeningRef.current = true;
    setListening(true);
    recognition.start();
  }

  function toggleMic() {
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
                <button
                  onClick={() => {
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
        onClick={() => setOpen((v) => !v)}
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
