"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { MapPin, Zap, Pencil, PenTool } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { projectTypeBadge, statusBadge } from "@/lib/badges"
import { formatINRCompact } from "@/lib/format"
import type { Project } from "@/lib/types"

const MILESTONES = [
  { key: "t1_paid", label: "T1" },
  { key: "t2_paid", label: "T2" },
  { key: "t3_paid", label: "T3" },
  { key: "t4_paid", label: "T4" },
] as const

export function ProjectCard({
  project,
  index,
  onEdit,
  onToggleMilestone,
}: {
  project: Project
  index: number
  onEdit: (p: Project) => void
  onToggleMilestone: (
    p: Project,
    field: "t1_paid" | "t2_paid" | "t3_paid" | "t4_paid",
    value: boolean,
  ) => void
}) {
  const paidCount = MILESTONES.filter((m) => project[m.key]).length
  const progress = (paidCount / MILESTONES.length) * 100

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