import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPlatformAdmin } from "@/lib/admin";
import { publicApiPaths } from '@/lib/security/publicApiPaths';

// Every page in this app is a "use client" component (confirmed by
// inspection), so there's no server-rendered auth check to hook into
// per-page — this proxy (Next.js 16 renamed "middleware" to "proxy"; same
// API, this file replaces what would've been middleware.ts) is the only
// place that can gate access before any of them mount.
//
// PUBLIC routes (no session required):
// - / — the marketing landing page (logged-in users are bounced to
//   /dashboard below, after the session check, so this stays public without
//   ever actually being shown to an authenticated tenant)
// - /login, /signup
// - /design when ?client=1 is present (shared read-only 3D view links sent
//   to customers, who are never Amsu users)
// API exceptions are explicit; each non-demo exception verifies its own credentials.
function isPublicPath(pathname: string, searchParams: URLSearchParams): boolean {
  if (pathname.startsWith("/api/")) return publicApiPaths.has(pathname);
  if (pathname === "/") return true;
  if (pathname === "/login" || pathname === "/signup") return true;
  if (pathname === "/design" && searchParams.get("client") === "1") return true;
  // PWA assets: the manifest and the service worker (+ its workbox
  // runtime / offline-fallback chunks) are fetched with no session — a
  // logged-out visitor still needs the install metadata, and the SW
  // script itself loads uncredentialed. The .png/.svg icons already
  // bypass this middleware via the matcher's extension exclusion below.
  if (pathname === "/manifest.json" || pathname === "/offline") return true;
  if (
    pathname === "/sw.js" ||
    pathname === "/security-cache-cleanup.js" ||
    pathname.startsWith("/workbox-") ||
    pathname.startsWith("/worker-") ||
    pathname.startsWith("/fallback-")
  ) {
    return true;
  }
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
  response.headers.set('Cache-Control', 'private, no-store');
  // Keep token-bearing paths private while allowing Google Maps origin-based key restrictions.
  response.headers.set('Referrer-Policy', 'strict-origin');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  // Clickjacking protection: nothing in this app is meant to be framed by
  // another site. frame-ancestors is the modern, CSP-based directive;
  // X-Frame-Options is kept alongside it for older browsers that don't
  // read CSP. This intentionally stops short of a full script/style-src
  // CSP — this app loads Google Maps, Three.js, Konva canvas rendering
  // and jsPDF/html2canvas, and locking those down needs deliberate
  // per-source testing rather than a blanket policy risking breakage.
  response.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
  response.headers.set('X-Frame-Options', 'DENY');
  // No page in this app uses camera, microphone, payment, USB or
  // geolocation APIs (confirmed by inspection) — deny them outright so a
  // future XSS or a compromised third-party script embedded on a page
  // can't silently request them.
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), payment=(), usb=(), geolocation=(), interest-cohort=()',
  );

  // A logged-in tenant landing on the marketing page has no reason to see
  // it — send them straight to their workspace instead.
  if (request.nextUrl.pathname === "/" && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (isPublicPath(request.nextUrl.pathname, request.nextUrl.searchParams)) {
    return response;
  }

  if (!user) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } });
    }
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
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/api/:path*',
    // Run on everything except Next's own static/image assets, the
    // favicon, and plain static files served straight out of public/
    // (logos, icons, client photos, etc.) — /api/* is still matched (so
    // this middleware runs and can reach isPublicPath's explicit api
    // bypass), it's excluded by logic above, not by the matcher, to keep
    // the "what's public" decision in one readable place.
    //
    // The extension exclusion was added after amsu-logo.svg on the
    // logged-out /login page came back as a redirect-to-/login instead of
    // the image: any public/ asset referenced from an unauthenticated
    // page was being treated as a protected route requiring a session,
    // same as any other path. It happened to go unnoticed before this
    // because /login and /signup previously only used a Lucide icon
    // component there, never an actual public/ image file.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpe?g|gif|webp|ico|avif)$).*)",
  ],
};
