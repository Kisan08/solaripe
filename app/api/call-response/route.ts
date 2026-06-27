import { supabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId") || "";

  const formData = await req.formData();
  const digit = formData.get("Digits") as string;

  let status = "no_answer";
  let response = "No response";

  if (digit === "1") {
    status = "interested";
    response = "Interested — pressed 1";
  } else if (digit === "2") {
    status = "not_interested";
    response = "Not Interested — pressed 2";
  } else if (digit === "3") {
    status = "call_back";
    response = "Call Back Later — pressed 3";
  }

  await supabase
    .from("clients")
    .update({ status, response, called_at: new Date().toISOString() })
    .eq("id", clientId);

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="hi-IN">
    ${
      digit === "1"
        ? "Bahut accha! Humari team jald hi aapse sampark karegi. Dhanyavaad."
        : digit === "2"
        ? "Theek hai. Agar kabhi zaroorat ho toh hume zaroor call karein. Dhanyavaad."
        : "Bilkul. Hum aapko baad mein call karenge. Dhanyavaad."
    }
  </Say>
</Response>`;

  return new NextResponse(twiml, {
    headers: { "Content-Type": "text/xml" },
  });
}