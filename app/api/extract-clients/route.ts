import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { cleanPhone } from "@/lib/phone";
import { extractClientsFromWorkbook } from "@/lib/xlsxClientImport";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanName(raw: string): string {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 100) || "Client";
}

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCsv(text: string): { name: string; phone: string }[] {
  const lines = text.split("\n").filter((l) => l.trim());
  const clients: { name: string; phone: string }[] = [];

  for (const line of lines) {
    const cols = line.split(/[,\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    let phone: string | null = null;
    let name = "";

    for (let i = 0; i < cols.length; i++) {
      const p = cleanPhone(cols[i]);
      if (p) {
        phone = p;
        name = cleanName(cols[0] !== cols[i] ? cols[0] : cols[i - 1] ?? "");
        break;
      }
    }

    if (phone) clients.push({ name: name || "Client", phone });
  }

  return clients;
}

// ─── PDF parser ───────────────────────────────────────────────────────────────

async function parsePdf(buffer: Buffer): Promise<{ name: string; phone: string }[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse");
  const data = await pdfParse(buffer);
  const lines = data.text.split("\n").filter((l: string) => l.trim());
  const clients: { name: string; phone: string }[] = [];
  const phoneRegex = /(?:\+91|91)?[6-9]\d{9}/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const phones = line.match(phoneRegex);
    if (!phones) continue;

    const p = cleanPhone(phones[0]);
    if (!p) continue;

    const namePart = cleanName(line.replace(phoneRegex, "").replace(/[^a-zA-Z\s]/g, ""));
    const name = namePart.length > 2
      ? namePart
      : cleanName(lines[i - 1]?.replace(/[^a-zA-Z\s]/g, "") ?? "");

    clients.push({ name: name || "Client", phone: p });
  }

  return clients;
}

// ─── Route ────────────────────────────────────────────────────────────────────

interface SheetCounts {
  sheet: string;
  imported: number;
  duplicatesSkipped: number;
  invalidSkipped: number;
}

function buildSheetMessage(line: SheetCounts): string {
  if (line.imported === 0 && line.duplicatesSkipped === 0 && line.invalidSkipped === 0) {
    return `${line.sheet}: no phone numbers found in this sheet`;
  }
  const parts = [`${line.imported} imported`];
  if (line.duplicatesSkipped > 0) parts.push(`${line.duplicatesSkipped} duplicate${line.duplicatesSkipped === 1 ? "" : "s"} skipped`);
  if (line.invalidSkipped > 0) parts.push(`${line.invalidSkipped} row${line.invalidSkipped === 1 ? "" : "s"} skipped (no valid phone found)`);
  return `${line.sheet}: ${parts.join(", ")}`;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = file.name.toLowerCase();

    // sheet is "CSV"/"PDF" for those formats, which have no real concept of
    // sheets — kept as a single line so the response shape (and the
    // per-source summary shown to the user) stays consistent either way.
    let clients: { name: string; phone: string; sheet: string }[] = [];
    let rowsBySheet = new Map<string, number>(); // sheet -> data rows scanned, for the "no valid phone" count

    if (fileName.endsWith(".xlsx") || fileName.endsWith(".xlsm") || fileName.endsWith(".xls")) {
      const { clients: extracted, summaries } = extractClientsFromWorkbook(buffer);
      clients = extracted;
      // "invalid" here means rows scanned that never became a candidate at
      // all (no valid phone anywhere in the row) — candidates that turned
      // out to be in-file duplicates are counted separately below.
      rowsBySheet = new Map(summaries.map((s) => [s.sheet, s.rowsScanned - s.candidates]));
      // Sheets with zero candidates still need a line in the final
      // summary even though they contribute no clients — seed them here.
      for (const s of summaries) if (!rowsBySheet.has(s.sheet)) rowsBySheet.set(s.sheet, 0);
    } else if (fileName.endsWith(".csv") || fileName.endsWith(".tsv")) {
      clients = parseCsv(buffer.toString("utf-8")).map((c) => ({ ...c, sheet: "CSV" }));
    } else if (fileName.endsWith(".pdf")) {
      clients = (await parsePdf(buffer)).map((c) => ({ ...c, sheet: "PDF" }));
    } else {
      // Try to detect by content — attempt xlsx first, then pdf
      try {
        const { clients: extracted, summaries } = extractClientsFromWorkbook(buffer);
        clients = extracted;
        rowsBySheet = new Map(summaries.map((s) => [s.sheet, s.rowsScanned - s.candidates]));
      } catch {
        clients = (await parsePdf(buffer)).map((c) => ({ ...c, sheet: "PDF" }));
      }
    }

    if (clients.length === 0 && rowsBySheet.size === 0) {
      return NextResponse.json(
        { error: "No valid phone numbers found in file" },
        { status: 400 }
      );
    }

    // Upsert into Supabase — skip existing phones. tenant_id is stamped
    // server-side by a DB trigger from the current session (see
    // supabase/migrations/0005_tenant_scope_crm.sql), never sent here.
    const rows = clients.map((c) => ({
      name: c.name,
      phone: c.phone,
      status: "pending",
    }));

    const supabase = await createServerSupabaseClient();
    const { data: inserted, error } = rows.length > 0
      ? await supabase
          .from("clients")
          // phone uniqueness is now per-tenant (tenant_id, phone), not global —
          // the conflict target has to match that composite constraint or this
          // upsert would error ("no unique or exclusion constraint matching").
          .upsert(rows, { onConflict: "tenant_id,phone", ignoreDuplicates: true })
          .select()
      : { data: [], error: null };

    if (error) {
      console.error("Supabase upsert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ignoreDuplicates means .select() only returns the rows that were
    // genuinely newly inserted — anything in `clients` whose phone isn't
    // in that returned set already existed for this tenant.
    const insertedPhones = new Set((inserted ?? []).map((r: { phone: string }) => r.phone));

    const sheetLines = new Map<string, SheetCounts>();
    for (const sheet of rowsBySheet.keys()) {
      sheetLines.set(sheet, { sheet, imported: 0, duplicatesSkipped: 0, invalidSkipped: rowsBySheet.get(sheet) ?? 0 });
    }
    for (const c of clients) {
      const line = sheetLines.get(c.sheet) ?? { sheet: c.sheet, imported: 0, duplicatesSkipped: 0, invalidSkipped: 0 };
      if (insertedPhones.has(c.phone)) line.imported++;
      else line.duplicatesSkipped++;
      sheetLines.set(c.sheet, line);
    }

    const summary = Array.from(sheetLines.values()).map((line) => buildSheetMessage(line));

    return NextResponse.json({
      inserted: inserted?.length ?? 0,
      total: clients.length,
      summary,
    });
  } catch (err) {
    console.error("extract-clients error:", err);
    return NextResponse.json({ error: "Failed to parse file" }, { status: 500 });
  }
}