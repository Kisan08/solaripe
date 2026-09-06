"use client"

import { useEffect, useRef, useState } from "react"
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
import { telHref } from "@/lib/phone"
import type { LeadQuoteRow } from "@/lib/data"
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
  quote,
  onEdit,
  onOpenQuote,
  onGenerateQuote,
}: {
  lead: Lead
  quote?: LeadQuoteRow
  onEdit?: (lead: Lead) => void
  onOpenQuote?: (quoteId: string) => void
  onGenerateQuote: (e: React.MouseEvent, lead: Lead) => void
}) {
  // Manual follow-up dial — opens the caller's own phone dialer (same
  // tel:+91 pattern as the AI Calling table's ManualDialButton). Hidden
  // entirely when the lead has no usable number rather than showing a
  // dead button.
  const callHref = telHref(lead.phone)

  // Single click still opens the edit modal. When this lead has a saved
  // quote, a DOUBLE click opens that quote instead — so the edit open is
  // held ~220ms and cancelled if a second click lands. Leads with no
  // saved quote keep the old instant-edit behaviour (no delay, no timer).
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (clickTimer.current) clearTimeout(clickTimer.current) }, [])
  const handleInfoClick = () => {
    if (!quote) { onEdit?.(lead); return }
    if (clickTimer.current) return
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null
      onEdit?.(lead)
    }, 220)
  }
  const handleInfoDoubleClick = () => {
    if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null }
    if (quote) onOpenQuote?.(quote.id)
  }

  return (
    <>
      <button
        className="w-full text-left"
        onClick={handleInfoClick}
        onDoubleClick={handleInfoDoubleClick}
        title={quote ? "Click to edit · double-click to open the saved quote" : undefined}
      >
        <LeadCardInfo lead={lead} />
      </button>
      {/* Always visible (not hover-gated) — a hover-only reveal is
          permanently inaccessible on touch devices, since there's no
          :hover state to trigger it. stopPropagation so a tap dials /
          opens the quote instead of being read as the start of a card drag. */}
      <div className="mt-2.5 flex gap-1.5">
        {callHref && (
          <a
            href={callHref}
            onClick={(e) => e.stopPropagation()}
            title={`Call ${lead.name} for follow-up`}
            aria-label={`Call ${lead.name} for follow-up`}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-success/25 bg-success/10 px-2.5 py-1.5 text-xs font-medium text-success transition-colors hover:bg-success hover:text-success-foreground"
          >
            <Phone className="size-3.5" />
            Call
          </a>
        )}
        <button
          onClick={(e) => onGenerateQuote(e, lead)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-white"
        >
          <FileText className="size-3.5" />
          Generate Quote
        </button>
      </div>
      {quote && (
        <p className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
          <FileText className="size-3" />
          Quote saved · double-click to open
        </p>
      )}
    </>
  )
}

function DraggableLeadCard({
  lead,
  accent,
  quote,
  onEdit,
  onOpenQuote,
  onGenerateQuote,
}: {
  lead: Lead
  accent: string
  quote?: LeadQuoteRow
  onEdit: (lead: Lead) => void
  onOpenQuote?: (quoteId: string) => void
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
        // "manipulation", not "none" — "none" disables native scroll at the
        // browser level before the TouchSensor's activationConstraint below
        // ever gets a chance to run, defeating its whole point (a quick
        // touch-scroll would never scroll at all). "manipulation" allows
        // normal scroll/pan and still lets dnd-kit intercept the gesture
        // once its delay-based activation actually fires.
        touchAction: "manipulation",
      }}
      className="card-shadow group block cursor-grab rounded-xl border border-border bg-card p-3 text-left transition-shadow hover:card-shadow-hover active:cursor-grabbing"
      {...listeners}
      {...attributes}
    >
      <LeadCardContent
        lead={lead}
        quote={quote}
        onEdit={onEdit}
        onOpenQuote={onOpenQuote}
        onGenerateQuote={onGenerateQuote}
      />
    </motion.div>
  )
}

function KanbanColumn({
  stage,
  leads,
  quoteByLead,
  onEdit,
  onOpenQuote,
  onGenerateQuote,
}: {
  stage: LeadStage
  leads: Lead[]
  quoteByLead?: Map<string, LeadQuoteRow>
  onEdit: (lead: Lead) => void
  onOpenQuote?: (quoteId: string) => void
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
              quote={quoteByLead?.get(lead.id)}
              onEdit={onEdit}
              onOpenQuote={onOpenQuote}
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
  quoteByLead,
  onOpenQuote,
}: {
  leads: Lead[]
  onEdit: (lead: Lead) => void
  onStageChange: (id: string, stage: LeadStage) => void
  quoteByLead?: Map<string, LeadQuoteRow>
  onOpenQuote?: (quoteId: string) => void
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
      // leadId lets the quote page auto-save the generated quote back to
      // this lead after a successful Download / WhatsApp.
      leadId: lead.id,
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
            quoteByLead={quoteByLead}
            onEdit={onEdit}
            onOpenQuote={onOpenQuote}
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
