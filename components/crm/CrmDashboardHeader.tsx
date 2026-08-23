"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Users, Clock, Star, PhoneCall, XCircle, Phone, Bell, X } from "lucide-react";
import type { CallStatus } from "@/lib/types";
import type { Client } from "@/app/crm/page";
import { formatPhone } from "@/components/crm/CrmTable";

// Plain useEffect+state count-up — no new dependency, mirrors the
// lightweight animation idiom already used elsewhere in this app
// (framer-motion for entrance, small local hooks for numeric ticks).
//
// Animates ONLY on first mount. The page polls /api/crm/clients every 5s
// (app/crm/page.tsx), so `target` can change at any time from background
// AI-calling activity — re-running the rAF loop on every one of those
// changes was what caused the page to feel like it never stopped
// "working" even while idle. Every update after the initial mount just
// snaps straight to the new value with no animation.
function useCountUp(target: number, durationMs = 800) {
  const [value, setValue] = useState(0);
  const hasAnimatedRef = useRef(false);
  useEffect(() => {
    if (hasAnimatedRef.current) {
      setValue(target);
      return;
    }
    hasAnimatedRef.current = true;
    let raf: number;
    const start = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

// One consistent light-blue icon treatment across all 5 cards — a
// different color per card (blue/gray/green/amber/red) was exactly the
// kind of competing-color noise the page is meant to avoid now. The
// number/label stay neutral navy/gray; nothing here is amber except the
// two places that are supposed to stay amber (the Call Back badge and
// the primary Call All / Start AI Calling button — both live elsewhere).
function KpiCard({
  label, value, icon: Icon, onClick, delay,
}: { label: string; value: number; icon: React.ElementType; onClick: () => void; delay: number }) {
  const count = useCountUp(value);
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      whileHover={{ y: -2 }}
      className="relative overflow-hidden rounded-2xl border border-white/60 bg-white p-4 text-left shadow-[0_2px_12px_rgba(12,68,124,0.06)] transition-shadow hover:shadow-[0_6px_20px_rgba(12,68,124,0.12)]"
    >
      <div className="flex items-center justify-between">
        <span className="flex size-8 items-center justify-center rounded-lg bg-[#0C447C]/10 text-[#0C447C]">
          <Icon className="size-4" />
        </span>
      </div>
      <div className="mt-2.5 text-2xl font-extrabold text-[#0C1E33]">{count}</div>
      <div className="mt-0.5 text-[11px] font-medium text-[#64748B]">{label}</div>
      <span className="absolute inset-x-0 bottom-0 h-1 bg-[#0C447C]/25" />
    </motion.button>
  );
}

export function CrmDashboardHeader({
  stats, callingAll, callingId, callAllPending,
  interestedLeads, callBackLeads, showReminder, setReminderDismissed, setFilterStatus,
}: {
  // `called` is a global tenant-wide count (see app/api/crm/clients/
  // route.ts's stats query) — this component never sees the full client
  // list post-pagination, so calledCount can't be derived locally anymore.
  stats: { total: number; pending: number; interested: number; callBack: number; notInterested: number; called: number };
  callingAll: boolean;
  callingId: string | null;
  callAllPending: () => void;
  interestedLeads: Client[];
  callBackLeads: Client[];
  showReminder: boolean;
  setReminderDismissed: (v: boolean) => void;
  setFilterStatus: (s: CallStatus | "all") => void;
}) {
  const calledCount = stats.called;
  const isCallingNow = callingAll || callingId !== null;

  return (
    <div className="space-y-4">
      {/* Hero + efficiency */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="relative overflow-hidden rounded-3xl border border-white/50 p-6 shadow-[0_8px_32px_rgba(12,68,124,0.12)] sm:p-8"
          // No backdrop-filter here — it's one of the most expensive CSS
          // properties (constant compositing cost for as long as the
          // element is on screen, not just during an animation) and this
          // card is always visible. A plain, slightly higher-opacity
          // background reads as the same soft "glass" card without paying
          // for a live blur on every frame.
          style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.94), rgba(240,246,251,0.9))" }}
        >
          {/* Amber glow, brand-colored — soft even when idle, brighter while calling */}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute left-1/2 top-1/2 size-64 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl ${isCallingNow ? "animate-glow-pulse" : ""}`}
            style={{ background: "radial-gradient(circle, rgba(245,166,35,0.35), transparent 70%)" }}
          />

          <div className="relative flex flex-col items-center gap-5 text-center sm:flex-row sm:justify-between sm:text-left">
            <div className="sm:max-w-[220px]">
              {/* The global sidebar (which normally carries the Amsu mark)
                  hides below md — without this, mobile visitors would see
                  no brand mark anywhere on the page. */}
              <img src="/brand/amsu-mark.png" alt="Amsu" className="mx-auto mb-1.5 size-6 object-contain sm:hidden" />
              <h2 className="text-lg font-extrabold text-[#0C1E33] sm:text-xl">AI Calling</h2>
              <p className="mt-1 text-[13px] text-[#64748B]">
                Import leads and let the AI caller work through your pending list.
              </p>
            </div>

            {/* Blue throughout, active vs idle told apart by pulse motion
                and a stronger tint — amber is reserved for the Call Back
                badge and the primary CTA below, not a generic "active"
                indicator. */}
            <div className="relative flex flex-col items-center gap-2">
              <div className="relative flex size-20 items-center justify-center">
                {isCallingNow && (
                  <>
                    <span className="absolute inset-0 animate-pulse-ring rounded-full border-2 border-[#0C447C]" />
                    <span className="absolute inset-0 animate-pulse-ring rounded-full border-2 border-[#0C447C]" style={{ animationDelay: "0.7s" }} />
                  </>
                )}
                <span
                  className="relative flex size-16 items-center justify-center rounded-full text-white shadow-lg"
                  style={{ background: "linear-gradient(135deg, #0C447C, #082C4F)" }}
                >
                  <Phone className="size-6" />
                </span>
              </div>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${isCallingNow ? "bg-[#0C447C]/20 text-[#0C447C]" : "bg-[#0C447C]/10 text-[#0C447C]"}`}>
                <span className={`size-1.5 rounded-full bg-[#0C447C] ${isCallingNow ? "animate-glow-pulse" : ""}`} />
                {isCallingNow ? "AI Calling in Progress…" : "AI Caller Ready"}
              </span>
            </div>

            <button
              onClick={callAllPending}
              disabled={callingAll || stats.pending === 0}
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-md transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #0C447C, #082C4F)" }}
            >
              <Phone className="size-4" />
              {callingAll ? "Calling…" : `Start AI Calling (${stats.pending})`}
            </button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className="rounded-3xl border border-white/60 bg-white p-5 shadow-[0_4px_24px_rgba(12,68,124,0.08)]"
        >
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#64748B]">Calling Efficiency</div>
          <div className="flex items-center gap-4">
            <div className="relative flex size-20 shrink-0 items-center justify-center">
              <EfficiencyDonutRing calledCount={calledCount} interestedCount={stats.interested} />
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-6">
                <span className="text-[#64748B]">Total Leads</span>
                <span className="font-bold text-[#0C1E33]">{stats.total}</span>
              </div>
              <div className="flex items-center justify-between gap-6">
                <span className="text-[#64748B]">Called</span>
                <span className="font-bold text-[#0C1E33]">{calledCount}</span>
              </div>
              <div className="flex items-center justify-between gap-6">
                <span className="text-[#64748B]">Interested</span>
                <span className="font-bold text-[#065F46]">{stats.interested}</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Compact floating follow-up card */}
      {showReminder && (interestedLeads.length > 0 || callBackLeads.length > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="flex flex-col gap-3 rounded-2xl border border-[#0C447C]/15 bg-white p-4 shadow-[0_4px_20px_rgba(12,68,124,0.08)] sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-3">
            {/* This card covers both Interested and Call Back leads, so
                its bell icon isn't specific to either status — stays
                blue, same reasoning as the hero's "active" indicator
                above. The two buttons below DO map to one specific
                status each, so they keep that status's own badge color
                (green / amber) — consistent with the badges themselves
                carrying color per the row-tint fix. */}
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#0C447C]/10 text-[#0C447C]">
              <Bell className="size-4" />
            </span>
            <div>
              <div className="text-[13px] font-bold text-[#0C1E33]">Action Required — Follow Up Now</div>
              <div className="text-[12px] text-[#64748B]">
                {interestedLeads.length > 0 && `${interestedLeads.length} interested lead${interestedLeads.length > 1 ? "s" : ""}`}
                {interestedLeads.length > 0 && callBackLeads.length > 0 && " · "}
                {callBackLeads.length > 0 && `${callBackLeads.length} call back${callBackLeads.length > 1 ? "s" : ""} pending`}
                {(interestedLeads[0] ?? callBackLeads[0]) && ` — ${(interestedLeads[0] ?? callBackLeads[0]).name} · ${formatPhone((interestedLeads[0] ?? callBackLeads[0]).phone)}`}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {interestedLeads.length > 0 && (
              <button onClick={() => setFilterStatus("interested")}
                className="rounded-lg bg-[#065F46] px-3 py-1.5 text-[11px] font-bold text-white">
                View Interested
              </button>
            )}
            {callBackLeads.length > 0 && (
              <button onClick={() => setFilterStatus("call_back")}
                className="rounded-lg bg-[#F5A623] px-3 py-1.5 text-[11px] font-bold text-white">
                View Call Backs
              </button>
            )}
            <button onClick={() => setReminderDismissed(true)}
              className="flex size-7 items-center justify-center rounded-lg text-[#64748B] hover:bg-[#F1F5F9]" aria-label="Dismiss">
              <X className="size-4" />
            </button>
          </div>
        </motion.div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        <KpiCard label="Total Leads" value={stats.total} icon={Users} onClick={() => setFilterStatus("all")} delay={0.15} />
        <KpiCard label="Pending" value={stats.pending} icon={Clock} onClick={() => setFilterStatus("pending")} delay={0.2} />
        <KpiCard label="Interested" value={stats.interested} icon={Star} onClick={() => setFilterStatus("interested")} delay={0.25} />
        <KpiCard label="Call Back" value={stats.callBack} icon={PhoneCall} onClick={() => setFilterStatus("call_back")} delay={0.3} />
        <KpiCard label="Not Interested" value={stats.notInterested} icon={XCircle} onClick={() => setFilterStatus("not_interested")} delay={0.35} />
      </div>
    </div>
  );
}

// Small standalone ring (distinct from the unused EfficiencyDonut sketch
// above it) — kept simple: one animated circle, real numbers passed in.
//
// Animates in once, 50ms after mount. `pct` can change on every 5s poll
// (background AI-calling activity moves calledCount/interestedCount) —
// re-running the full 1s eased transition on every one of those changes
// is what made the ring look like it was constantly working even while
// the user was idle. After the initial animate-in, later value changes
// snap instantly (duration 0) instead of re-transitioning.
function EfficiencyDonutRing({ calledCount, interestedCount }: { calledCount: number; interestedCount: number }) {
  const pct = calledCount > 0 ? Math.round((interestedCount / calledCount) * 100) : 0;
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const [ready, setReady] = useState(false);
  const hasAnimatedRef = useRef(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), 50); return () => clearTimeout(t); }, []);
  useEffect(() => { if (ready) hasAnimatedRef.current = true; }, [ready]);

  return (
    <>
      <svg viewBox="0 0 84 84" className="size-20 -rotate-90">
        <circle cx="42" cy="42" r={radius} fill="none" stroke="#EEF2F6" strokeWidth="9" />
        <motion.circle
          cx="42" cy="42" r={radius} fill="none" stroke="#0C447C" strokeWidth="9" strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: ready ? circumference - (pct / 100) * circumference : circumference }}
          transition={{ duration: hasAnimatedRef.current ? 0 : 1, ease: "easeOut" }}
        />
      </svg>
      <span className="absolute text-base font-extrabold text-[#0C1E33]">{pct}%</span>
    </>
  );
}
