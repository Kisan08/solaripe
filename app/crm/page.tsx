"use client";
import { useState, useEffect, useRef } from "react";
import { CALL_STATUSES, type CallStatus } from "@/lib/types";
import { cleanPhone } from "@/lib/phone";

type LeadScore = "hot" | "warm" | "cold";

interface Client {
  id: string;
  name: string;
  phone: string;
  status: CallStatus;
  response: string | null;
  called_at: string | null;
  created_at: string;
  lead_score: LeadScore | null;
  callback_at: string | null;
  reminder_sent_at: string | null;
}

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

// Set once, server-side, when a call ends (lib/calling/leadScore.ts) —
// this table is display-only, no editing here.
const LEAD_SCORE_CONFIG: Record<LeadScore, { label: string; color: string; bg: string; priority: number }> = {
  hot:  { label: "🔥 Hot",  color: "#991B1B", bg: "#FEE2E2", priority: 1 },
  warm: { label: "🟡 Warm", color: "#92400E", bg: "#FEF3C7", priority: 2 },
  cold: { label: "🔵 Cold", color: "#1E40AF", bg: "#DBEAFE", priority: 3 },
};
const LEAD_SCORE_NONE_PRIORITY = 4; // unscored (call not yet ended) sinks to the bottom when sorting by score

// A live <select> styled to read the same as the old read-only status
// badge, so a manual caller can update a client's status inline — right
// in the table row, no modal — while the AI pipeline and Gigi keep
// setting it exactly as before through their own existing paths.
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

function formatPhone(p: string) {
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

function exportToCSV(clients: Client[]) {
  const header = ["Name", "Phone", "Status", "Response", "Called At", "Created At"];
  const rows = clients.map((c) => [c.name, c.phone, c.status, c.response ?? "", c.called_at ?? "", c.created_at]);
  const csv = [header, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "crm_clients.csv"; a.click();
  URL.revokeObjectURL(url);
}

export default function CRMPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [callingId, setCallingId] = useState<string | null>(null);
  const [callingAll, setCallingAll] = useState(false);
  const [filterStatus, setFilterStatus] = useState<CallStatus | "all">("all");
  const [sortBy, setSortBy] = useState<"priority" | "score">("priority");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [uploadedCount, setUploadedCount] = useState<number | null>(null);
  const [reminderDismissed, setReminderDismissed] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addName, setAddName] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [adding, setAdding] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const notifiedRef = useRef<Set<string>>(new Set());

  const fetchClientsRef = useRef(async () => {
    try {
      const res = await fetch("/api/crm/clients");
      if (!res.ok) { console.error("fetchClients error", res.status); return; }
      const data: Client[] = await res.json();
      setClients(data);
    } catch (err) {
      console.error("fetchClients exception:", err);
    } finally {
      setLoading(false);
    }
  });

  const fetchClients = fetchClientsRef.current;

  // Browser notification permission
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const run = () => { fetchClientsRef.current(); };
    run();
    pollRef.current = setInterval(run, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Fire browser notification for newly interested leads
  useEffect(() => {
    const interested = clients.filter((c) => c.status === "interested");
    for (const c of interested) {
      if (!notifiedRef.current.has(c.id)) {
        notifiedRef.current.add(c.id);
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("🔥 Interested Lead!", {
            body: `${c.name} (${formatPhone(c.phone)}) is interested in solar!`,
            icon: "/logo.png",
          });
        }
      }
    }
  }, [clients]);

  function showToast(msg: string, type: "ok" | "err") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setUploadedCount(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/extract-clients", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).error ?? "Upload failed");
      const { inserted } = await res.json();
      setUploadedCount(inserted);
      showToast(`${inserted} clients imported`, "ok");
      await fetchClients();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Upload failed", "err");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleAddClient() {
    setAdding(true);
    try {
      const dupRes = await fetch("/api/check-phone", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: addPhone, currentTable: "clients" }),
      });
      const { matches } = await dupRes.json().catch(() => ({ matches: [] }));
      if (matches?.length > 0) {
        const m = matches[0];
        const when = m.created_at ? new Date(m.created_at).toLocaleDateString("en-IN") : "unknown date";
        // m.label already reads naturally as "an AI Calling client"
        // (cross-table) or "another AI Calling client" (same-table).
        const proceed = window.confirm(
          `This number already exists as ${m.label}: ${m.name} — created ${when}. Continue adding it as a client anyway?`
        );
        if (!proceed) { setAdding(false); return; }
      }

      const res = await fetch("/api/crm/clients", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: addName, phone: addPhone }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to add client");
      showToast(`${addName} added`, "ok");
      setShowAddModal(false);
      setAddName(""); setAddPhone("");
      await fetchClients();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to add client", "err");
    } finally {
      setAdding(false);
    }
  }

  async function callOne(client: Client) {
    setCallingId(client.id);
    try {
      const res = await fetch("/api/make-call", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: client.id, phone: client.phone, name: client.name }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Call failed");
      showToast(`Calling ${client.name}…`, "ok");
      setClients((prev) => prev.map((c) => c.id === client.id ? { ...c, status: "calling" } : c));
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Call failed", "err");
    } finally { setCallingId(null); }
  }

  async function resetOne(client: Client) {
    try {
      const res = await fetch("/api/crm/reset", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: client.id }),
      });
      if (!res.ok) throw new Error();
      setClients((prev) => prev.map((c) => c.id === client.id ? { ...c, status: "pending", response: null, called_at: null } : c));
      showToast(`${client.name} reset to pending`, "ok");
    } catch { showToast("Reset failed", "err"); }
  }

  // Lets a person doing manual calling log an outcome the same way the AI
  // pipeline does — status and/or a free-text response, with called_at
  // stamped to now() server-side so manually-called leads show accurate
  // "Called At" info too.
  async function updateManual(client: Client, updates: { status?: CallStatus; response?: string }) {
    setUpdatingId(client.id);
    try {
      const res = await fetch("/api/crm/manual-status", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: client.id, ...updates }),
      });
      if (!res.ok) throw new Error();
      const calledAt = new Date().toISOString();
      setClients((prev) => prev.map((c) => c.id === client.id
        ? { ...c, ...updates, response: updates.response !== undefined ? (updates.response || null) : c.response, called_at: calledAt }
        : c));
      showToast(`${client.name} updated`, "ok");
    } catch {
      showToast("Update failed", "err");
    } finally {
      setUpdatingId(null);
    }
  }

  async function deleteOne(client: Client) {
    const confirmed = window.confirm(
      `Delete ${client.name}? This removes them from the AI Calling list along with their call history. This can't be undone.`
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/crm/clients?id=${encodeURIComponent(client.id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setClients((prev) => prev.filter((c) => c.id !== client.id));
      setSelectedIds((prev) => {
        if (!prev.has(client.id)) return prev;
        const next = new Set(prev);
        next.delete(client.id);
        return next;
      });
      showToast(`${client.name} deleted`, "ok");
    } catch { showToast("Delete failed", "err"); }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // "Select all" scopes to the currently filtered/searched rows, not the
  // whole client list — matching what's actually visible on screen.
  function toggleSelectAllFiltered() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = filtered.length > 0 && filtered.every((c) => next.has(c.id));
      if (allSelected) {
        filtered.forEach((c) => next.delete(c.id));
      } else {
        filtered.forEach((c) => next.add(c.id));
      }
      return next;
    });
  }

  async function deleteSelected() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const confirmed = window.confirm(
      `Delete ${ids.length} client${ids.length > 1 ? "s" : ""}? This cannot be undone.`
    );
    if (!confirmed) return;

    setBulkDeleting(true);
    try {
      const res = await fetch("/api/crm/clients", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error();
      const idSet = new Set(ids);
      setClients((prev) => prev.filter((c) => !idSet.has(c.id)));
      showToast(`${ids.length} client${ids.length > 1 ? "s" : ""} deleted`, "ok");
      setSelectedIds(new Set());
    } catch {
      showToast("Bulk delete failed", "err");
    } finally {
      setBulkDeleting(false);
    }
  }

  async function callAllPending() {
    const pending = clients.filter((c) => c.status === "pending");
    if (pending.length === 0) { showToast("No pending clients to call", "err"); return; }
    setCallingAll(true);
    try {
      for (const c of pending) {
        await fetch("/api/make-call", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: c.id, phone: c.phone, name: c.name }),
        });
        setClients((prev) => prev.map((x) => x.id === c.id ? { ...x, status: "calling" } : x));
        await new Promise((r) => setTimeout(r, 1200));
      }
      showToast(`Initiated calls for ${pending.length} clients`, "ok");
    } catch { showToast("Some calls failed", "err"); }
    finally { setCallingAll(false); }
  }

  // Sort: default is interested/call_back-first status priority (unchanged
  // behavior); "score" mode instead surfaces hot leads first regardless of
  // status, for scanning the whole list for buying signals at a glance.
  const sorted = [...clients].sort((a, b) => {
    if (sortBy === "score") {
      const pa = a.lead_score ? LEAD_SCORE_CONFIG[a.lead_score].priority : LEAD_SCORE_NONE_PRIORITY;
      const pb = b.lead_score ? LEAD_SCORE_CONFIG[b.lead_score].priority : LEAD_SCORE_NONE_PRIORITY;
      return pa - pb;
    }
    return STATUS_CONFIG[a.status].priority - STATUS_CONFIG[b.status].priority;
  });

  const filtered = sorted.filter((c) => {
    const matchStatus = filterStatus === "all" || c.status === filterStatus;
    const matchSearch = search === "" || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search);
    return matchStatus && matchSearch;
  });

  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));
  const someFilteredSelected = filtered.some((c) => selectedIds.has(c.id));

  const stats = {
    total:         clients.length,
    pending:       clients.filter((c) => c.status === "pending").length,
    interested:    clients.filter((c) => c.status === "interested").length,
    callBack:      clients.filter((c) => c.status === "call_back").length,
    notInterested: clients.filter((c) => c.status === "not_interested").length,
  };

  const interestedLeads = clients.filter((c) => c.status === "interested");
  const callBackLeads = clients.filter((c) => c.status === "call_back");
  const showReminder = !reminderDismissed && (interestedLeads.length > 0 || callBackLeads.length > 0);

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#F1F5F9" }}>

      <style>{`
        .crm-stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 16px; }
        .crm-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; background: #fff; border-radius: 10px; padding: 14px 16px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); margin-bottom: 16px; position: relative; z-index: 2; }
        .crm-search { border: 1px solid #D1D5DB; border-radius: 7px; padding: 8px 12px; font-size: 16px; width: 200px; outline: none; position: relative; z-index: 1; }
        .crm-select { border: 1px solid #D1D5DB; border-radius: 7px; padding: 8px 10px; font-size: 16px; cursor: pointer; background: #fff; color: #374151; -webkit-appearance: menulist; position: relative; z-index: 1; }
        .crm-select option { color: #374151; background: #fff; }
        .crm-card { background: #fff; border-radius: 10px; padding: 14px 16px; margin-bottom: 10px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); display: grid; gap: 8px; }
        .crm-card.interested { border-left: 4px solid #065F46; background: #F0FDF4; }
        .crm-card.call_back { border-left: 4px solid #F5A623; }
        .interested-row { background: #F0FDF4 !important; }
        .callback-row { background: #FFFBEB !important; }
        .crm-bulkbar { bottom: 16px; }
        @media (max-width: 640px) {
          .crm-bulkbar { bottom: calc(74px + env(safe-area-inset-bottom)); }
          .crm-stats { grid-template-columns: repeat(3, 1fr) !important; }
          .crm-stats .stat-hide { display: none; }
          .crm-actions { flex-direction: column; align-items: stretch; }
          .crm-search { width: 100% !important; }
          .crm-select { width: 100%; }
          .crm-btn { width: 100%; text-align: center; justify-content: center; }
          .crm-spacer { display: none; }
          .crm-desktop-table { display: none !important; }
          .crm-mobile-list { display: block !important; }
        }
        @media (min-width: 641px) {
          .crm-mobile-list { display: none !important; }
          .crm-desktop-table { display: block !important; }
          .crm-mobile-logo { display: none !important; }
        }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 16, right: 16, left: 16, zIndex: 9999,
          backgroundColor: toast.type === "ok" ? "#065F46" : "#991B1B",
          color: "#fff", padding: "12px 16px", borderRadius: 8,
          boxShadow: "0 4px 12px rgba(0,0,0,0.2)", fontSize: 14, fontWeight: 600,
          maxWidth: 360, margin: "0 auto",
        }}>
          {toast.msg}
        </div>
      )}

      {/* Bulk action bar — floats above the bottom nav (mobile) / at the
          bottom of the viewport (desktop) whenever any rows are selected. */}
      {selectedIds.size > 0 && (
        <div className="crm-bulkbar" style={{
          position: "fixed", left: 16, right: 16, zIndex: 9997,
          backgroundColor: "#0F172A", color: "#fff", borderRadius: 12,
          padding: "12px 16px", boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, maxWidth: 640, margin: "0 auto", flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            {selectedIds.size} selected
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setSelectedIds(new Set())} disabled={bulkDeleting}
              style={{
                backgroundColor: "transparent", color: "#CBD5E1", border: "1px solid #334155",
                borderRadius: 7, padding: "8px 14px", fontSize: 13, fontWeight: 600,
                cursor: bulkDeleting ? "not-allowed" : "pointer",
              }}>
              Clear selection
            </button>
            <button onClick={deleteSelected} disabled={bulkDeleting}
              style={{
                backgroundColor: "#991B1B", color: "#fff", border: "none",
                borderRadius: 7, padding: "8px 14px", fontSize: 13, fontWeight: 700,
                cursor: bulkDeleting ? "not-allowed" : "pointer", opacity: bulkDeleting ? 0.7 : 1,
              }}>
              {bulkDeleting ? "Deleting…" : `🗑️ Delete Selected`}
            </button>
          </div>
        </div>
      )}

      {/* Add Client modal */}
      {showAddModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 10000,
          backgroundColor: "rgba(15,23,42,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }} onClick={() => !adding && setShowAddModal(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{
            backgroundColor: "#fff", borderRadius: 14, padding: 20,
            width: "100%", maxWidth: 360, boxShadow: "0 12px 32px rgba(0,0,0,0.25)",
          }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", margin: "0 0 14px" }}>Add Client</h2>

            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 4 }}>Name</label>
            <input type="text" value={addName} onChange={(e) => setAddName(e.target.value)}
              placeholder="Client name" autoFocus
              style={{
                width: "100%", padding: "9px 12px", fontSize: 16, borderRadius: 8,
                border: "1px solid #E2E8F0", marginBottom: 12, boxSizing: "border-box",
              }} />

            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 4 }}>Phone</label>
            <input type="tel" value={addPhone} onChange={(e) => setAddPhone(e.target.value)}
              placeholder="10-digit mobile number"
              style={{
                width: "100%", padding: "9px 12px", fontSize: 16, borderRadius: 8,
                border: "1px solid #E2E8F0", marginBottom: 18, boxSizing: "border-box",
              }} />

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowAddModal(false)} disabled={adding}
                style={{
                  flex: 1, backgroundColor: "#F3F4F6", color: "#374151", border: "none",
                  borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 700,
                  cursor: adding ? "not-allowed" : "pointer",
                }}>
                Cancel
              </button>
              <button onClick={handleAddClient} disabled={adding || !addName.trim() || !addPhone.trim()}
                style={{
                  flex: 1, backgroundColor: "#1A4F8A", color: "#fff", border: "none",
                  borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 700,
                  cursor: adding || !addName.trim() || !addPhone.trim() ? "not-allowed" : "pointer",
                  opacity: adding || !addName.trim() || !addPhone.trim() ? 0.6 : 1,
                }}>
                {adding ? "Adding…" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page header — matches the plain title + subtitle pattern used on
          other pages (Dashboard, Leads, Projects) instead of the old
          hardcoded blue branding bar with its own "Home" link. Navigation
          now lives entirely in the shared sidebar. */}
      <div style={{ padding: "24px 20px 16px", borderBottom: "1px solid #E2E8F0", background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/brand/amsu-mark.png" alt="Amsu" className="crm-mobile-logo" style={{ width: 28, height: 28, objectFit: "contain", flexShrink: 0 }} />
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: 0 }}>AI Calling</h1>
        </div>
        <p style={{ fontSize: 13, color: "#64748B", margin: "4px 0 0" }}>Import leads and let the AI caller work through your pending list.</p>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "16px 12px" }}>

        {/* ── Reminder Banner ── */}
        {showReminder && (
          <div style={{
            backgroundColor: "#FFF7ED", border: "1px solid #F5A623",
            borderRadius: 10, padding: "14px 16px", marginBottom: 16,
            boxShadow: "0 2px 8px rgba(245,166,35,0.15)",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#92400E", marginBottom: 8 }}>
                  🔔 Action Required — Follow Up Now
                </div>
                {interestedLeads.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#065F46", marginBottom: 4 }}>
                      🔥 {interestedLeads.length} Interested Lead{interestedLeads.length > 1 ? "s" : ""} — Send Proposal Today
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {interestedLeads.map((c) => (
                        <div key={c.id} style={{
                          backgroundColor: "#D1FAE5", color: "#065F46",
                          padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                        }}>
                          {c.name} · {formatPhone(c.phone)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {callBackLeads.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#92400E", marginBottom: 4 }}>
                      🔁 {callBackLeads.length} Call Back{callBackLeads.length > 1 ? "s" : ""} Pending
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {callBackLeads.map((c) => (
                        <div key={c.id} style={{
                          backgroundColor: "#FEF3C7", color: "#92400E",
                          padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                        }}>
                          {c.name} · {formatPhone(c.phone)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <button onClick={() => setReminderDismissed(true)}
                style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#92400E", padding: 0, lineHeight: 1 }}>
                ✕
              </button>
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => setFilterStatus("interested")}
                style={{ backgroundColor: "#065F46", color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                View Interested
              </button>
              <button onClick={() => setFilterStatus("call_back")}
                style={{ backgroundColor: "#F5A623", color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                View Call Backs
              </button>
              <button onClick={() => { setFilterStatus("all"); setReminderDismissed(true); }}
                style={{ backgroundColor: "#F3F4F6", color: "#6B7280", border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Stat cards */}
        <div className="crm-stats">
          {[
            { label: "Total",       value: stats.total,         color: "#1A4F8A", hide: false },
            { label: "Pending",     value: stats.pending,       color: "#6B7280", hide: false },
            { label: "Interested",  value: stats.interested,    color: "#065F46", hide: false },
            { label: "Call Back",   value: stats.callBack,      color: "#92400E", hide: true  },
            { label: "Not Int.",    value: stats.notInterested, color: "#991B1B", hide: true  },
          ].map((s) => (
            <div key={s.label} className={s.hide ? "stat-hide" : ""}
              onClick={() => setFilterStatus(s.label === "Total" ? "all" : s.label === "Pending" ? "pending" : s.label === "Interested" ? "interested" : s.label === "Call Back" ? "call_back" : "not_interested")}
              style={{
                backgroundColor: "#fff", borderRadius: 10, padding: "12px 14px",
                boxShadow: "0 1px 4px rgba(0,0,0,0.08)", borderTop: `4px solid ${s.color}`,
                cursor: "pointer",
              }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="crm-actions">
          <label className="crm-btn" style={{
            backgroundColor: "#1A4F8A", color: "#fff", padding: "9px 16px",
            borderRadius: 7, fontSize: 13, fontWeight: 700,
            cursor: uploading ? "wait" : "pointer", opacity: uploading ? 0.7 : 1,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            {uploading ? "⏳ Importing…" : "📄 Import File"}
            <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.xlsm,.csv"
              style={{ display: "none" }} onChange={handleUpload} disabled={uploading} />
          </label>

          <button className="crm-btn" onClick={() => setShowAddModal(true)}
            style={{
              backgroundColor: "#fff", color: "#1A4F8A", border: "1px solid #1A4F8A",
              borderRadius: 7, padding: "9px 16px", fontSize: 13, fontWeight: 700,
              cursor: "pointer",
            }}>
            + Add Client
          </button>

          {uploadedCount !== null && (
            <span style={{ fontSize: 13, color: "#065F46", fontWeight: 600 }}>✅ {uploadedCount} imported</span>
          )}

          <div className="crm-spacer" style={{ flex: 1 }} />

          <input type="text" className="crm-search" placeholder="🔍 Search name or phone…"
            value={search} onChange={(e) => setSearch(e.target.value)} />

          <select className="crm-select" value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as CallStatus | "all")}>
            <option value="all">All Statuses</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
            ))}
          </select>

          <select className="crm-select" value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "priority" | "score")}
            title="Sort order">
            <option value="priority">Sort: Priority</option>
            <option value="score">Sort: Lead Score</option>
          </select>

          <button className="crm-btn" onClick={callAllPending}
            disabled={callingAll || stats.pending === 0}
            style={{
              backgroundColor: callingAll ? "#6B7280" : "#F5A623", color: "#fff",
              border: "none", borderRadius: 7, padding: "9px 16px", fontSize: 13,
              fontWeight: 700, cursor: callingAll || stats.pending === 0 ? "not-allowed" : "pointer",
              opacity: stats.pending === 0 ? 0.5 : 1,
            }}>
            {callingAll ? "📞 Calling…" : `📞 Call All (${stats.pending})`}
          </button>

          <button className="crm-btn" onClick={() => exportToCSV(filtered)}
            disabled={filtered.length === 0}
            style={{
              backgroundColor: "#0D3260", color: "#fff", border: "none",
              borderRadius: 7, padding: "9px 16px", fontSize: 13, fontWeight: 700,
              cursor: filtered.length === 0 ? "not-allowed" : "pointer",
              opacity: filtered.length === 0 ? 0.5 : 1,
            }}>
            ⬇ Export CSV
          </button>
        </div>

        {/* Desktop Table */}
        <div className="crm-desktop-table" style={{ backgroundColor: "#fff", borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: "center", color: "#6B7280" }}>Loading clients…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📂</div>
              <div style={{ fontSize: 15, color: "#6B7280" }}>
                {clients.length === 0 ? "No clients yet — import a file to get started" : "No clients match this filter"}
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
                        checked={allFilteredSelected}
                        ref={(el) => { if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected; }}
                        onChange={toggleSelectAllFiltered}
                        aria-label="Select all"
                        style={{ width: 16, height: 16, cursor: "pointer" }}
                      />
                    </th>
                    {["#", "Name", "Phone", "Status", "Score", "Response", "Called At", "Action"].map((h) => (
                      <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontWeight: 700, color: "#374151", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((client, idx) => (
                    <tr key={client.id}
                      className={client.status === "interested" ? "interested-row" : client.status === "call_back" ? "callback-row" : ""}
                      style={{ borderBottom: "1px solid #F1F5F9" }}>
                      <td style={{ padding: "11px 16px" }}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(client.id)}
                          onChange={() => toggleSelect(client.id)}
                          aria-label={`Select ${client.name}`}
                          style={{ width: 16, height: 16, cursor: "pointer" }}
                        />
                      </td>
                      <td style={{ padding: "11px 16px", color: "#9CA3AF" }}>{idx + 1}</td>
                      <td style={{ padding: "11px 16px", fontWeight: 600, color: "#111827" }}>
                        {client.status === "interested" && <span style={{ marginRight: 6 }}>🔥</span>}
                        {client.status === "call_back" && <span style={{ marginRight: 6 }}>🔁</span>}
                        {client.name}
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
                      <td style={{ padding: "11px 16px", color: "#9CA3AF", whiteSpace: "nowrap" }}>
                        {client.called_at ? new Date(client.called_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </td>
                      <td style={{ padding: "11px 16px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => callOne(client)}
                            disabled={callingId === client.id || client.status === "calling" || client.status === "interested" || callingAll}
                            style={{
                              backgroundColor: client.status === "interested" ? "#D1FAE5" : client.status === "calling" || callingId === client.id ? "#EFF6FF" : "#1A4F8A",
                              color: client.status === "interested" ? "#065F46" : client.status === "calling" || callingId === client.id ? "#1A4F8A" : "#fff",
                              border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 700,
                              cursor: callingId === client.id || client.status === "calling" || client.status === "interested" || callingAll ? "not-allowed" : "pointer",
                              whiteSpace: "nowrap",
                            }}>
                            {client.status === "interested" ? "✅ Done" : callingId === client.id || client.status === "calling" ? "📞 Calling…" : "📞 Call"}
                          </button>
                          {/* Manual dial — plain tel: link, no /api/make-call, no
                              Supabase/Twilio side effects. Purely hands off to
                              the device's own dialer; status only changes if
                              the user updates it afterward via the existing UI.
                              telHref() returns null for anything shorter than a
                              real 10-digit number — show a disabled indicator
                              instead of a broken tel: link in that case. */}
                          {telHref(client.phone) ? (
                            <a href={telHref(client.phone)!} title="Call manually (opens your phone's dialer)"
                              style={{
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                                backgroundColor: "#F3F4F6", color: "#374151", border: "1px solid #E5E7EB",
                                borderRadius: 6, padding: "6px 10px", fontSize: 12, fontWeight: 700,
                                textDecoration: "none", whiteSpace: "nowrap",
                              }}>
                              ☎️
                            </a>
                          ) : (
                            <span title="No valid phone number"
                              style={{
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                                backgroundColor: "#F9FAFB", color: "#D1D5DB", border: "1px solid #F3F4F6",
                                borderRadius: 6, padding: "6px 10px", fontSize: 12, fontWeight: 700,
                                cursor: "not-allowed", whiteSpace: "nowrap",
                              }}>
                              ☎️
                            </span>
                          )}
                          {client.status !== "pending" && (
                            <button onClick={() => resetOne(client)} title="Reset to Pending"
                              style={{ backgroundColor: "#F3F4F6", color: "#6B7280", border: "none", borderRadius: 6, padding: "6px 10px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                              ↺
                            </button>
                          )}
                          <button onClick={() => deleteOne(client)} title="Delete client"
                            style={{ backgroundColor: "#FEF2F2", color: "#991B1B", border: "1px solid #FEE2E2", borderRadius: 6, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {filtered.length > 0 && (
            <div style={{ padding: "10px 16px", borderTop: "1px solid #F1F5F9", fontSize: 12, color: "#9CA3AF", display: "flex", justifyContent: "space-between" }}>
              <span>Showing {filtered.length} of {clients.length} clients · Sorted by priority</span>
              <span>Auto-refreshes every 5s</span>
            </div>
          )}
        </div>

        {/* Mobile Cards */}
        <div className="crm-mobile-list">
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "#6B7280" }}>Loading clients…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📂</div>
              <div style={{ fontSize: 14, color: "#6B7280" }}>
                {clients.length === 0 ? "No clients yet — import a file to get started" : "No clients match this filter"}
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px 8px" }}>
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  ref={(el) => { if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected; }}
                  onChange={toggleSelectAllFiltered}
                  aria-label="Select all"
                  style={{ width: 16, height: 16, cursor: "pointer" }}
                />
                <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 600 }}>Select all</span>
              </div>
              {filtered.map((client, idx) => (
                <div key={client.id}
                  className={`crm-card ${client.status === "interested" ? "interested" : client.status === "call_back" ? "call_back" : ""}`}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(client.id)}
                        onChange={() => toggleSelect(client.id)}
                        aria-label={`Select ${client.name}`}
                        style={{ width: 16, height: 16, cursor: "pointer", flexShrink: 0 }}
                      />
                      <span style={{ fontSize: 11, color: "#9CA3AF", minWidth: 20 }}>{idx + 1}.</span>
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
                  {client.called_at && (
                    <div style={{ fontSize: 11, color: "#9CA3AF" }}>
                      Called: {new Date(client.called_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => callOne(client)}
                      disabled={callingId === client.id || client.status === "calling" || client.status === "interested" || callingAll}
                      style={{
                        flex: 1,
                        backgroundColor: client.status === "interested" ? "#D1FAE5" : client.status === "calling" || callingId === client.id ? "#EFF6FF" : "#1A4F8A",
                        color: client.status === "interested" ? "#065F46" : client.status === "calling" || callingId === client.id ? "#1A4F8A" : "#fff",
                        border: "none", borderRadius: 7, padding: "9px", fontSize: 13, fontWeight: 700,
                        cursor: callingId === client.id || client.status === "calling" || client.status === "interested" || callingAll ? "not-allowed" : "pointer",
                      }}>
                      {client.status === "interested" ? "✅ Done" : callingId === client.id || client.status === "calling" ? "📞 Calling…" : "📞 Call"}
                    </button>
                    {/* Manual dial — plain tel: link, no API call, no
                        Supabase/Twilio side effects. telHref() returns null
                        for anything shorter than a real 10-digit number. */}
                    {telHref(client.phone) ? (
                      <a href={telHref(client.phone)!} title="Call manually (opens your phone's dialer)"
                        style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
                          backgroundColor: "#F3F4F6", color: "#374151", border: "1px solid #E5E7EB",
                          borderRadius: 7, padding: "9px 14px", fontSize: 13, fontWeight: 700,
                          textDecoration: "none", whiteSpace: "nowrap",
                        }}>
                        ☎️ Manual
                      </a>
                    ) : (
                      <span title="No valid phone number"
                        style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
                          backgroundColor: "#F9FAFB", color: "#D1D5DB", border: "1px solid #F3F4F6",
                          borderRadius: 7, padding: "9px 14px", fontSize: 13, fontWeight: 700,
                          cursor: "not-allowed", whiteSpace: "nowrap",
                        }}>
                        ☎️ No number
                      </span>
                    )}
                    {client.status !== "pending" && (
                      <button onClick={() => resetOne(client)}
                        style={{ backgroundColor: "#F3F4F6", color: "#6B7280", border: "none", borderRadius: 7, padding: "9px 14px", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
                        ↺
                      </button>
                    )}
                    <button onClick={() => deleteOne(client)} title="Delete client"
                      style={{ backgroundColor: "#FEF2F2", color: "#991B1B", border: "1px solid #FEE2E2", borderRadius: 7, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
              <div style={{ padding: "10px 4px", fontSize: 12, color: "#9CA3AF", textAlign: "center" }}>
                Showing {filtered.length} of {clients.length} clients · Auto-refreshes every 5s
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
