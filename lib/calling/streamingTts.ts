// Thin fetch-based streaming ElevenLabs TTS client for the real-time voice
// pipeline POC (server/media-stream-server.ts). Requests ulaw_8000 output
// directly — that's exactly the format Twilio Media Streams expects, so
// bytes from ElevenLabs can be forwarded straight back over the Twilio
// WebSocket with no resampling/transcoding step in between.
//const VOICE_ID = "FFmp1h1BMl0iVHA0JxrI";
const VOICE_ID = "ExdX3FQINb1npPZsg2MY";

export async function streamElevenLabsTts(
  text: string,
  onChunk: (audioChunk: Buffer) => void | Promise<void>,
): Promise<void> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream?output_format=ulaw_8000`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
      Accept: "audio/basic",
    },
    body: JSON.stringify({
      text,
      // Flash for lowest latency, per the brief. eleven_multilingual_v2 is
      // the higher-quality fallback if flash's Hindi/Hinglish output turns
      // out to be the actual bottleneck once you're listening to real audio.
      model_id: "eleven_flash_v2_5",
    }),
  });

  if (!res.ok || !res.body) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(`ElevenLabs stream request failed: ${res.status} ${bodyText}`);
  }

  const reader = res.body.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value && value.length > 0) await onChunk(Buffer.from(value));
  }
}
