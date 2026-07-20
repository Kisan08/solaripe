"use client"

import { useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { MapPin, Zap, Pencil, PenTool, History, AlertTriangle, Loader2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { projectTypeBadge, statusBadge } from "@/lib/badges"
import { formatINRCompact, formatDate } from "@/lib/format"
import type { Project } from "@/lib/types"
import {
  fetchProjectPipelineHistory,
  updateProjectPipelineStage,
  daysStale,
  type PipelineStage,
  type ProjectPipelineHistoryEntry,
} from "@/lib/pipeline"

const MILESTONES = [
  { key: "t1_paid", label: "T1" },
  { key: "t2_paid", label: "T2" },
  { key: "t3_paid", label: "T3" },
  { key: "t4_paid", label: "T4" },
] as const

// All stages including inactive ones, resolved by id — a project's
// current stage (or a past history entry) may point at a stage the
// tenant has since renamed or deactivated; it should still show a name.
function stageName(stageId: string | null, stages: PipelineStage[]): string {
  if (!stageId) return "No stage set"
  return stages.find((s) => s.id === stageId)?.name ?? "Unknown stage"
}

export function ProjectCard({
  project,
  index,
  stages,
  onEdit,
  onToggleMilestone,
  onStageChanged,
}: {
  project: Project
  index: number
  stages: PipelineStage[]
  onEdit: (p: Project) => void
  onToggleMilestone: (
    p: Project,
    field: "t1_paid" | "t2_paid" | "t3_paid" | "t4_paid",
    value: boolean,
  ) => void
  onStageChanged: () => void
}) {
  const paidCount = MILESTONES.filter((m) => project[m.key]).length
  const progress = (paidCount / MILESTONES.length) * 100

  const activeStages = stages.filter((s) => s.active)
  const stale = daysStale(project, stages)

  const [stageNotes, setStageNotes] = useState("")
  const [changingStage, setChangingStage] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<ProjectPipelineHistoryEntry[] | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  const handleStageSelect = async (stageId: string) => {
    if (!stageId || stageId === project.current_stage_id) return
    setChangingStage(true)
    try {
      await updateProjectPipelineStage(project.id, stageId, stageNotes)
      setStageNotes("")
      setHistory(null) // force a refetch next time history is opened, so the new entry shows
      onStageChanged()
    } finally {
      setChangingStage(false)
    }
  }

  const toggleHistory = async () => {
    const next = !historyOpen
    setHistoryOpen(next)
    if (next && history === null) {
      setHistoryLoading(true)
      try {
        setHistory(await fetchProjectPipelineHistory(project.id))
      } finally {
        setHistoryLoading(false)
      }
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.06, 0.3) }}
      whileHover={{ y: -3 }}
    >
      <Card className="flex h-full flex-col p-5 transition-shadow duration-200 hover:card-shadow-hover">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold tracking-tight text-foreground">
              {project.client_name}
            </h3>
            {project.address && (
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3.5" />
                {project.address}
              </p>
            )}
          </div>
          <button
            onClick={() => onEdit(project)}
            aria-label="Edit project"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Pencil className="size-4" />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge className={projectTypeBadge[project.project_type]}>
            {project.project_type}
          </Badge>
          <Badge className={statusBadge[project.status]}>
            {project.status}
          </Badge>
          {project.system_size != null && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Zap className="size-3.5" />
              {project.system_size} kWp
            </span>
          )}
        </div>

        {/* Milestones */}
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Payment milestones
            </span>
            <span className="text-[11px] font-semibold text-muted-foreground">
              {paidCount}/4 paid
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {MILESTONES.map((m) => {
              const paid = project[m.key]
              return (
                <button
                  key={m.key}
                  onClick={() => onToggleMilestone(project, m.key, !paid)}
                  className={
                    "rounded-lg py-1.5 text-xs font-semibold ring-1 ring-inset transition-colors " +
                    (paid
                      ? "bg-success/10 text-success ring-success/30"
                      : "bg-secondary text-muted-foreground ring-border hover:bg-secondary/70")
                  }
                >
                  {m.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Pipeline stage — subsidy / net-metering approval tracker.
            Manual only: the tenant picks a stage after checking the
            actual government portal themselves, nothing here polls any
            live system. */}
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Pipeline stage
            </span>
            {stale != null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-600">
                <AlertTriangle className="size-3" />
                Stuck {stale}d
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={project.current_stage_id ?? ""}
              disabled={changingStage}
              onChange={(e) => handleStageSelect(e.target.value)}
              className="h-8 flex-1 rounded-lg border border-border bg-background px-2 text-xs font-medium text-foreground disabled:opacity-50"
            >
              <option value="" disabled>
                {stageName(project.current_stage_id, stages)}
              </option>
              {activeStages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {changingStage && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />}
          </div>
          <input
            type="text"
            value={stageNotes}
            onChange={(e) => setStageNotes(e.target.value)}
            placeholder="Note for next stage change (optional)"
            className="mt-1.5 h-7 w-full rounded-lg border border-border bg-background px-2 text-[11px] text-foreground placeholder:text-muted-foreground"
          />
          <button
            onClick={toggleHistory}
            className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            <History className="size-3" />
            {historyOpen ? "Hide history" : "View history"}
          </button>
          {historyOpen && (
            <div className="mt-1.5 max-h-32 space-y-1 overflow-y-auto rounded-lg bg-secondary/50 p-2">
              {historyLoading ? (
                <div className="flex items-center justify-center py-2 text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                </div>
              ) : history && history.length > 0 ? (
                history.map((h) => (
                  <div key={h.id} className="text-[11px] leading-snug">
                    <span className="font-semibold text-foreground">{stageName(h.stage_id, stages)}</span>
                    <span className="text-muted-foreground"> — {formatDate(h.entered_at)}</span>
                    {h.notes && <div className="text-muted-foreground">{h.notes}</div>}
                  </div>
                ))
              ) : (
                <div className="text-[11px] text-muted-foreground">No stage changes yet.</div>
              )}
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={false}
              animate={{ width: `${progress}%` }}
              transition={{ type: "spring", stiffness: 200, damping: 30 }}
            />
          </div>
        </div>

        <div className="mt-4 flex items-end justify-between border-t border-border pt-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Total value
          </span>
          <span className="text-lg font-bold tracking-tight text-foreground">
            {formatINRCompact(project.total_value)}
          </span>
        </div>

        {/* NEW — Open in Designer */}
        <Link
          href={`/design?projectId=${project.id}`}
          className="mt-3 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          <PenTool className="size-4" />
          Open in Designer
        </Link>
      </Card>
    </motion.div>
  )
}