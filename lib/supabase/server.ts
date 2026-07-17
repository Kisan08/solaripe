import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server-side Supabase client for Server Components / Server Actions /
// Route Handlers — cookie-aware, so it reads/writes the same auth session
// the middleware and browser client (lib/supabase/client.ts) share.
// Next.js 16's cookies() is async, so this factory is async too.
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component (not a Server Action/Route
            // Handler) — cookies() is read-only there. Safe to ignore as
            // long as middleware is also refreshing the session, which it is.
          }
        },
      },
    },
  );
}
