"use client";
import { motion } from "framer-motion";
import { Phone, RotateCcw, PhoneOutgoing } from "lucide-react";
import { CALL_STATUSES, type CallStatus } from "@/lib/types";
import { cleanPhone } from "@/lib/phone";
import type { Client, LeadScore } from "@/app/crm/page";

const STATUS_CONFIG: Record<CallStatus, { label: string; color: string; bg: string; priority: number }> = {
  interested:     { label: "Interested ✅",  color: "#065F46", bg: "#D1FAE5", priority: 1 },
  call_back:      { label: "Call Back 🔁",   color: "#92400E", bg: "#FEF3C7", priority: 2 },
  calling:        { label: "Calling…",       color: "#1A4F8A", bg: "#EFF6FF", priority: 3 },
  pending:        { label: "Pending",        color: "#6B7280", bg: "#F3F4F6", priority: 4 },
  no_answer:      { label: "No Answer",      color: "#6B7280", bg: "#F3F4F6", priority: 5 },
  failed:         { label: "Failed",         color: "#7C3AED", bg: "#EDE9FE", priority: 6 },
  not_interested: { label: "Not Interested", color: "#991B1B", bg: "#FEE2E2", priority: 7 },
};

const ALL_STATUSES: CallStatus[] = CALL_STATUSES;

const LEAD_SCORE_CONFIG: Record<LeadScore, { label: string; color: string; bg: string }> = {
  hot:  { label: "🔥 Hot",  color: "#991B1B", bg: "#FEE2E2" },
  warm: { label: "🟡 Warm", color: "#92400E", bg: "#FEF3C7" },
  cold: { label: "🔵 Cold", color: "#1E40AF", bg: "#DBEAFE" },
};

// One consistent blue for every avatar — a per-row rainbow of colors was
// exactly the kind of competing-color noise this table is meant to avoid
// now; the calm reference uses a single brand tone here, not a hash-based
// palette.
const AVATAR_COLOR = "#0C447C";

export function formatPhone(p: string) {
  const d = p.replace(/\D/g, "");
  if (d.length === 10) return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
  if (d.length === 12 && d.startsWith("91")) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  return p;
}

// Same normalization make-call/route.ts uses server-side for the Twilio
// `to` field (via the shared cleanPhone) — kept identical here so a manual
// dial and an AI call always resolve to the same number. Returns null
// for anything that isn't a genuine 10-digit Indian mobile number (too
// short, missing, garbled) instead of producing a malformed tel: link —
// callers must handle the null case rather than rendering a broken link.
function telHref(p: string): string | null {
  const cleaned = cleanPhone(p);
  return cleaned ? `tel:+91${cleaned}` : null;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function Avatar({ client }: { client: Client }) {
  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
      style={{ backgroundColor: AVATAR_COLOR }}
    >
      {initials(client.name)}
    </span>
  );
}

// A live <select> styled to read the same as a status badge, so a manual
// caller can update a client's status inline — right in the table row,
// no modal — while the AI pipeline and Gigi keep setting it exactly as
// before through their own existing paths.
function StatusSelect({ status, onChange, disabled }: { status: CallStatus; onChange: (s: CallStatus) => void; disabled?: boolean }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <select
      value={status}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as CallStatus)}
      title="Update call status"
      style={{
        backgroundColor: cfg.bg, color: cfg.color,
        padding: "3px 6px", borderRadius: 999, border: "1px solid transparent",
        fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1,
      }}
    >
      {ALL_STATUSES.map((s) => (
        <option key={s} value={s} style={{ color: "#111827", backgroundColor: "#fff" }}>
          {STATUS_CONFIG[s].label}
        </option>
      ))}
    </select>
  );
}

// Uncontrolled by design: the key ties each mount to the row's current
// server value, so a manual caller's in-progress typing survives the 5s
// auto-refresh poll (which only ever produces a new key once THIS save
// itself lands) without needing a separate draft-state layer. Saves on
// blur, same "commit when you're done" feel as filling in a normal form.
function ResponseInput({ client, onSave, disabled, boxed }: { client: Client; onSave: (value: string) => void; disabled?: boolean; boxed?: boolean }) {
  return (
    <input
      key={client.id + (client.response ?? "")}
      type="text"
      defaultValue={client.response ?? ""}
      placeholder="Log what was said…"
      disabled={disabled}
      onBlur={(e) => {
        const value = e.target.value.trim();
        if (value !== (client.response ?? "")) onSave(value);
      }}
      style={boxed ? {
        width: "100%", border: "1px solid #E5E7EB", borderRadius: 6,
        padding: "6px 10px", fontSize: 12, color: "#374151", background: "#F9FAFB",
        outline: "none", cursor: disabled ? "not-allowed" : "text", boxSizing: "border-box",
      } : {
        width: "100%", border: "1px solid transparent", borderRadius: 6,
        padding: "4px 6px", fontSize: 12, color: "#374151", background: "transparent",
        outline: "none", cursor: disabled ? "not-allowed" : "text",
      }}
      onFocus={(e) => { if (!boxed) { e.target.style.border = "1px solid #D1D5DB"; e.target.style.background = "#fff"; } }}
      onBlurCapture={(e) => { if (!boxed) { e.currentTarget.style.border = "1px solid transparent"; e.currentTarget.style.background = "transparent"; } }}
    />
  );
}

// Both directions are hard-pinned to IST (Asia/Kolkata), NOT the device's
// own configured timezone — this app is India-only, and the picker's raw
// value always MEANS India wall-clock time. DO NOT change this to
// `new Date(v)`/device-local getters — that was the exact timezone bug
// fixed earlier (7:43 PM entered meaning India time was silently saved
// as 7:43 PM UTC on a non-IST device). Always go through an explicit
// +05:30 offset (save) / Asia/Kolkata formatter (display) instead.
function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function fromDatetimeLocalValue(v: string): string | null {
  if (!v) return null;
  const ms = Date.parse(`${v}:00+05:30`);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

// Same "uncontrolled, save on blur/change" pattern as ResponseInput above
// — no modal, quick inline edit right in the row.
function CallbackInput({ client, onSave, disabled, boxed }: { client: Client; onSave: (value: string | null) => void; disabled?: boolean; boxed?: boolean }) {
  return (
    <input
      key={client.id + (client.callback_at ?? "")}
      type="datetime-local"
      defaultValue={toDatetimeLocalValue(client.callback_at)}
      disabled={disabled}
      title="Schedule a WhatsApp callback reminder"
      onBlur={(e) => {
        const next = fromDatetimeLocalValue(e.target.value);
        if (next !== client.callback_at) onSave(next);
      }}
      style={boxed ? {
        width: "100%", border: "1px solid #E5E7EB", borderRadius: 6,
        padding: "6px 10px", fontSize: 12, color: "#374151", background: "#F9FAFB",
        outline: "none", cursor: disabled ? "not-allowed" : "text", boxSizing: "border-box",
      } : {
        border: "1px solid #E5E7EB", borderRadius: 6,
        padding: "4px 6px", fontSize: 12, color: "#374151", background: "#fff",
        outline: "none", cursor: disabled ? "not-allowed" : "text",
      }}
    />
  );
}

function LeadScoreBadge({ score }: { score: LeadScore | null }) {
  if (!score) return <span style={{ color: "#D1D5DB", fontSize: 12 }}>—</span>;
  const cfg = LEAD_SCORE_CONFIG[score];
  return (
    <span style={{
      backgroundColor: cfg.bg, color: cfg.color,
      padding: "2px 8px", borderRadius: 999,
      fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
    }}>
      {cfg.label}
    </span>
  );
}

function CallButton({
  client, callingId, callingAll, onCall, full,
}: { client: Client; callingId: string | null; callingAll: boolean; onCall: (c: Client) => void; full?: boolean }) {
  const disabled = callingId === client.id || client.status === "calling" || client.status === "interested" || callingAll;
  return (
    <button onClick={() => onCall(client)} disabled={disabled}
      className={full ? "flex-1" : ""}
      style={{
        // Consistent blue outline, not a solid navy block — the interested
        // (green) and calling (light-blue) states are functional status
        // colors, not decoration, so they're untouched.
        backgroundColor: client.status === "interested" ? "#D1FAE5" : client.status === "calling" || callingId === client.id ? "#EFF6FF" : "#fff",
        color: client.status === "interested" ? "#065F46" : "#0C447C",
        border: client.status === "interested" || client.status === "calling" || callingId === client.id ? "none" : "1.5px solid #0C447C",
        borderRadius: full ? 8 : 6, padding: full ? "9px" : "6px 12px",
        fontSize: full ? 13 : 12, fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer", whiteSpace: "nowrap",
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
        transition: "transform 0.15s ease",
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <Phone className="size-3.5" />
      {client.status === "interested" ? "Done" : callingId === client.id || client.status === "calling" ? "Calling…" : "Call"}
    </button>
  );
}

function ManualDialButton({ client, full }: { client: Client; full?: boolean }) {
  const href = telHref(client.phone);
  if (!href) {
    return (
      <span title="No valid phone number"
        className={full ? "flex-1" : ""}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
          backgroundColor: "#F9FAFB", color: "#D1D5DB", border: "1px solid #F3F4F6",
          borderRadius: full ? 8 : 6, padding: full ? "9px 14px" : "6px 10px",
          fontSize: full ? 13 : 12, fontWeight: 700, cursor: "not-allowed", whiteSpace: "nowrap",
        }}>
        <PhoneOutgoing className="size-3.5" />{full && "No number"}
      </span>
    );
  }
  return (
    <a href={href} title="Call manually (opens your phone's dialer)"
      className={full ? "flex-1" : ""}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
        backgroundColor: "#F3F4F6", color: "#374151", border: "1px solid #E5E7EB",
        borderRadius: full ? 8 : 6, padding: full ? "9px 14px" : "6px 10px",
        fontSize: full ? 13 : 12, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap",
      }}>
      <PhoneOutgoing className="size-3.5" />{full && "Manual"}
    </a>
  );
}

function ResetButton({ client, onReset, full }: { client: Client; onReset: (c: Client) => void; full?: boolean }) {
  if (client.status === "pending") return null;
  return (
    <button onClick={() => onReset(client)} title="Reset to Pending"
      style={{
        backgroundColor: "#fff", color: "#0C447C", border: "1.5px solid #0C447C",
        borderRadius: full ? 8 : 6, padding: full ? "9px 14px" : "6px 10px",
        fontSize: full ? 14 : 13, fontWeight: 700, cursor: "pointer",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}>
      <RotateCcw className="size-3.5" />
    </button>
  );
}

// Below the table, both desktop and mobile: page position + "Rows per
// page" + Previous/Next, and the "select all N matching" link — shown
// only once the whole current page is selected AND there's more than
// one page of matches, since selecting page-by-page already covers
// everything otherwise.
function PaginationFooter({
  page, pageSize, total, onPageChange, onPageSizeChange, allPageSelected, selectingAllMatching, onSelectAllMatching,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (n: number) => void;
  allPageSelected: boolean;
  selectingAllMatching: boolean;
  onSelectAllMatching: () => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div style={{
      padding: "10px 16px", borderTop: "1px solid #F1F5F9",
      display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10,
    }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, fontSize: 12, color: "#6B7280" }}>
        <span>Page {page} of {totalPages} · {total} client{total === 1 ? "" : "s"}</span>
        {allPageSelected && total > pageSize && (
          <button onClick={onSelectAllMatching} disabled={selectingAllMatching}
            style={{
              color: "#0C447C", fontWeight: 700, fontSize: 12, background: "none", border: "none",
              cursor: selectingAllMatching ? "wait" : "pointer", textDecoration: "underline", padding: 0,
            }}>
            {selectingAllMatching ? "Selecting…" : `Select all ${total} matching clients`}
          </button>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6B7280" }}>
          Rows per page
          <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}
            style={{ border: "1px solid #D1D5DB", borderRadius: 6, padding: "4px 6px", fontSize: 12, cursor: "pointer", background: "#fff" }}>
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => onPageChange(page - 1)} disabled={page <= 1}
            style={{
              border: "1px solid #D1D5DB", borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 600,
              color: page <= 1 ? "#D1D5DB" : "#374151", cursor: page <= 1 ? "not-allowed" : "pointer", background: "#fff",
            }}>
            Previous
          </button>
          <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}
            style={{
              border: "1px solid #D1D5DB", borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 600,
              color: page >= totalPages ? "#D1D5DB" : "#374151", cursor: page >= totalPages ? "not-allowed" : "pointer", background: "#fff",
            }}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

export function CrmTable({
  clients, loading, totalCount, total, page, pageSize,
  selectedIds, allPageSelected, somePageSelected, toggleSelect, toggleSelectAllOnPage,
  selectingAllMatching, onSelectAllMatching, onPageChange, onPageSizeChange,
  updatingId, callingId, callingAll,
  callOne, resetOne, updateManual,
}: {
  clients: Client[];
  loading: boolean;
  totalCount: number; // unfiltered tenant total — only for empty-state copy
  total: number;      // matching current search/status filter, across all pages
  page: number;
  pageSize: number;
  selectedIds: Set<string>;
  allPageSelected: boolean;
  somePageSelected: boolean;
  toggleSelect: (id: string) => void;
  toggleSelectAllOnPage: () => void;
  selectingAllMatching: boolean;
  onSelectAllMatching: () => void;
  onPageChange: (p: number) => void;
  onPageSizeChange: (n: number) => void;
  updatingId: string | null;
  callingId: string | null;
  callingAll: boolean;
  callOne: (c: Client) => void;
  resetOne: (c: Client) => void;
  updateManual: (c: Client, updates: { status?: CallStatus; response?: string; callback_at?: string | null }) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
    >
      {/* Desktop Table */}
      <div className="hidden overflow-hidden rounded-2xl border border-white/60 bg-white shadow-[0_4px_24px_rgba(12,68,124,0.08)] sm:block">
        {loading ? (
          <div style={{ padding: 48, textAlign: "center", color: "#6B7280" }}>Loading clients…</div>
        ) : clients.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📂</div>
            <div style={{ fontSize: 15, color: "#6B7280" }}>
              {totalCount === 0 ? "No clients yet — import a file to get started" : "No clients match this filter"}
            </div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ backgroundColor: "#F8FAFC", borderBottom: "2px solid #E2E8F0" }}>
                  <th style={{ padding: "12px 16px", width: 1 }}>
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      ref={(el) => { if (el) el.indeterminate = somePageSelected && !allPageSelected; }}
                      onChange={toggleSelectAllOnPage}
                      aria-label="Select all"
                      style={{ width: 16, height: 16, cursor: "pointer" }}
                    />
                  </th>
                  {["#", "Name", "Phone", "Status", "Score", "Response", "Callback", "Called At", "Action"].map((h) => (
                    <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontWeight: 700, color: "#374151", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clients.map((client, idx) => (
                  <tr key={client.id}
                    style={{
                      borderBottom: "1px solid #F1F5F9",
                      // Amber stays on the status badge only, not washed
                      // across the whole row — that's what was competing
                      // with the rest of the calm blue/white palette.
                      backgroundColor: client.status === "interested" ? "#F0FDF4" : "transparent",
                    }}>
                    <td style={{ padding: "11px 16px" }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(client.id)}
                        onChange={() => toggleSelect(client.id)}
                        aria-label={`Select ${client.name}`}
                        style={{ width: 16, height: 16, cursor: "pointer" }}
                      />
                    </td>
                    <td style={{ padding: "11px 16px", color: "#9CA3AF" }}>{(page - 1) * pageSize + idx + 1}</td>
                    <td style={{ padding: "11px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Avatar client={client} />
                        <span style={{ fontWeight: 600, color: "#111827" }}>
                          {client.status === "interested" && "🔥 "}
                          {client.status === "call_back" && "🔁 "}
                          {client.name}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: "11px 16px", color: "#374151", whiteSpace: "nowrap" }}>{formatPhone(client.phone)}</td>
                    <td style={{ padding: "11px 16px" }}>
                      <StatusSelect
                        status={client.status}
                        disabled={updatingId === client.id}
                        onChange={(s) => updateManual(client, { status: s })}
                      />
                    </td>
                    <td style={{ padding: "11px 16px" }}><LeadScoreBadge score={client.lead_score} /></td>
                    <td style={{ padding: "11px 16px", color: "#6B7280", maxWidth: 200 }}>
                      <ResponseInput
                        client={client}
                        disabled={updatingId === client.id}
                        onSave={(value) => updateManual(client, { response: value })}
                      />
                    </td>
                    <td style={{ padding: "11px 16px" }}>
                      <CallbackInput
                        client={client}
                        disabled={updatingId === client.id}
                        onSave={(value) => updateManual(client, { callback_at: value })}
                      />
                    </td>
                    <td style={{ padding: "11px 16px", color: "#9CA3AF", whiteSpace: "nowrap" }}>
                      {client.called_at ? new Date(client.called_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                    </td>
                    <td style={{ padding: "11px 16px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <CallButton client={client} callingId={callingId} callingAll={callingAll} onCall={callOne} />
                        <ManualDialButton client={client} />
                        <ResetButton client={client} onReset={resetOne} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {clients.length > 0 && (
          <PaginationFooter
            page={page} pageSize={pageSize} total={total}
            onPageChange={onPageChange} onPageSizeChange={onPageSizeChange}
            allPageSelected={allPageSelected} selectingAllMatching={selectingAllMatching} onSelectAllMatching={onSelectAllMatching}
          />
        )}
      </div>

      {/* Mobile Cards */}
      <div className="sm:hidden">
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#6B7280" }}>Loading clients…</div>
        ) : clients.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📂</div>
            <div style={{ fontSize: 14, color: "#6B7280" }}>
              {totalCount === 0 ? "No clients yet — import a file to get started" : "No clients match this filter"}
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px 8px" }}>
              <input
                type="checkbox"
                checked={allPageSelected}
                ref={(el) => { if (el) el.indeterminate = somePageSelected && !allPageSelected; }}
                onChange={toggleSelectAllOnPage}
                aria-label="Select all"
                style={{ width: 16, height: 16, cursor: "pointer" }}
              />
              <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 600 }}>Select all</span>
            </div>
            {clients.map((client, idx) => (
              <div key={client.id}
                style={{
                  background: "#fff", borderRadius: 14, padding: "14px 16px", marginBottom: 10,
                  boxShadow: "0 2px 10px rgba(12,68,124,0.06)", display: "grid", gap: 8,
                  borderLeft: client.status === "interested" ? "4px solid #065F46" : "4px solid transparent",
                  backgroundColor: client.status === "interested" ? "#F7FEFA" : undefined,
                }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(client.id)}
                      onChange={() => toggleSelect(client.id)}
                      aria-label={`Select ${client.name}`}
                      style={{ width: 16, height: 16, cursor: "pointer", flexShrink: 0 }}
                    />
                    <span style={{ fontSize: 11, color: "#9CA3AF", minWidth: 16 }}>{(page - 1) * pageSize + idx + 1}.</span>
                    <Avatar client={client} />
                    <span style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>
                      {client.status === "interested" && "🔥 "}
                      {client.status === "call_back" && "🔁 "}
                      {client.name}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <LeadScoreBadge score={client.lead_score} />
                    <StatusSelect
                      status={client.status}
                      disabled={updatingId === client.id}
                      onChange={(s) => updateManual(client, { status: s })}
                    />
                  </div>
                </div>
                <div style={{ fontSize: 13, color: "#374151" }}>📱 {formatPhone(client.phone)}</div>
                <ResponseInput
                  client={client}
                  boxed
                  disabled={updatingId === client.id}
                  onSave={(value) => updateManual(client, { response: value })}
                />
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", marginBottom: 3 }}>Callback</label>
                  <CallbackInput
                    client={client}
                    boxed
                    disabled={updatingId === client.id}
                    onSave={(value) => updateManual(client, { callback_at: value })}
                  />
                </div>
                {client.called_at && (
                  <div style={{ fontSize: 11, color: "#9CA3AF" }}>
                    Called: {new Date(client.called_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <CallButton client={client} callingId={callingId} callingAll={callingAll} onCall={callOne} full />
                  <ManualDialButton client={client} full />
                  <ResetButton client={client} onReset={resetOne} full />
                </div>
              </div>
            ))}
            <PaginationFooter
              page={page} pageSize={pageSize} total={total}
              onPageChange={onPageChange} onPageSizeChange={onPageSizeChange}
              allPageSelected={allPageSelected} selectingAllMatching={selectingAllMatching} onSelectAllMatching={onSelectAllMatching}
            />
          </>
        )}
      </div>
    </motion.div>
  );
}
