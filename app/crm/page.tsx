"use client";
import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Upload, Plus, Search, Phone, Download } from "lucide-react";
import { CALL_STATUSES, type CallStatus } from "@/lib/types";
import { PhoneInput } from "@/components/ui/phone-input";
import { CrmDashboardHeader } from "@/components/crm/CrmDashboardHeader";
import { CrmTable, formatPhone } from "@/components/crm/CrmTable";

export type LeadScore = "hot" | "warm" | "cold";

export interface Client {
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

const STATUS_PRIORITY: Record<CallStatus, number> = {
  interested: 1, call_back: 2, calling: 3, pending: 4, no_answer: 5, failed: 6, not_interested: 7,
};

const LEAD_SCORE_PRIORITY: Record<LeadScore, number> = { hot: 1, warm: 2, cold: 3 };
const LEAD_SCORE_NONE_PRIORITY = 4; // unscored (call not yet ended) sinks to the bottom when sorting by score

const STATUS_LABELS: Record<CallStatus, string> = {
  interested: "Interested ✅", call_back: "Call Back 🔁", calling: "Calling…",
  pending: "Pending", no_answer: "No Answer", failed: "Failed", not_interested: "Not Interested",
};

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
  async function updateManual(client: Client, updates: { status?: CallStatus; response?: string; callback_at?: string | null }) {
    setUpdatingId(client.id);
    try {
      const res = await fetch("/api/crm/manual-status", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: client.id, ...updates }),
      });
      if (!res.ok) throw new Error();
      // Scheduling a callback isn't a call outcome, so only stamp called_at
      // locally when this update actually touched status/response — matches
      // what the API route does server-side.
      const touchedCallOutcome = updates.status !== undefined || updates.response !== undefined;
      setClients((prev) => prev.map((c) => c.id === client.id
        ? {
            ...c,
            ...updates,
            response: updates.response !== undefined ? (updates.response || null) : c.response,
            called_at: touchedCallOutcome ? new Date().toISOString() : c.called_at,
          }
        : c));
      showToast(`${client.name} updated`, "ok");
    } catch {
      showToast("Update failed", "err");
    } finally {
      setUpdatingId(null);
    }
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
      const pa = a.lead_score ? LEAD_SCORE_PRIORITY[a.lead_score] : LEAD_SCORE_NONE_PRIORITY;
      const pb = b.lead_score ? LEAD_SCORE_PRIORITY[b.lead_score] : LEAD_SCORE_NONE_PRIORITY;
      return pa - pb;
    }
    return STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
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
    <div
      className="min-h-screen px-3 py-4 sm:px-6 sm:py-6"
      style={{ background: "linear-gradient(180deg, #F4F7FB 0%, #EEF3F9 100%)" }}
    >
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
        <div
          className="fixed inset-x-4 z-[9997] mx-auto flex max-w-xl flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 text-white shadow-2xl sm:bottom-4"
          style={{ background: "linear-gradient(135deg, #0C447C, #071C33)", bottom: "calc(74px + env(safe-area-inset-bottom))" }}
        >
          <span className="text-sm font-semibold">{selectedIds.size} selected</span>
          <div className="flex gap-2">
            <button onClick={() => setSelectedIds(new Set())} disabled={bulkDeleting}
              className="rounded-lg border border-white/25 px-3.5 py-2 text-[13px] font-semibold text-white/80 disabled:cursor-not-allowed">
              Clear selection
            </button>
            <button onClick={deleteSelected} disabled={bulkDeleting}
              className="rounded-lg bg-[#991B1B] px-3.5 py-2 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-70">
              {bulkDeleting ? "Deleting…" : "🗑️ Delete Selected"}
            </button>
          </div>
        </div>
      )}

      {/* Add Client modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-[#0F172A]/40 p-5"
          onClick={() => !adding && setShowAddModal(false)}>
          <div onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[360px] rounded-2xl bg-white p-5 shadow-2xl">
            <h2 className="mb-3.5 text-base font-bold text-[#0F172A]">Add Client</h2>

            <label className="mb-1 block text-xs font-semibold text-[#6B7280]">Name</label>
            <input type="text" value={addName} onChange={(e) => setAddName(e.target.value)}
              placeholder="Client name" autoFocus
              className="mb-3 w-full rounded-lg border border-[#E2E8F0] px-3 py-2.5 text-base" />

            <label className="mb-1 block text-xs font-semibold text-[#6B7280]">Phone</label>
            <PhoneInput value={addPhone} onChange={setAddPhone}
              placeholder="98765 43210"
              containerClassName="mb-4.5"
              chipClassName="border-[#E2E8F0] bg-[#F3F4F6] text-[#6B7280]"
              inputClassName="border-[#E2E8F0]" />

            <div className="flex gap-2">
              <button onClick={() => setShowAddModal(false)} disabled={adding}
                className="flex-1 rounded-lg bg-[#F3F4F6] py-2.5 text-[13px] font-bold text-[#374151] disabled:cursor-not-allowed">
                Cancel
              </button>
              <button onClick={handleAddClient} disabled={adding || !addName.trim() || !addPhone.trim()}
                className="flex-1 rounded-lg bg-[#0C447C] py-2.5 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">
                {adding ? "Adding…" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Large rounded outer frame — the "premium shell" feel, contained
          entirely within this page's own content (the global sidebar/app
          chrome outside this file is untouched). */}
      <div className="mx-auto max-w-[1280px] rounded-[24px] bg-transparent">
        <CrmDashboardHeader
          clients={clients}
          stats={stats}
          callingAll={callingAll}
          callingId={callingId}
          callAllPending={callAllPending}
          interestedLeads={interestedLeads}
          callBackLeads={callBackLeads}
          showReminder={showReminder}
          setReminderDismissed={setReminderDismissed}
          setFilterStatus={setFilterStatus}
        />

        {/* Toolbar */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.4 }}
          className="my-4 flex flex-wrap items-center gap-2.5 rounded-2xl border border-white/60 bg-white p-3.5 shadow-[0_2px_12px_rgba(12,68,124,0.06)]"
        >
          <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[#0C447C] px-4 py-2.5 text-[13px] font-bold text-white transition-opacity hover:opacity-90"
            style={{ cursor: uploading ? "wait" : "pointer", opacity: uploading ? 0.7 : 1 }}>
            <Upload className="size-3.5" />
            {uploading ? "Importing…" : "Import File"}
            <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.xlsm,.csv"
              className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>

          <button onClick={() => setShowAddModal(true)}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-[#0C447C] bg-white px-4 py-2.5 text-[13px] font-bold text-[#0C447C]">
            <Plus className="size-3.5" />
            Add Client
          </button>

          {uploadedCount !== null && (
            <span className="text-[13px] font-semibold text-[#065F46]">✅ {uploadedCount} imported</span>
          )}

          <div className="hidden flex-1 sm:block" />

          <div className="relative w-full sm:w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#9CA3AF]" />
            <input type="text" placeholder="Search name or phone…"
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-[#D1D5DB] py-2 pl-8 pr-3 text-base outline-none" />
          </div>

          <select value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as CallStatus | "all")}
            className="w-full cursor-pointer rounded-lg border border-[#D1D5DB] bg-white px-2.5 py-2 text-base text-[#374151] sm:w-auto">
            <option value="all">All Statuses</option>
            {CALL_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>

          <select value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "priority" | "score")}
            title="Sort order"
            className="w-full cursor-pointer rounded-lg border border-[#D1D5DB] bg-white px-2.5 py-2 text-base text-[#374151] sm:w-auto">
            <option value="priority">Sort: Priority</option>
            <option value="score">Sort: Lead Score</option>
          </select>

          <button onClick={callAllPending}
            disabled={callingAll || stats.pending === 0}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            style={{ backgroundColor: callingAll ? "#6B7280" : "#F5A623" }}>
            <Phone className="size-3.5" />
            {callingAll ? "Calling…" : `Call All (${stats.pending})`}
          </button>

          <button onClick={() => exportToCSV(filtered)}
            disabled={filtered.length === 0}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#0D3260] px-4 py-2.5 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
            <Download className="size-3.5" />
            Export CSV
          </button>
        </motion.div>

        <CrmTable
          filtered={filtered}
          loading={loading}
          totalCount={clients.length}
          selectedIds={selectedIds}
          allFilteredSelected={allFilteredSelected}
          someFilteredSelected={someFilteredSelected}
          toggleSelect={toggleSelect}
          toggleSelectAllFiltered={toggleSelectAllFiltered}
          updatingId={updatingId}
          callingId={callingId}
          callingAll={callingAll}
          callOne={callOne}
          resetOne={resetOne}
          updateManual={updateManual}
        />
      </div>
    </div>
  );
}
