// Extracts {name, phone} pairs from a real-world, messy xlsx workbook —
// built against three genuinely different sample files (clean headers,
// multiple sheets with inconsistent/missing headers plus a freeform-text
// sheet, and a sheet with several phone numbers crammed into one cell).
// Pure/no I/O beyond the buffer it's given, so it can be exercised
// directly from a plain Node script without a running server or a
// Supabase session — see the manual test run in the commit that added
// this file.
import { cleanPhone } from "@/lib/phone";

export interface ExtractedClient {
  name: string;
  phone: string;
  sheet: string;
}

export interface SheetExtractionSummary {
  sheet: string;
  strategy: "header" | "freeform" | "none";
  rowsScanned: number;
  candidates: number; // rows that yielded a valid name+phone, before in-file dedup
  duplicatesInFile: number; // valid rows whose phone repeated an earlier row in THIS import
}

// Matched case-insensitively against a trimmed header cell — deliberately
// an exact-match list, not a loose "contains" check. A loose check would
// make "Sites Name" match on "name" and get picked over the real contact
// column ("Contact Person") in files like Paras's, which has both.
const NAME_HEADERS = ["name", "particulars", "contact person", "client name"];
const PHONE_HEADERS = [
  "number", "numbers", "mobile", "mobile number", "phone", "phone number", "contact number",
];

function normalizeHeader(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function isBlankRow(row: unknown[]): boolean {
  return row.every((c) => String(c ?? "").trim() === "");
}

function cleanName(raw: string): string {
  return String(raw ?? "").trim().replace(/\s+/g, " ").slice(0, 100);
}

// Strategy A: a confident header match on the sheet's first non-blank
// row. Only that one row is ever considered a header candidate — real
// spreadsheets don't bury headers deep in the data, and checking further
// down risks matching a stray data row by coincidence.
function findHeaderColumns(rows: unknown[][]): { nameCol: number; phoneCol: number } | null {
  const headerRow = rows.find((r) => !isBlankRow(r));
  if (!headerRow) return null;
  const nameCol = headerRow.findIndex((c) => NAME_HEADERS.includes(normalizeHeader(c)));
  const phoneCol = headerRow.findIndex((c) => PHONE_HEADERS.includes(normalizeHeader(c)));
  if (nameCol === -1 || phoneCol === -1) return null;
  return { nameCol, phoneCol };
}

// One cell can hold several numbers ("9029218899 / 9356426556", "98670
// 74589 / 9415425222 / 9819507255" — note the first number here has an
// internal space of its own). Split on the common separators first, then
// clean_Phone each candidate individually — first one that survives
// wins; no duplicate rows for the extra numbers in the same cell.
function firstValidPhoneInCell(raw: unknown): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const chunks = text.split(/[/,;]/);
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    // A bare decimal ("66.66666667", from an unrelated pricing sheet)
    // strips down to 10 digits and would otherwise pass as a fake phone
    // number — real phone numbers are never written as a plain decimal.
    if (/^\d+\.\d+$/.test(trimmed)) continue;
    const phone = cleanPhone(trimmed);
    if (phone) return phone;
  }
  return null;
}

// Strategy B: no reliable header (or a sheet that's genuinely freeform
// text, e.g. a numbered list like "1. Anbeer Star Sunil – 9221619585").
// Scans each cell in the row for the first phone-shaped run of digits —
// exactly 10 digits starting 6-9, tolerating at most a single space or
// dash between any two digits (so "98670 74589" still resolves, while a
// decimal like "66.66666667" structurally can't match at all, since "."
// isn't an allowed separator here) — then derives the name from THAT
// SAME cell by stripping the matched phone, its immediate separator, and
// any leading list numbering ("1.", "2)", "3 -").
const PHONE_CANDIDATE = /[6-9](?:[\s-]?\d){9}/;

function extractFromFreeformRow(row: unknown[]): { name: string; phone: string } | null {
  for (let i = 0; i < row.length; i++) {
    const cellText = String(row[i] ?? "").trim();
    if (!cellText) continue;

    const match = cellText.match(PHONE_CANDIDATE);
    if (!match || match.index === undefined) continue;
    const phone = cleanPhone(match[0]);
    if (!phone) continue;

    const before = cellText.slice(0, match.index).replace(/[\s.:–—-]+$/, "");
    const after = cellText.slice(match.index + match[0].length).replace(/^[\s.:–—-]+/, "");
    let name = (before || after).replace(/^\s*\d+[.):-]\s*/, "").trim();

    if (!name) {
      // Nothing usable in the phone's own cell — fall back to the
      // nearest other non-empty cell in the same row.
      const adjacent = row.find((c, j) => j !== i && String(c ?? "").trim() !== "");
      name = String(adjacent ?? "").trim();
    }

    return { name: cleanName(name), phone };
  }
  return null;
}

export function extractClientsFromWorkbook(buffer: Buffer): {
  clients: ExtractedClient[];
  summaries: SheetExtractionSummary[];
} {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer" });

  const clients: ExtractedClient[] = [];
  const summaries: SheetExtractionSummary[] = [];
  const seenPhones = new Set<string>();

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];

    // Sheets frequently declare a much larger range than their real data
    // — a common Excel artifact from selecting/formatting whole columns,
    // e.g. a sheet with ~10 real rows whose !ref claims 1,048,566 (seen in
    // one of the actual sample files this was built against). Reading
    // that whole declared range before filtering blanks is what made a
    // modest file take several seconds to import; capping the read range
    // up front avoids ever materializing the phantom rows in the first
    // place. 20,000 is comfortably above any realistic contact list.
    const declaredRange = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
    if (declaredRange) declaredRange.e.r = Math.min(declaredRange.e.r, 20_000);

    const allRows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: "",
      raw: false,
      range: declaredRange ?? undefined,
    });
    const rows = allRows.filter((r) => !isBlankRow(r));

    if (rows.length === 0) {
      summaries.push({ sheet: sheetName, strategy: "none", rowsScanned: 0, candidates: 0, duplicatesInFile: 0 });
      continue;
    }

    // `rows` is already blank-filtered, so once a header match is found
    // it's simply rows[0] — the rest of the sheet's real data is rows[1:].
    const header = findHeaderColumns(rows);
    const body = header ? rows.slice(1) : rows;

    let candidates = 0;
    let duplicatesInFile = 0;

    for (const row of body) {
      let extracted: { name: string; phone: string } | null = null;

      if (header) {
        const phone = firstValidPhoneInCell(row[header.phoneCol]);
        if (phone) {
          extracted = { name: cleanName(String(row[header.nameCol] ?? "")) || "Client", phone };
        }
      } else {
        extracted = extractFromFreeformRow(row);
        if (extracted && !extracted.name) extracted.name = "Client";
      }

      if (!extracted) continue;

      candidates++;
      if (seenPhones.has(extracted.phone)) {
        duplicatesInFile++;
        continue;
      }
      seenPhones.add(extracted.phone);
      clients.push({ name: extracted.name || "Client", phone: extracted.phone, sheet: sheetName });
    }

    summaries.push({
      sheet: sheetName,
      strategy: header ? "header" : candidates > 0 ? "freeform" : "none",
      rowsScanned: body.length,
      candidates,
      duplicatesInFile,
    });
  }

  return { clients, summaries };
}
