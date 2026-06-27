"use client"

import { motion, AnimatePresence } from "framer-motion"
import { Phone, Zap, FileText } from "lucide-react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { sourceBadge, stageAccent } from "@/lib/badges"
import { LEAD_STAGES, type Lead, type LeadSource } from "@/lib/types"
import { formatINRCompact } from "@/lib/format"

export function LeadsKanban({
  leads,
  onEdit,
}: {
  leads: Lead[]
  onEdit: (lead: Lead) => void
}) {
  const router = useRouter()

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

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {LEAD_STAGES.map((stage) => {
        const items = leads.filter((l) => l.stage === stage)
        const accent = stageAccent[stage]
        return (
          <div key={stage} className="flex w-[280px] shrink-0 flex-col">
            <div className="mb-2.5 flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: accent }} />
                <span className="text-[13px] font-semibold text-foreground">{stage}</span>
              </div>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                {items.length}
              </span>
            </div>

            <div className="flex min-h-24 flex-1 flex-col gap-2.5 rounded-xl bg-secondary/50 p-2.5">
              <AnimatePresence mode="popLayout">
                {items.map((lead) => (
                  <motion.div
                    key={lead.id}
                    layout
                    layoutId={lead.id}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    whileHover={{ y: -2 }}
                    className="card-shadow group block rounded-xl border border-border bg-card p-3 text-left transition-shadow hover:card-shadow-hover"
                    style={{ borderLeft: `3px solid ${accent}` }}
                  >
                    {/* Card header */}
                    <button className="w-full text-left" onClick={() => onEdit(lead)}>
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
                    </button>

                    {/* Generate Quote button */}
                    <button
                      onClick={(e) => generateQuote(e, lead)}
                      className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 py-1.5 text-xs font-medium text-primary opacity-0 transition-all group-hover:opacity-100 hover:bg-primary hover:text-white"
                    >
                      <FileText className="size-3.5" />
                      Generate Quote
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>

              {items.length === 0 && (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                  No leads
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}