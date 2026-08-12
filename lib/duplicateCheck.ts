// Cross-table phone-number duplicate lookup, used by /api/check-phone (for
// the manual "+ Add Lead"/"+ Add Client"/"New Project" UI forms) and
// directly by Gigi's add_lead/add_calling_client/create_project tools
// (lib/gigi/tools.ts). `leads`, `clients`, and `projects` are three
// separate, unrelated tables that can each hold the same person's phone
// number — this is a WARNING layer only, it never blocks a write, it just
// surfaces what else exists under that number.
//
// Includes SAME-table matches too (e.g. two leads sharing a phone number),
// not just cross-table ones — `currentTable` (the table being inserted
// into) is only used to distinguish "another X" (same table) from "a/an X"
// (a different table) in the result, never to skip a table from the search.
import type { SupabaseClient } from "@supabase/supabase-js";

export type PhoneTable = "leads" | "clients" | "projects";

export interface DuplicatePhoneMatch {
  table: PhoneTable;
  name: string;
  created_at: string | null;
  sameTable: boolean;
}

export const TABLE_LABELS: Record<PhoneTable, string> = {
  leads: "Lead",
  clients: "AI Calling client",
  projects: "Project",
};

// "a Lead" / "an AI Calling client" / "a Project" — used for CROSS-table
// matches; same-table matches read as "another Lead" etc. instead (see
// describeDuplicateMatch below).
const TABLE_ARTICLE: Record<PhoneTable, string> = {
  leads: "a",
  clients: "an",
  projects: "a",
};

const TABLE_NAME_COLUMN: Record<PhoneTable, string> = {
  leads: "name",
  clients: "name",
  projects: "client_name",
};

// Builds the "a Lead" / "an AI Calling client" / "another Project" phrase
// segment for a match, so callers don't have to duplicate the
// same-table-vs-cross-table article logic themselves.
export function describeDuplicateMatch(match: DuplicatePhoneMatch): string {
  const label = TABLE_LABELS[match.table];
  return match.sameTable ? `another ${label}` : `${TABLE_ARTICLE[match.table]} ${label}`;
}

export async function findDuplicatePhone(
  supabase: SupabaseClient,
  phone: string,
  currentTable?: PhoneTable,
): Promise<DuplicatePhoneMatch[]> {
  const tables = Object.keys(TABLE_NAME_COLUMN) as PhoneTable[];

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
        sameTable: table === currentTable,
      });
    }
  }
  return matches;
}
