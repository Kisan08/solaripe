// Cross-table phone-number duplicate lookup, used by /api/check-phone (for
// the manual "+ Add Lead"/"+ Add Client" UI forms) and directly by Gigi's
// add_lead/create_project tools (lib/gigi/tools.ts). `leads`, `clients`,
// and `projects` are three separate, unrelated tables that can each hold
// the same person's phone number — this is a WARNING layer only, it never
// blocks a write, it just surfaces what else exists under that number.
import type { SupabaseClient } from "@supabase/supabase-js";

export type PhoneTable = "leads" | "clients" | "projects";

export interface DuplicatePhoneMatch {
  table: PhoneTable;
  name: string;
  created_at: string | null;
}

export const TABLE_LABELS: Record<PhoneTable, string> = {
  leads: "Lead",
  clients: "AI Calling client",
  projects: "Project",
};

const TABLE_NAME_COLUMN: Record<PhoneTable, string> = {
  leads: "name",
  clients: "name",
  projects: "client_name",
};

export async function findDuplicatePhone(
  supabase: SupabaseClient,
  phone: string,
  excludeTable?: PhoneTable,
): Promise<DuplicatePhoneMatch[]> {
  const tables = (Object.keys(TABLE_NAME_COLUMN) as PhoneTable[]).filter((t) => t !== excludeTable);

  const matches: DuplicatePhoneMatch[] = [];
  for (const table of tables) {
    const nameColumn = TABLE_NAME_COLUMN[table];
    // Selecting "*" rather than a dynamically-built column list — Supabase's
    // generated select() type parses its argument as a template literal at
    // compile time, which can't handle a runtime-variable column name.
    const { data } = await supabase
      .from(table)
      .select("*")
      .eq("phone", phone)
      .limit(1)
      .maybeSingle();

    if (data) {
      const row = data as Record<string, unknown>;
      matches.push({
        table,
        name: (row[nameColumn] as string) ?? "Unknown",
        created_at: (row.created_at as string) ?? null,
      });
    }
  }
  return matches;
}
