"use client"

import { useState } from "react"
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import { motion, AnimatePresence } from "framer-motion"
import { Phone, Zap, FileText } from "lucide-react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { sourceBadge, stageAccent } from "@/lib/badges"
import { LEAD_STAGES, type Lead, type LeadSource, type LeadStage } from "@/lib/types"
import { formatINRCompact } from "@/lib/format"

function LeadCardInfo({ lead }: { lead: Lead }) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">{lead.name}</span>
        {lead.source && (
          <Badge className={sourceBadge[lead.source as LeadSource] ?? sourceBadge.Other}>
            {lead.source}
          </Badge>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {lead.phone && (
          <span className="inline-flex items-center gap-1">
            <Phone className="size-3.5" />{lead.phone}
          </span>
        )}
        {lead.system_size != null && (
          <span className="inline-flex items-center gap-1">
            <Zap className="size-3.5" />{lead.system_size} kWp
          </span>
        )}
      </div>
      {lead.budget != null && (
        <div className="mt-2 text-xs font-semibold text-primary">
          {formatINRCompact(lead.budget)}
        </div>
      )}
    </>
  )
}

function LeadCardContent({
  lead,
  onEdit,
  onGenerateQuote,
}: {
  lead: Lead
  onEdit?: (lead: Lead) => void
  onGenerateQuote: (e: React.MouseEvent, lead: Lead) => void
}) {
  return (
    <>
      <button className="w-full text-left" onClick={() => onEdit?.(lead)}>
        <LeadCardInfo lead={lead} />
      </button>
      <button
        onClick={(e) => onGenerateQuote(e, lead)}
        className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 py-1.5 text-xs font-medium text-primary opacity-0 transition-all group-hover:opacity-100 hover:bg-primary hover:text-white"
      >
        <FileText className="size-3.5" />
        Generate Quote
      </button>
    </>
  )
}

function DraggableLeadCard({
  lead,
  accent,
  onEdit,
  onGenerateQuote,
}: {
  lead: Lead
  accent: string
  onEdit: (lead: Lead) => void
  onGenerateQuote: (e: React.MouseEvent, lead: Lead) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
    data: { stage: lead.stage },
  })

  return (
    <motion.div
      layout
      layoutId={lead.id}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: isDragging ? 0 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      whileHover={isDragging ? undefined : { y: -2 }}
      ref={setNodeRef}
      style={{
        borderLeft: `3px solid ${accent}`,
        transform: transform ? CSS.Translate.toString(transform) : undefined,
        touchAction: "none",
      }}
      className="card-shadow group block cursor-grab rounded-xl border border-border bg-card p-3 text-left transition-shadow hover:card-shadow-hover active:cursor-grabbing"
      {...listeners}
      {...attributes}
    >
      <LeadCardContent lead={lead} onEdit={onEdit} onGenerateQuote={onGenerateQuote} />
    </motion.div>
  )
}

function KanbanColumn({
  stage,
  leads,
  onEdit,
  onGenerateQuote,
}: {
  stage: LeadStage
  leads: Lead[]
  onEdit: (lead: Lead) => void
  onGenerateQuote: (e: React.MouseEvent, lead: Lead) => void
}) {
  const accent = stageAccent[stage]
  const { setNodeRef, isOver } = useDroppable({ id: stage })

  return (
    <div className="flex w-[280px] shrink-0 flex-col">
      <div className="mb-2.5 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: accent }} />
          <span className="text-[13px] font-semibold text-foreground">{stage}</span>
        </div>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
          {leads.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={`flex min-h-24 flex-1 flex-col gap-2.5 rounded-xl p-2.5 transition-colors ${
          isOver ? "bg-primary/10 ring-2 ring-primary/40" : "bg-secondary/50"
        }`}
      >
        <AnimatePresence mode="popLayout">
          {leads.map((lead) => (
            <DraggableLeadCard
              key={lead.id}
              lead={lead}
              accent={accent}
              onEdit={onEdit}
              onGenerateQuote={onGenerateQuote}
            />
          ))}
        </AnimatePresence>

        {leads.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
            No leads
          </div>
        )}
      </div>
    </div>
  )
}

export function LeadsKanban({
  leads,
  onEdit,
  onStageChange,
}: {
  leads: Lead[]
  onEdit: (lead: Lead) => void
  onStageChange: (id: string, stage: LeadStage) => void
}) {
  const router = useRouter()
  const [activeLead, setActiveLead] = useState<Lead | null>(null)

  // MouseSensor fires on the small movement threshold below, so a plain
  // click still opens the edit modal instead of being swallowed as a drag.
  // TouchSensor uses a press-and-hold delay so a horizontal swipe to scroll
  // between columns on mobile isn't mistaken for a card drag.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  const generateQuote = (e: React.MouseEvent, lead: Lead) => {
    e.stopPropagation()
    const params = new URLSearchParams({
      name: lead.name ?? "",
      phone: lead.phone ?? "",
      address: lead.address ?? "",
      system_size: String(lead.system_size ?? ""),
    })
    router.push(`/quote?${params.toString()}`)
  }

  const handleDragStart = (event: DragStartEvent) => {
    const lead = leads.find((l) => l.id === event.active.id)
    setActiveLead(lead ?? null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveLead(null)
    const { active, over } = event
    if (!over) return
    const targetStage = over.id as LeadStage
    const sourceStage = active.data.current?.stage as LeadStage | undefined
    if (!LEAD_STAGES.includes(targetStage)) return
    if (targetStage === sourceStage) return
    onStageChange(active.id as string, targetStage)
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveLead(null)}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {LEAD_STAGES.map((stage) => (
          <KanbanColumn
            key={stage}
            stage={stage}
            leads={leads.filter((l) => l.stage === stage)}
            onEdit={onEdit}
            onGenerateQuote={generateQuote}
          />
        ))}
      </div>

      <DragOverlay>
        {activeLead && (
          <div
            className="card-shadow-hover w-[264px] rounded-xl border border-border bg-card p-3 text-left"
            style={{ borderLeft: `3px solid ${stageAccent[activeLead.stage]}` }}
          >
            <LeadCardInfo lead={activeLead} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
