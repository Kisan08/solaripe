import { NextRequest, NextResponse } from "next/server";
import { company } from "@/lib/company.config";

function buildTwiml(name: string, clientId: string, baseUrl: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="hi-IN">
    Namaste ${name} ji. Main ${company.name} se bol rahi hoon.
    Humari company Maharashtra mein solar panel installation karti hai.
    Aap apne bijli bill mein 80 percent tak ki bachat kar sakte hain.
    Kya aap solar panel ke baare mein jaankari lena chahenge?
    Agar haan, toh 1 dabaayen. Agar nahi, toh 2 dabaayen.
    Agar baad mein baat karna chahte hain, toh 3 dabaayen.
  </Say>
  <Gather numDigits="1" action="${baseUrl}/api/call-response?clientId=${clientId}" method="POST" timeout="10">
  </Gather>
  <Say voice="Polly.Aditi" language="hi-IN">
    Koi jawab nahi mila. Hum baad mein call karenge. Dhanyavaad.
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