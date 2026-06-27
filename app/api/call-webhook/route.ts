import { supabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const params = new URLSearchParams(body);

  const callStatus = params.get("CallStatus");
  const clientId = new URL(req.url).searchParams.get("clientId") || "";

  const failedStatuses = ["no-answer", "busy", "failed", "canceled"];
  if (callStatus && failedStatuses.includes(callStatus)) {
    await supabase
      .from("clients")
      .update({ status: "no_answer", called_at: new Date().toISOString() })
      .eq("id", clientId);
  }

  return new NextResponse("ok", { status: 200 });
}