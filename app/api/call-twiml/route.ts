import { NextRequest, NextResponse } from "next/server";
import { company } from "@/lib/company.config";

// Polly.Aditi is Amazon Polly's STANDARD (non-neural) Hindi voice — that's
// the actual source of the "robotic/synthetic" sound. Twilio also exposes
// Polly's Neural voices through the exact same <Say voice="..."> attribute,
// just with a "-Neural" suffix on the voice name — no new service, no new
// API key. Kajal-Neural is Polly's neural Hindi (hi-IN) voice.
//
// IMPORTANT — please verify this exact voice name against Twilio's current
// docs/console before deploying. I can't browse Twilio's live voice catalog
// from here.
const VOICE = "Polly.Kajal-Neural";
const LANG = "hi-IN";

function buildTwiml(name: string, clientId: string, baseUrl: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" numDigits="1" language="${LANG}" speechTimeout="auto" action="${baseUrl}/api/call-response?clientId=${clientId}" method="POST">
    <Say voice="${VOICE}" language="${LANG}">
      Namaste ${name} ji.<break time="400ms"/>
      Main ${company.name} se bol rahi hoon.<break time="500ms"/>
      Humari company Maharashtra mein solar panel installation karti hai.<break time="500ms"/>
      Aap apne bijli bill mein 80 percent tak ki bachat kar sakte hain.<break time="600ms"/>
      Kya aap solar panel ke baare mein thodi jaankari lena chahenge?<break time="500ms"/>
      Aap seedha bol sakte hain — jaise "haan" ya "nahi".<break time="300ms"/>
      Ya phir, haan ke liye 1 aur nahi ke liye 2 dabaayen.
    </Say>
  </Gather>
  <Say voice="${VOICE}" language="${LANG}">
    Koi jawab nahi mila.<break time="300ms"/> Hum baad mein call karenge.<break time="300ms"/> Dhanyavaad.
  </Say>
</Response>`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name") || "Friend";
  const clientId = searchParams.get("clientId") || "";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || company.website;
  return new NextResponse(buildTwiml(name, clientId, baseUrl), {
    headers: { "Content-Type": "text/xml" },
  });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name") || "Friend";
  const clientId = searchParams.get("clientId") || "";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || company.website;
  return new NextResponse(buildTwiml(name, clientId, baseUrl), {
    headers: { "Content-Type": "text/xml" },
  });
}