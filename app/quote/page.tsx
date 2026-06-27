"use client";
import { useState, useEffect, type ChangeEvent, type ReactNode, type CSSProperties, Suspense } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { company } from "@/lib/company.config";
import { getSettings, defaultSettings, type AppSettings } from '@/lib/settings'
/* ─── Types ─── */
interface QuoteForm {
  proposalNo: string;
  date: string;
  validUntil: string;
  clientName: string;
  siteAddress: string;
  contactPhone: string;
  systemCapacity: number;
  ratePerWp: number;
  subsidyPerKw: number;
  monthlyBill: number;
  gridRate: number;
  roofType: string;
  floors: string;
  shadow: string;
  projectType: string;
  ppaRate: number;
  acCableSpec: string;
  batteryKwh: number;
}

/* ─── Constants ─── */
const GST_RATE   = 0.089;
const PANEL_WP   = 580;
const YIELD_KWH  = 1332;
const DEGRADE    = 0.0045;
const GRID_RISE  = 0.05;
const NAVY       = "#0F1E3D";
const BLUE       = "#1A4F8A";
const BLUE2      = "#1E88E5";
const ACCENT     = "#F5A623";
const GREEN      = "#16A34A";
const GREEN_L    = "#DCFCE7";
const RED        = "#DC2626";
const RED_L      = "#FEE2E2";
const LIGHT      = "#E8F1FA";
const GRAY       = "#F4F6F9";

/* ─── Helpers ─── */
const pad    = (n: number) => String(n).padStart(2, "0");
const inr    = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const inrFull= (n: number) => `Rs. ${Math.round(n).toLocaleString("en-IN")}`;
const fmtDate= (s: string) => { if (!s) return "—"; const d = new Date(s); return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`; };
const lakh   = (n: number) => n >= 100000 ? `₹${(n/100000).toFixed(2)}L` : inr(n);

function compute(f: QuoteForm) {
  const wp              = f.systemCapacity * 1000;
  const panels          = Math.ceil(wp / PANEL_WP);
  const gen             = Math.round(YIELD_KWH * f.systemCapacity);
  const exGst           = wp * f.ratePerWp;
  const gst             = Math.round(exGst * GST_RATE);
  const net             = exGst + gst;
  const subsidy         = f.subsidyPerKw * f.systemCapacity;
  const netAfterSubsidy = Math.max(0, net - subsidy);
  const annualSavingsY1 = Math.round(gen * f.gridRate);
  const paybackYears    = netAfterSubsidy > 0 ? +(netAfterSubsidy / annualSavingsY1).toFixed(1) : 0;
  const roi25           = Math.round(((totalSavings25(f, gen) - netAfterSubsidy) / netAfterSubsidy) * 100);

  return {
    wp, panels, gen, exGst, gst, net, subsidy, netAfterSubsidy,
    annualSavingsY1, paybackYears, roi25,
    t1: Math.round(net * 0.30),
    t2: Math.round(net * 0.40),
    t3: Math.round(net * 0.20),
    t4: Math.round(net * 0.10),
  };
}

function totalSavings25(f: QuoteForm, gen: number) {
  let total = 0;
  for (let y = 1; y <= 25; y++) {
    const genY    = gen * Math.pow(1 - DEGRADE, y - 1);
    const gridY   = f.gridRate * Math.pow(1 + GRID_RISE, y - 1);
    total += genY * gridY;
  }
  return Math.round(total);
}

function savingsTable(f: QuoteForm, gen: number) {
  const rows = [];
  let cumSavings = 0;
  const netCost = Math.max(0, (f.systemCapacity * 1000 * f.ratePerWp * (1 + GST_RATE)) - f.subsidyPerKw * f.systemCapacity);
  for (let y = 1; y <= 25; y++) {
    const genY    = Math.round(gen * Math.pow(1 - DEGRADE, y - 1));
    const gridY   = f.gridRate * Math.pow(1 + GRID_RISE, y - 1);
    const savings = Math.round(genY * gridY);
    cumSavings   += savings;
    const profit  = cumSavings - netCost;
    rows.push({ y, genY, gridRate: +gridY.toFixed(2), savings, cumSavings, profit });
  }
  return rows;
}

type Calc = ReturnType<typeof compute>;

/* ─── PDF Base Styles ─── */
const BASE: CSSProperties = { padding: "6px 10px", border: "1px solid #d0d7e2", fontSize: 11 };
const TH: CSSProperties   = { ...BASE, background: NAVY, color: "white", fontWeight: 700, textAlign: "left" };
const TD: CSSProperties   = { ...BASE };
const LB: CSSProperties   = { ...BASE, background: LIGHT, fontWeight: 600, color: NAVY };

/* ─── PDF Shell ─── */
function PdfHeader({ s }: { s: AppSettings }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 10, borderBottom: `2px solid ${BLUE2}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <img src="/logo.png" alt="Logo" style={{ width: 44, height: 44, objectFit: "contain" }} />
        <div>
          <div style={{ color: NAVY, fontWeight: 700 }}>{s.name.toUpperCase()}</div>
          <div>📞 {s.phone} · {s.email} · GST: {s.gst}</div>
        </div>
      </div>
      <img src="/waaree_logo.png" alt="Waaree" style={{ height: 44, objectFit: "contain" }} />
    </div>
  );
}

function PdfFooter({ s }: { s: AppSettings }) {
  return (
    <div style={{ borderTop: "1px solid #ddd", paddingTop: 5, marginTop: "auto", textAlign: "center", color: "#888", fontSize: 9 }}>
      {s.name} · {s.phone} · {s.email} · Confidential — For {"{client}"} only
    </div>
  );
}

function Page({ children, s }: { children: ReactNode; s: AppSettings }) {
  return (
    <div className="quote-page" style={{ fontFamily: "Calibri, Arial, sans-serif", fontSize: 11, color: "#1a1a1a", background: "white", padding: "24px 30px", width: 794, minHeight: 1123, margin: "0 auto 18px", boxSizing: "border-box", display: "flex", flexDirection: "column", pageBreakAfter: "always" }}>
      <PdfHeader s={s} />
      <div style={{ flex: 1, paddingTop: 6 }}>{children}</div>
      <PdfFooter s={s} />
    </div>
  );
}

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "14px 0 8px" }}>
      <div style={{ width: 4, height: 20, background: BLUE2, borderRadius: 2 }} />
      <span style={{ fontWeight: 700, fontSize: 12.5, color: NAVY, letterSpacing: 0.3 }}>{title.toUpperCase()}</span>
      {sub && <span style={{ fontSize: 10, color: "#888", fontStyle: "italic" }}>— {sub}</span>}
    </div>
  );
}

function KpiCard({ label, value, sub, color = BLUE2, bg = LIGHT }: { label: string; value: string; sub?: string; color?: string; bg?: string }) {
  return (
    <div style={{ background: bg, border: `1px solid ${color}30`, borderRadius: 8, padding: "12px 14px", textAlign: "center" }}>
      <div style={{ fontSize: 9, color: "#888", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: "#666", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

/* ─── PAGE 1 — Premium Cover ─── */
function P1({ f, c, s }: { f: QuoteForm; c: Calc; s: AppSettings }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 0 }}>
      {/* Hero image */}
      <div style={{ position: "relative", marginTop: 8, borderRadius: 8, overflow: "hidden" }}>
        <img src="/solar_cover.jpg" alt={s.name} style={{ width: "100%", height: 200, objectFit: "cover", display: "block" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, rgba(15,30,61,0.85) 0%, rgba(15,30,61,0.3) 100%)" }} />
        <div style={{ position: "absolute", bottom: 20, left: 20, color: "white" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, opacity: 0.8, marginBottom: 4 }}>TECHNO-COMMERCIAL PROPOSAL</div>
          <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>{f.clientName || "Client Name"}</div>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>{f.siteAddress || "Site Address"}</div>
        </div>
        <div style={{ position: "absolute", top: 20, right: 20, background: ACCENT, color: NAVY, padding: "6px 14px", borderRadius: 6, fontWeight: 700, fontSize: 13 }}>
          {f.systemCapacity} kWp
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 12 }}>
        <KpiCard label="System Size" value={`${f.systemCapacity} kWp`} sub={`${c.panels} Panels`} color={BLUE2} bg="#EEF5FF" />
        <KpiCard label="Est. Generation" value={`${(c.gen/1000).toFixed(1)}k`} sub="kWh / year" color={GREEN} bg={GREEN_L} />
        <KpiCard label="Annual Savings" value={lakh(c.annualSavingsY1)} sub="Year 1 estimate" color={ACCENT} bg="#FFF8EE" />
        <KpiCard label="Payback Period" value={`${c.paybackYears} yrs`} sub="Simple payback" color="#7C3AED" bg="#F3EEFF" />
      </div>

      {/* Proposal meta */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
        <div style={{ background: GRAY, borderRadius: 8, padding: "12px 14px" }}>
          <div style={{ fontSize: 9, color: "#888", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>Proposal Details</div>
          {[["No.", f.proposalNo], ["Date", fmtDate(f.date)], ["Valid Until", fmtDate(f.validUntil)], ["Project Type", f.projectType]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, paddingBottom: 4, borderBottom: "1px solid #e5e7eb", marginBottom: 4 }}>
              <span style={{ color: "#666" }}>{k}</span>
              <span style={{ fontWeight: 600, color: NAVY }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ background: GRAY, borderRadius: 8, padding: "12px 14px" }}>
          <div style={{ fontSize: 9, color: "#888", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>Site Details</div>
          {[["Roof Type", f.roofType], ["Floors", f.floors], ["Shading", f.shadow], ["Contact", f.contactPhone]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, paddingBottom: 4, borderBottom: "1px solid #e5e7eb", marginBottom: 4 }}>
              <span style={{ color: "#666" }}>{k}</span>
              <span style={{ fontWeight: 600, color: NAVY }}>{v || "—"}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Why solar strip */}
      <div style={{ marginTop: 10, background: NAVY, borderRadius: 8, padding: "12px 16px" }}>
        <div style={{ fontSize: 9, color: ACCENT, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>WHY GO SOLAR NOW?</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {[
            { icon: "📉", t: "80% Bill Reduction", d: "Slash your electricity costs from day one" },
            { icon: "💰", t: `${lakh(totalSavings25(f, c.gen))} Savings`, d: "Total savings over 25 years" },
            { icon: "🌱", t: `${Math.round(c.gen * 25 * 0.82 / 1000)}T CO₂ Saved`, d: "Your green contribution" },
          ].map(s => (
            <div key={s.t} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 18 }}>{s.icon}</div>
              <div style={{ color: "white", fontWeight: 700, fontSize: 11, marginTop: 3 }}>{s.t}</div>
              <div style={{ color: "#aac9f0", fontSize: 9, marginTop: 2 }}>{s.d}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Partner logos */}
      <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <img src="/waaree_logo.png" alt="Waaree" style={{ height: 32, objectFit: "contain", opacity: 0.8 }} />
        <img src="/adani_solar.png" alt="Adani" style={{ height: 32, objectFit: "contain", opacity: 0.8 }} />
        <img src="/premier_energies.png" alt="Premier" style={{ height: 32, objectFit: "contain", opacity: 0.8 }} />
      </div>
    </div>
  );
}

/* ─── PAGE 2 — System + Pricing ─── */
function P2({ f, c }: { f: QuoteForm; c: Calc }) {
  return (
    <>
      <SectionTitle title="System Design" sub="Technical configuration" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
        <KpiCard label="Solar Panels" value={`${c.panels}`} sub="Waaree 580 Wp TOPCon" color={BLUE2} bg="#EEF5FF" />
        <KpiCard label="Inverter" value={`${f.systemCapacity} kW`} sub="Waaree String" color={NAVY} bg={LIGHT} />
        <KpiCard label="AC Generation" value={`${c.gen.toLocaleString("en-IN")}`} sub="kWh / year" color={GREEN} bg={GREEN_L} />
        <KpiCard label="Performance Ratio" value="75%" sub="GHI: 1,850 kWh/m²" color="#7C3AED" bg="#F3EEFF" />
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
        <tbody>
          {[
            ["Module", "Waaree / Premier TOPCon Bifacial 580 Wp | BIS Compliant", "Structure", "Hot-Dip Galvanized (HDG) | 15-yr warranty"],
            ["Inverter", `Waaree String ${f.systemCapacity} kW | Grid-tied`, "DC Cable", "4 mm² Tinned Cu | EN-50618 (Waasol)"],
            ["Degradation", "0.45% YoY from Year 2", "Timeline", "60–70 days from PO & Advance"],
            ["Earthing", "Chemical Earth Pits per IS 3043", "Lightning Arrester", "Conventional LA per IEC-62305"],
          ].map((row, i) => (
            <tr key={i}>
              <td style={{ ...LB, width: "16%", fontSize: 10 }}>{row[0]}</td>
              <td style={{ ...TD, width: "34%", fontSize: 10 }}>{row[1]}</td>
              <td style={{ ...LB, width: "16%", fontSize: 10 }}>{row[2]}</td>
              <td style={{ ...TD, width: "34%", fontSize: 10 }}>{row[3]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {f.batteryKwh > 0 && (
        <>
          <SectionTitle title="Battery / Hybrid Configuration" />
          <div style={{ background: "#FFF8EE", border: `1px solid ${ACCENT}40`, borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              <KpiCard label="Battery Capacity" value={`${f.batteryKwh} kWh`} sub="LiFePO4" color={ACCENT} bg="white" />
              <KpiCard label="Backup Hours" value={`~${Math.round(f.batteryKwh / (f.systemCapacity * 0.4))} hrs`} sub="Estimated" color={ACCENT} bg="white" />
              <KpiCard label="Battery Type" value="LiFePO4" sub="10-yr warranty" color={ACCENT} bg="white" />
            </div>
          </div>
        </>
      )}

      <SectionTitle title="Pricing Breakdown" sub="CAPEX model" />
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...TH, width: "5%", textAlign: "center" }}>#</th>
            <th style={TH}>Description</th>
            <th style={{ ...TH, width: "28%" }}>Rate / Details</th>
            <th style={{ ...TH, width: "20%", textAlign: "right" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {[
            { n: "1", d: "System Capacity", r: `${f.systemCapacity} kWp`, a: "", bold: false, bg: "#fff" },
            { n: "2", d: "Solar + Infrastructure (excl. GST)", r: `Rs. ${f.ratePerWp} / Wp × ${(f.systemCapacity*1000).toLocaleString("en-IN")} Wp`, a: inrFull(c.exGst), bold: false, bg: "#F5F9FF" },
            { n: "3", d: "GST @ 8.9%", r: "", a: inrFull(c.gst), bold: false, bg: "#fff" },
            { n: "4", d: "Total (incl. GST)", r: "", a: inrFull(c.net), bold: true, bg: "#EEF5FF" },
            ...(f.subsidyPerKw > 0 ? [{ n: "5", d: `PM Surya Ghar Subsidy (${f.systemCapacity} kWp)`, r: `Rs. ${f.subsidyPerKw.toLocaleString("en-IN")} / kWp`, a: `− ${inrFull(c.subsidy)}`, bold: false, bg: "#E6F4FF" }] : []),
          ].map(row => (
            <tr key={row.n} style={{ background: row.bg }}>
              <td style={{ ...TD, textAlign: "center" }}>{row.n}</td>
              <td style={{ ...TD, fontWeight: row.bold ? 700 : 400, color: row.bold ? BLUE2 : "inherit" }}>{row.d}</td>
              <td style={{ ...TD, fontSize: 10, color: "#666" }}>{row.r}</td>
              <td style={{ ...TD, textAlign: "right", fontWeight: row.bold ? 700 : 400 }}>{row.a}</td>
            </tr>
          ))}
          <tr style={{ background: NAVY }}>
            <td colSpan={3} style={{ padding: "10px 12px", border: "1px solid #d0d7e2", color: "white", fontWeight: 700, fontSize: 12 }}>
              {f.subsidyPerKw > 0 ? "NET COST TO CLIENT (after subsidy)" : "NET TOTAL (incl. GST)"}
            </td>
            <td style={{ padding: "10px 12px", border: "1px solid #d0d7e2", color: ACCENT, fontWeight: 700, fontSize: 15, textAlign: "right" }}>
              {inrFull(c.netAfterSubsidy)}
            </td>
          </tr>
        </tbody>
      </table>

      <SectionTitle title="Payment Schedule" sub="Milestone-based" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {[
          { l: "T-1 · 30%", d: "Advance on PO", a: c.t1 },
          { l: "T-2 · 40%", d: "Material Delivery", a: c.t2 },
          { l: "T-3 · 20%", d: "Installation & Commissioning", a: c.t3 },
          { l: "T-4 · 10%", d: "Net Meter & Handover", a: c.t4 },
        ].map((m, i) => (
          <div key={i} style={{ background: i === 0 ? NAVY : GRAY, borderRadius: 8, padding: "10px 12px", textAlign: "center", border: `1px solid ${i === 0 ? NAVY : "#e5e7eb"}` }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: i === 0 ? ACCENT : BLUE2, letterSpacing: 0.5 }}>{m.l}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: i === 0 ? "white" : NAVY, margin: "6px 0 4px" }}>{inrFull(m.a)}</div>
            <div style={{ fontSize: 9, color: i === 0 ? "#aac9f0" : "#666" }}>{m.d}</div>
          </div>
        ))}
      </div>

      {f.projectType === "OPEX / PPA" && f.ppaRate > 0 && (
        <>
          <SectionTitle title="OPEX / PPA Model" sub="Alternative to CAPEX" />
          <div style={{ background: "#F3EEFF", border: "1px solid #7C3AED30", borderRadius: 8, padding: "12px 16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              <KpiCard label="PPA Rate" value={`₹${f.ppaRate}/kWh`} sub="Fixed for contract term" color="#7C3AED" bg="white" />
              <KpiCard label="Grid Rate" value={`₹${f.gridRate}/kWh`} sub="Current tariff" color={RED} bg="white" />
              <KpiCard label="Savings/Unit" value={`₹${(f.gridRate - f.ppaRate).toFixed(2)}`} sub="Per kWh saved" color={GREEN} bg="white" />
            </div>
            <div style={{ marginTop: 10, fontSize: 10, color: "#555", lineHeight: 1.6 }}>
              Under the OPEX model, {company.name} owns, operates and maintains the solar plant. You pay only for units generated at Rs. {f.ppaRate}/kWh — saving Rs. {(f.gridRate - f.ppaRate).toFixed(2)}/kWh vs current grid rate. Zero CAPEX investment required.
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* ─── PAGE 3 — Financial Analysis ─── */
function P3({ f, c }: { f: QuoteForm; c: Calc }) {
  const rows = savingsTable(f, c.gen);
  const total25 = totalSavings25(f, c.gen);
  const paybackRow = rows.find(r => r.cumSavings >= c.netAfterSubsidy);

  return (
    <>
      <SectionTitle title="Financial Analysis" sub="25-year savings projection" />

      {/* Summary KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
        <KpiCard label="Investment" value={lakh(c.netAfterSubsidy)} sub="Net after subsidy" color={BLUE2} bg="#EEF5FF" />
        <KpiCard label="Year 1 Savings" value={lakh(c.annualSavingsY1)} sub={`@ ₹${f.gridRate}/kWh`} color={GREEN} bg={GREEN_L} />
        <KpiCard label="Payback Period" value={`${c.paybackYears} yrs`} sub="Simple payback" color={ACCENT} bg="#FFF8EE" />
        <KpiCard label="25-Year Returns" value={lakh(total25)} sub={`ROI: ${c.roi25}%`} color="#7C3AED" bg="#F3EEFF" />
      </div>

      {/* Savings table */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
        <thead>
          <tr style={{ background: NAVY, color: "white" }}>
            <th style={{ padding: "6px 8px", border: "1px solid #d0d7e2", textAlign: "center", width: "6%" }}>Year</th>
            <th style={{ padding: "6px 8px", border: "1px solid #d0d7e2", textAlign: "right" }}>Generation (kWh)</th>
            <th style={{ padding: "6px 8px", border: "1px solid #d0d7e2", textAlign: "right" }}>Grid Rate (₹)</th>
            <th style={{ padding: "6px 8px", border: "1px solid #d0d7e2", textAlign: "right" }}>Annual Savings</th>
            <th style={{ padding: "6px 8px", border: "1px solid #d0d7e2", textAlign: "right" }}>Cumulative Savings</th>
            <th style={{ padding: "6px 8px", border: "1px solid #d0d7e2", textAlign: "right" }}>Net Profit / (Loss)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const isPayback = paybackRow?.y === r.y;
            const isProfitable = r.profit > 0;
            return (
              <tr key={r.y} style={{ background: isPayback ? "#FFFBEB" : r.y % 2 === 0 ? "#F5F9FF" : "#fff" }}>
                <td style={{ padding: "5px 8px", border: "1px solid #d0d7e2", textAlign: "center", fontWeight: isPayback ? 700 : 400, color: isPayback ? ACCENT : "inherit" }}>
                  {r.y}{isPayback ? " ★" : ""}
                </td>
                <td style={{ padding: "5px 8px", border: "1px solid #d0d7e2", textAlign: "right" }}>{r.genY.toLocaleString("en-IN")}</td>
                <td style={{ padding: "5px 8px", border: "1px solid #d0d7e2", textAlign: "right" }}>{r.gridRate.toFixed(2)}</td>
                <td style={{ padding: "5px 8px", border: "1px solid #d0d7e2", textAlign: "right", fontWeight: 600, color: GREEN }}>{inr(r.savings)}</td>
                <td style={{ padding: "5px 8px", border: "1px solid #d0d7e2", textAlign: "right", fontWeight: 600 }}>{inr(r.cumSavings)}</td>
                <td style={{ padding: "5px 8px", border: "1px solid #d0d7e2", textAlign: "right", fontWeight: 700, color: isProfitable ? GREEN : RED }}>
                  {isProfitable ? "+" : ""}{inr(r.profit)}
                </td>
              </tr>
            );
          })}
          <tr style={{ background: NAVY }}>
            <td colSpan={3} style={{ padding: "8px 10px", border: "1px solid #d0d7e2", color: "white", fontWeight: 700 }}>TOTAL 25-YEAR SAVINGS</td>
            <td style={{ padding: "8px 10px", border: "1px solid #d0d7e2", color: ACCENT, fontWeight: 700, textAlign: "right" }}>{inr(total25)}</td>
            <td style={{ padding: "8px 10px", border: "1px solid #d0d7e2", color: ACCENT, fontWeight: 700, textAlign: "right" }}>{inr(total25)}</td>
            <td style={{ padding: "8px 10px", border: "1px solid #d0d7e2", color: "#4ade80", fontWeight: 700, textAlign: "right" }}>+{inr(total25 - c.netAfterSubsidy)}</td>
          </tr>
        </tbody>
      </table>
      <div style={{ marginTop: 8, fontSize: 9, color: "#888", fontStyle: "italic" }}>
        ★ Payback year highlighted. Assumes {GRID_RISE*100}% annual grid tariff escalation and {DEGRADE*100}% panel degradation from Year 2. Actual savings may vary.
      </div>
    </>
  );
}

/* ─── PAGE 4 — Warranties + Scope ─── */
function P4() {
  return (
    <>
      <SectionTitle title="Warranties" sub="OEM guaranteed" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
        {[
          { item: "Solar PV Modules", cov: "Manufacturing Defect", period: "12 Years", color: BLUE2 },
          { item: "Solar PV Modules", cov: "Linear Performance (80%)", period: "30 Years", color: BLUE2 },
          { item: "Inverter", cov: "Standard OEM", period: "5 Yrs (ext. 8)", color: "#7C3AED" },
          { item: "HDG Structure", cov: "Corrosion Warranty", period: "15 Years", color: GREEN },
          { item: "Balance of System", cov: "OEM Standard", period: "1 Year", color: ACCENT },
          { item: "Workmanship", cov: "Installation Quality", period: "1 Year", color: ACCENT },
        ].map((w, i) => (
          <div key={i} style={{ border: `1px solid ${w.color}30`, borderRadius: 8, padding: "10px 12px", background: "#FAFCFF" }}>
            <div style={{ fontWeight: 700, color: NAVY, fontSize: 10.5 }}>{w.item}</div>
            <div style={{ fontSize: 9.5, color: "#666", marginTop: 2 }}>{w.cov}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: w.color, marginTop: 6 }}>{w.period}</div>
          </div>
        ))}
      </div>

      <SectionTitle title="Scope of Work" sub="Inclusions & exclusions" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        <div style={{ background: GREEN_L, borderRadius: 8, padding: "12px 14px" }}>
          <div style={{ fontWeight: 700, color: GREEN, fontSize: 10.5, marginBottom: 8 }}>✔ INCLUDED IN SCOPE</div>
          {["Solar modules, inverter, structure", "DC & AC cables, connectors, trays", "Earthing system & lightning arrester", "Net meter with LT/CT box", "DISCOM net metering approval", "EAR & Marine insurance", "Commissioning & monitoring setup", "Remote monitoring (1 year free)"].map(i => (
            <div key={i} style={{ fontSize: 10, color: "#166534", marginBottom: 3 }}>✔ {i}</div>
          ))}
        </div>
        <div style={{ background: RED_L, borderRadius: 8, padding: "12px 14px" }}>
          <div style={{ fontWeight: 700, color: RED, fontSize: 10.5, marginBottom: 8 }}>✘ CLIENT SCOPE</div>
          {["Water supply at site", "Internet for monitoring", "Power during installation", "Service lift / crane", "Roof access ladder", "Removal of existing system", "Meter merging / load enhancement", "Civil / waterproofing work"].map(i => (
            <div key={i} style={{ fontSize: 10, color: "#991b1b", marginBottom: 3 }}>✘ {i}</div>
          ))}
        </div>
      </div>

      <SectionTitle title="Bill of Material" sub="Key components" />
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...TH, width: "4%", textAlign: "center" }}>Sr.</th>
            <th style={{ ...TH, width: "22%" }}>Item</th>
            <th style={TH}>Make / Specification</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["1", "Solar PV Modules", "Waaree / Premier TOPCon Bifacial 580 Wp | BIS | 0.45% degradation"],
            ["2", "String Inverter", "Waaree String | Grid-tied | Remote monitoring ready"],
            ["3", "Mounting Structure", "Hot-Dip Galvanized (HDG) | SS-304 fasteners | 15-yr warranty"],
            ["4", "DC Cables", "4 mm² Tinned Cu UV-Protected | Waasol | EN-50618"],
            ["5", "AC Cables", "Polycab/KEI | Al XLPE Armoured | Bimetallic Lugs"],
            ["6", "ACDB / DCDB", "Schneider/L&T/ABB | MCCB | SPD-2 | OC & SC protection"],
            ["7", "Earthing", "Chemical Earth Pits 250µ | 3m Dia 17.2mm | per IS 3043"],
            ["8", "Lightning Arrester", "Copper Bonded 5-Spike | IEC-62305 & IS 2309"],
            ["9", "Net Meter + LT/CT Box", "As per DISCOM spec | Fully included & managed"],
            ["10", "DISCOM Approval", `End-to-end net metering by ${company.shortName || company.name}`],
          ].map(([sr, item, spec], i) => (
            <tr key={sr} style={{ background: i % 2 === 0 ? "#fff" : "#F5F9FF" }}>
              <td style={{ ...TD, textAlign: "center", fontSize: 10 }}>{sr}</td>
              <td style={{ ...TD, fontWeight: 700, color: NAVY, fontSize: 10 }}>{item}</td>
              <td style={{ ...TD, fontSize: 10 }}>{spec}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/* ─── PAGE 5 — Signatures + Clients ─── */
function P5({ f, s }: { f: QuoteForm; s: AppSettings }) {
  return (
    <>
      <SectionTitle title="Terms & Acceptance" />
      <div style={{ background: LIGHT, border: `1px solid ${BLUE2}`, borderRadius: 8, padding: "10px 16px", fontSize: 10.5, lineHeight: 1.6, marginBottom: 14 }}>
        By signing below, both parties agree to the Techno-Commercial Proposal terms.{" "}
        <span style={{ color: RED, fontWeight: 600 }}>Payments as per milestone schedule. GST as applicable. Proposal valid for 30 days from date above.</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
        {[
          { title: `FOR ${company.name.toUpperCase()}`, name: company.proprietor, designation: "Proprietor" },
          { title: `ACCEPTED BY — ${f.clientName?.toUpperCase() || "CLIENT"}`, name: f.clientName || "___________________", designation: "___________________" },
        ].map((sig, i) => (
          <div key={i} style={{ border: "1px solid #d0d7e2", borderRadius: 8, overflow: "hidden" }}>
            <div style={{ background: i === 0 ? NAVY : BLUE2, color: "white", padding: "8px 14px", fontWeight: 700, fontSize: 10.5 }}>{sig.title}</div>
            <div style={{ padding: "40px 16px 16px" }}>
              <div style={{ borderTop: "1px solid #aaa", paddingTop: 8, fontSize: 10 }}>
                <div style={{ color: "#666" }}>Authorised Signatory</div>
                <div style={{ fontWeight: 700, marginTop: 4 }}>Name: {sig.name}</div>
                <div style={{ marginTop: 2 }}>Designation: {sig.designation}</div>
                <div style={{ marginTop: 8, color: "#666" }}>Date: _______________</div>
                <div style={{ marginTop: 6, color: "#666" }}>Seal:</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <SectionTitle title="Our Clients" sub="Trusted by leading developers" />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, flexWrap: "wrap", padding: "8px 0" }}>
        <img src="/client_hiranandani.jpeg" alt="Hiranandani" style={{ height: 55, objectFit: "contain" }} />
        <img src="/client_mahavir.jpeg" alt="Mahavir" style={{ height: 40, objectFit: "contain" }} />
        <img src="/client_jpinfra.jpeg" alt="JP Infra" style={{ height: 45, objectFit: "contain" }} />
        <img src="/client_lodha.jpeg" alt="Lodha" style={{ height: 40, objectFit: "contain" }} />
        <img src="/client_triveni.jpeg" alt="Triveni" style={{ height: 55, objectFit: "contain" }} />
        <img src="/client_regency.jpeg" alt="Regency" style={{ height: 48, objectFit: "contain" }} />
        <img src="/client_mohan.jpeg" alt="Mohan Group" style={{ height: 55, objectFit: "contain" }} />
      </div>

      <div style={{ marginTop: 14, background: NAVY, color: "white", textAlign: "center", padding: "14px", borderRadius: 8 }}>
        <div style={{ color: ACCENT, fontWeight: 700, fontSize: 13 }}>Thank you for choosing {s.name}</div>
        <div style={{ color: "#aac9f0", fontSize: 10, marginTop: 4 }}>Powering a Greener Tomorrow ☀ · {s.phone} · {s.email}</div>
      </div>
    </>
  );
}

/* ─── Full Document ─── */
function QuotationDocument({ f, c, s }: { f: QuoteForm; c: Calc; s: AppSettings }) {
  return (
    <div id="quotation-document">
      <Page s={s}><P1 f={f} c={c} s={s} /></Page>
      <Page s={s}><P2 f={f} c={c} /></Page>
      <Page s={s}><P3 f={f} c={c} /></Page>
      <Page s={s}><P4 /></Page>
      <Page s={s}><P5 f={f} s={s} /></Page>
    </div>
  )
}

/* ─── Form Field ─── */
function Field({ label, name, value, onChange, type = "text", placeholder = "" }: {
  label: string; name: keyof QuoteForm; value: string | number;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input type={type} name={name} value={value} onChange={onChange} placeholder={placeholder}
        className="w-full px-3 py-2 text-sm rounded-lg bg-white border border-gray-200 text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 placeholder-gray-400 transition-all" />
    </div>
  );
}

function SelectField({ label, name, value, onChange, options }: {
  label: string; name: keyof QuoteForm; value: string;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void; options: string[];
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <select name={name} value={value} onChange={onChange}
        className="w-full px-3 py-2 text-sm rounded-lg bg-white border border-gray-200 text-gray-900 outline-none focus:border-blue-400 transition-all">
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

/* ─── Inner Component ─── */
function QuotePageInner() {
  const today = new Date().toISOString().split("T")[0];
  const valid = new Date(); valid.setDate(valid.getDate() + 30);
  const searchParams = useSearchParams();
  const [settings, setSettings] = useState<AppSettings | null>(null)

useEffect(() => {
  const run = async () => {
    const s = await getSettings()
    setSettings(s)
  }
  run()
}, [])
  const [f, setF] = useState<QuoteForm>({
    proposalNo: `${settings.short_name}-${new Date().getFullYear()}-001`,
    date: today,
    validUntil: valid.toISOString().split("T")[0],
    clientName: searchParams.get("name") ?? "",
    siteAddress: searchParams.get("address") ?? "",
    contactPhone: searchParams.get("phone") ?? "",
    systemCapacity: Number(searchParams.get("system_size")) || 15,
    ratePerWp: settings.default_rate,
    subsidyPerKw: 0,
    monthlyBill: 8000,
    gridRate: 9,
    roofType: "RCC Flat",
    floors: "G+4",
    shadow: "Minimal",
    projectType: "CAPEX (EPC)",
    ppaRate: 5.5,
    acCableSpec: "4C x 25 sq. mm AL Armoured as per Design",
    batteryKwh: 0,
  });

  const [busy, setBusy] = useState(false);
  const c = compute(f);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const numFields = ["systemCapacity","ratePerWp","subsidyPerKw","monthlyBill","gridRate","ppaRate","batteryKwh"];
    setF(p => ({ ...p, [name]: numFields.includes(name) ? parseFloat(value) || 0 : value }));
  };

  const onSelect = (e: ChangeEvent<HTMLSelectElement>) => {
    setF(p => ({ ...p, [e.target.name]: e.target.value }));
  };

  const buildPdf = async () => {
    const html2canvas = (await import("html2canvas")).default;
    const jsPDF = (await import("jspdf")).default;
    const pages = document.querySelectorAll<HTMLElement>(".quote-page");
    const pdf = new jsPDF("p", "mm", "a4");
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    for (let i = 0; i < pages.length; i++) {
      const canvas = await html2canvas(pages[i], { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff", windowWidth: 794 });
      const img = canvas.toDataURL("image/png");
      const ih = (canvas.height * pw) / canvas.width;
      if (i > 0) pdf.addPage();
      pdf.addImage(img, "PNG", 0, ih < ph ? (ph - ih) / 2 : 0, pw, Math.min(ih, ph));
    }
    return pdf;
  };

  const downloadPDF = async () => {
    setBusy(true);
    try { const pdf = await buildPdf(); pdf.save(`Proposal for ${f.clientName || "Client"} ${f.systemCapacity} KW.pdf`); }
    finally { setBusy(false); }
  };

  const shareWhatsApp = async () => {
    setBusy(true);
    try {
      const pdf = await buildPdf();
      const fileName = `Proposal_${f.clientName || "Client"}_${f.systemCapacity}KW.pdf`;
      const msg = `Hello ${f.clientName || ""},\n\nGreetings from *${company.name}*! ☀\n\n*Proposal Highlights:*\n⚡ System: ${f.systemCapacity} kWp (${c.panels} Panels × 580 Wp)\n💰 Investment: ${inrFull(c.netAfterSubsidy)}\n📈 Year 1 Savings: ${inrFull(c.annualSavingsY1)}\n⏱ Payback: ${c.paybackYears} years\n🏆 25-Yr Returns: ${lakh(totalSavings25(f, c.gen))}\n\n📞 ${company.phone} · ✉ ${company.email}\n\n*${company.name}* — Powering a Greener Tomorrow 🌱`;
      const file = new File([pdf.output("blob")], fileName, { type: "application/pdf" });
      if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: msg });
      } else {
        pdf.save(fileName);
        await new Promise(res => setTimeout(res, 1000));
        const phone = f.contactPhone.replace(/\D/g, "");
        window.open(phone.length >= 10 ? `https://wa.me/91${phone.slice(-10)}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
      }
    } catch (err) { console.error(err); alert("Could not share. Download PDF manually."); }
    finally { setBusy(false); }
  };

  const numFields = ["systemCapacity","ratePerWp","subsidyPerKw","monthlyBill","gridRate","ppaRate","batteryKwh"];

  if (!settings) return (
    <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center">
      <p className="text-sm text-gray-400">Loading...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#F4F6F9]">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Quotation Generator</h1>
            <p className="text-sm text-gray-500 mt-0.5">Auto-filled from lead · edit any field</p>
          </div>
          <div className="flex gap-2">
            <button onClick={downloadPDF} disabled={busy}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50 transition-all" style={{ background: '#1A4F8A' }}>              {busy ? "Generating…" : "⬇ Download PDF"}
            </button>
            <button onClick={shareWhatsApp} disabled={busy}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50 transition-all"
              style={{ background: "#25D366" }}>
              📤 WhatsApp
            </button>
            <button onClick={() => window.print()}
              className="px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-all">
              🖨 Print
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="space-y-4 lg:sticky lg:top-24 lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto pr-1">

          {/* Client Details */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <span className="w-1.5 h-4 rounded bg-blue-600 inline-block" />
              Client Details
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Proposal No." name="proposalNo" value={f.proposalNo} onChange={onChange} />
              <Field label="Date" name="date" type="date" value={f.date} onChange={onChange} />
              <div className="col-span-2"><Field label="Client / Society Name" name="clientName" value={f.clientName} onChange={onChange} placeholder="e.g. Siddhi City CHS" /></div>
              <div className="col-span-2"><Field label="Site Address" name="siteAddress" value={f.siteAddress} onChange={onChange} placeholder="e.g. Badlapur, Maharashtra" /></div>
              <Field label="Contact Phone" name="contactPhone" value={f.contactPhone} onChange={onChange} placeholder="9876543210" />
              <Field label="Valid Until" name="validUntil" type="date" value={f.validUntil} onChange={onChange} />
            </div>
          </div>

          {/* Site Details */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <span className="w-1.5 h-4 rounded bg-amber-500 inline-block" />
              Site Details
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <SelectField label="Roof Type" name="roofType" value={f.roofType} onChange={onSelect} options={["RCC Flat","Mangalore Tile","GI Sheet","Trapezoidal","Terrace"]} />
              <SelectField label="Shadow" name="shadow" value={f.shadow} onChange={onSelect} options={["None","Minimal","Moderate","Heavy"]} />
              <Field label="Floors (e.g. G+4)" name="floors" value={f.floors} onChange={onChange} placeholder="G+4" />
              <SelectField label="Project Type" name="projectType" value={f.projectType} onChange={onSelect} options={["CAPEX (EPC)","OPEX / PPA","AMC","Hybrid"]} />
            </div>
          </div>

          {/* System & Pricing */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <span className="w-1.5 h-4 rounded bg-green-600 inline-block" />
              System & Pricing
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="System Capacity (kWp)" name="systemCapacity" type="number" value={f.systemCapacity} onChange={onChange} />
              <Field label="Rate (Rs./Wp excl. GST)" name="ratePerWp" type="number" value={f.ratePerWp} onChange={onChange} />
              <Field label="Govt. Subsidy (Rs./kWp) — 0 if none" name="subsidyPerKw" type="number" value={f.subsidyPerKw} onChange={onChange} placeholder="18000" />
              <Field label="Battery Capacity (kWh) — 0 if none" name="batteryKwh" type="number" value={f.batteryKwh} onChange={onChange} placeholder="0" />
              {f.projectType === "OPEX / PPA" && (
                <Field label="PPA Rate (Rs./kWh)" name="ppaRate" type="number" value={f.ppaRate} onChange={onChange} />
              )}
              <div className="col-span-2"><Field label="AC Cable Spec" name="acCableSpec" value={f.acCableSpec} onChange={onChange} /></div>
            </div>
          </div>

          {/* Financial Inputs */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <span className="w-1.5 h-4 rounded bg-purple-600 inline-block" />
              Financial Inputs
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Monthly Electricity Bill (₹)" name="monthlyBill" type="number" value={f.monthlyBill} onChange={onChange} />
              <Field label="Current Grid Rate (₹/kWh)" name="gridRate" type="number" value={f.gridRate} onChange={onChange} />
            </div>
          </div>

          {/* Auto-calculated */}
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-blue-800 mb-3">Auto-calculated</h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
              {[
                ["Panels", `${c.panels} × 580 Wp`],
                ["Generation", `${c.gen.toLocaleString("en-IN")} kWh/yr`],
                ["Excl. GST", inrFull(c.exGst)],
                ["GST @ 8.9%", inrFull(c.gst)],
                ["Net Total", inrFull(c.net)],
                ...(f.subsidyPerKw > 0 ? [["Subsidy", `− ${inrFull(c.subsidy)}`], ["Net Payable", inrFull(c.netAfterSubsidy)]] as [string,string][] : []),
                ["Year 1 Savings", inrFull(c.annualSavingsY1)],
                ["Payback", `${c.paybackYears} years`],
                ["25-yr Returns", lakh(totalSavings25(f, c.gen))],
                ["ROI", `${c.roi25}%`],
                ["T-1 (30%)", inrFull(c.t1)],
                ["T-2 (40%)", inrFull(c.t2)],
                ["T-3 (20%)", inrFull(c.t3)],
                ["T-4 (10%)", inrFull(c.t4)],
              ].map(([l, v]) => (
                <div key={l} className="contents">
                  <div className="text-blue-600">{l}:</div>
                  <div className={`font-semibold ${l === "Net Total" || l === "Net Payable" || l === "25-yr Returns" ? "text-blue-800" : "text-gray-800"}`}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* PDF Preview */}
        <div className="overflow-auto rounded-2xl border border-gray-200" style={{ maxHeight: "88vh", background: "#e5e7eb" }}>
          <div style={{ padding: 16 }}>
           <QuotationDocument f={f} c={c} s={settings} />
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #quotation-document, #quotation-document * { visibility: visible; }
          #quotation-document { position: fixed; top: 0; left: 0; width: 100%; }
          .quote-page { page-break-after: always; margin: 0 !important; }
        }
      `}</style>
    </div>
  );
}

export default function QuotePage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-gray-500">Loading...</div>}>
      <QuotePageInner />
    </Suspense>
  );
}
