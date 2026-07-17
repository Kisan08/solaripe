import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanPhone(raw: string): string | null {
  const digits = String(raw).replace(/\D/g, "").slice(-10);
  return digits.length === 10 && /^[6-9]/.test(digits) ? digits : null;
}

function cleanName(raw: string): string {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 100) || "Client";
}

// ─── XLSX parser ──────────────────────────────────────────────────────────────

async function parseXlsx(buffer: Buffer): Promise<{ name: string; phone: string }[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer" });
  const clients: { name: string; phone: string }[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, {
      defval: "",
      raw: false, // convert numbers to strings
    });

    for (const row of rows) {
      const values = Object.values(row).map(String);

      // Find a valid phone in any column
      let phone: string | null = null;
      let nameGuess = "";

      for (let i = 0; i < values.length; i++) {
        const p = cleanPhone(values[i]);
        if (p) {
          phone = p;
          // Name is usually the first column, or the column before the phone
          nameGuess = cleanName(values[0] !== values[i] ? values[0] : values[i - 1] ?? "");
          break;
        }
      }

      if (phone) {
        clients.push({ name: nameGuess || "Client", phone });
      }
    }
  }

  return clients;
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

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = file.name.toLowerCase();

    let clients: { name: string; phone: string }[] = [];

    if (fileName.endsWith(".xlsx") || fileName.endsWith(".xlsm") || fileName.endsWith(".xls")) {
      clients = await parseXlsx(buffer);
    } else if (fileName.endsWith(".csv") || fileName.endsWith(".tsv")) {
      clients = parseCsv(buffer.toString("utf-8"));
    } else if (fileName.endsWith(".pdf")) {
      clients = await parsePdf(buffer);
    } else {
      // Try to detect by content — attempt xlsx first, then pdf
      try {
        clients = await parseXlsx(buffer);
      } catch {
        clients = await parsePdf(buffer);
      }
    }

    // Deduplicate by phone
    const unique = clients.filter(
      (c, i, self) => i === self.findIndex((t) => t.phone === c.phone)
    );

    if (unique.length === 0) {
      return NextResponse.json(
        { error: "No valid phone numbers found in file" },
        { status: 400 }
      );
    }

    // Upsert into Supabase — skip existing phones
    const rows = unique.map((c) => ({
      name: c.name,
      phone: c.phone,
      status: "pending",
    }));

    const { data: inserted, error } = await supabase
      .from("clients")
      .upsert(rows, { onConflict: "phone", ignoreDuplicates: true })
      .select();

    if (error) {
      console.error("Supabase upsert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      inserted: inserted?.length ?? unique.length,
      total: unique.length,
    });
  } catch (err) {
    console.error("extract-clients error:", err);
    return NextResponse.json({ error: "Failed to parse file" }, { status: 500 });
  }
}