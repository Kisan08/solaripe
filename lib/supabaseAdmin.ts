import { createClient } from "@supabase/supabase-js";

// SERVER-ONLY. Uses the service role key, which bypasses RLS — never import
// this from a client component or anything bundled to the browser. Only for
// trusted server contexts like cron routes that need to read tables the
// anon key isn't (or shouldn't be) granted access to.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
