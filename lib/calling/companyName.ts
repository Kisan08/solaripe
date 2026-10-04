// Finds the name of the company that owns a given calling client, so every AI
// call introduces the right business. Server-only (service-role client):
// callers are Twilio webhooks and the voice server, which have no login.
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cleanCompanyName } from "./voiceScript";

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { name: string; at: number }>();

// Company name for the account that owns this client: the name saved in the
// account's Settings, otherwise the company name typed at signup. Returns ""
// when neither exists; callers then use a script with no company name rather
// than ever falling back to someone else's.
export async function fetchCompanyNameForClient(clientId: string): Promise<string> {
  const hit = cache.get(clientId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.name;

  const { data: client } = await supabaseAdmin
    .from("clients").select("tenant_id").eq("id", clientId).maybeSingle();
  if (!client?.tenant_id) return "";

  const [{ data: settings }, { data: tenant }] = await Promise.all([
    supabaseAdmin.from("settings").select("name").eq("tenant_id", client.tenant_id).maybeSingle(),
    supabaseAdmin.from("tenants").select("company_name").eq("id", client.tenant_id).maybeSingle(),
  ]);

  const name = cleanCompanyName(settings?.name) || cleanCompanyName(tenant?.company_name);
  if (cache.size > 500) cache.clear();
  cache.set(clientId, { name, at: Date.now() });
  return name;
}
