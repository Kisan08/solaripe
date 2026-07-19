import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPlatformAdmin } from "@/lib/admin";

// Every page in this app is a "use client" component (confirmed by
// inspection), so there's no server-rendered auth check to hook into
// per-page — this proxy (Next.js 16 renamed "middleware" to "proxy"; same
// API, this file replaces what would've been middleware.ts) is the only
// place that can gate access before any of them mount.
//
// PUBLIC routes (no session required):
// - /login, /signup
// - /design when ?client=1 is present (shared read-only 3D view links sent
//   to customers, who are never Solaripe users)
// - everything under /api/* — Twilio webhooks (call-twiml/call-response/
//   call-webhook) are called directly by Twilio with no browser session at
//   all, and the cron/notify routes have their own bearer-token auth
//   (CRON_SECRET). Applying session auth here would break calling outright.
function isPublicPath(pathname: string, searchParams: URLSearchParams): boolean {
  if (pathname.startsWith("/api/")) return true;
  if (pathname === "/login" || pathname === "/signup") return true;
  if (pathname === "/design" && searchParams.get("client") === "1") return true;
  return false;
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // getUser() (not getSession()) — it revalidates the JWT against Supabase
  // Auth's server rather than trusting whatever's in the cookie, which is
  // the difference between an actual auth check and a spoofable one.
  const { data: { user } } = await supabase.auth.getUser();

  if (isPublicPath(request.nextUrl.pathname, request.nextUrl.searchParams)) {
    return response;
  }

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectedFrom", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // /admin/* actually blocks the route here rather than just hiding a nav
  // link — a logged-in non-admin tenant redirected straight to the
  // dashboard, same as if the route didn't exist for them. This is on top
  // of (not instead of) the RLS policies on product_library itself and the
  // /api/admin/* routes' own check — three independent layers, since a
  // proxy bug here should never be the only thing standing between a
  // tenant and write access to the shared catalog.
  if (request.nextUrl.pathname.startsWith("/admin") && !isPlatformAdmin(user.id)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // Run on everything except Next's own static/image assets and the
    // favicon — /api/* is still matched (so this middleware runs and can
    // reach isPublicPath's explicit api bypass), it's excluded by logic
    // above, not by the matcher, to keep the "what's public" decision in
    // one readable place.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
