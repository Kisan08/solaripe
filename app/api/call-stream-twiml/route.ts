import { NextRequest, NextResponse } from "next/server";

// ⏸ PAUSED (not abandoned): blocked on ElevenLabs paid-plan access to the
// library-voice API this pipeline needs for TTS. Intentionally left intact
// and untouched so work can resume the moment that's unblocked — a
// deliberate hold, not orphaned code.
//
// Standalone POC for a real-time streaming voice pipeline (Deepgram STT +
// Groq LLM + ElevenLabs TTS over a Twilio Media Stream) — completely
// separate from the production Gather/Say flow in call-twiml/route.ts and
// call-response/route.ts. Not wired into any existing call path; point a
// Twilio number or a test call's `url` at THIS route to exercise it.
//
// <Connect><Stream> replaces <Gather>/<Say> here: instead of Twilio
// recording an utterance, POSTing it to a webhook, and playing back a
// <Say>, it opens a bidirectional WebSocket and streams raw audio both
// ways for the life of the call. That WebSocket is handled by the
// standalone server in server/media-stream-server.ts — Next.js API routes
// (this file included) can't handle a raw WS upgrade, hence the separate
// process. See that file's header comment for how to run and expose it.
// XML-attribute-escape clientId before interpolating it into the TwiML
// below — it comes from a query param on a URL Twilio requests, so even
// though it's normally just a UUID we control, this is cheap insurance
// against it ever containing a literal double-quote or "&".
function escapeXmlAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function handle(req: NextRequest) {
  const wsUrl = process.env.MEDIA_STREAM_WS_URL;
  const clientId = req.nextUrl.searchParams.get("clientId") || "";

  if (!wsUrl) {
    console.error("[call-stream-twiml] MEDIA_STREAM_WS_URL not set — see server/media-stream-server.ts for setup");
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Media stream URL is not configured. Set MEDIA STREAM WS URL and try again.</Say>
  <Hangup/>
</Response>`,
      { headers: { "Content-Type": "text/xml" } },
    );
  }

  // <Parameter> passes clientId into the Media Stream's "start" event as
  // customParameters, so server/media-stream-server.ts can identify which
  // client this call belongs to and write outcomes back to the right row
  // (see that file's applyCrmUpdates usage) — without this, the streaming
  // pipeline has no way to know which client it's even talking to.
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}">
      <Parameter name="clientId" value="${escapeXmlAttr(clientId)}" />
    </Stream>
  </Connect>
</Response>`;

  return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
