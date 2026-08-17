// Public "Request a Demo" form submission from the marketing landing page
// (app/page.tsx). Logged-out, unauthenticated — proxy.ts already treats
// /api/* as public, and the demo_requests table's RLS policy (see
// supabase/migrations/0016_demo_requests.sql) only allows INSERT, so this
// route can never be used to read back other submissions.
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  let body: {
    name?: string;
    companyName?: string;
    phone?: string;
    email?: string;
    city?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const name = body.name?.trim();
  const companyName = body.companyName?.trim();
  const phone = body.phone?.trim();
  const email = body.email?.trim();
  const city = body.city?.trim() || null;

  if (!name || !companyName || !phone || !email) {
    return NextResponse.json(
      { error: "Name, company, phone, and email are required." },
      { status: 400 },
    );
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("demo_requests").insert({
    name,
    company_name: companyName,
    phone,
    email,
    city,
  });

  if (error) {
    console.error("[demo-requests] insert failed", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
