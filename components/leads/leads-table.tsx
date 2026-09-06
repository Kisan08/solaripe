"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronsUpDown, ChevronUp, ChevronDown, Phone, FileText } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { sourceBadge, stageAccent } from "@/lib/badges"
import { telHref } from "@/lib/phone"
import type { LeadQuoteRow } from "@/lib/data"
import type { Lead, LeadSource } from "@/lib/types"
import { formatINRCompact, formatDate } from "@/lib/format"

// Phone column: the number as text plus a compact manual-dial button
// (tel:+91, opens the caller's own phone dialer — same helper the kanban
// card and the AI Calling table use). stopPropagation so tapping Call
// dials instead of opening the row's edit modal. Button is omitted when
// the lead has no usable number.
function PhoneCell({ lead }: { lead: Lead }) {
  const href = telHref(lead.phone)
  if (!lead.phone) return <span className="text-muted-foreground">—</span>
  return (
    <span className="inline-flex items-center gap-2 text-muted-foreground">
      {lead.phone}
      {href && (
        <a
          href={href}
          onClick={(e) => e.stopPropagation()}
          title={`Call ${lead.name} for follow-up`}
          aria-label={`Call ${lead.name} for follow-up`}
          className="inline-flex items-center gap-1 rounded-md border border-success/25 bg-success/10 px-1.5 py-0.5 text-[11px] font-semibold text-success transition-colors hover:bg-success hover:text-success-foreground"
        >
          <Phone className="size-3" />
          Call
        </a>
      )}
    </span>
  )
}

type SortKey = "name" | "system_size" | "budget" | "stage" | "follow_up_date"

export function LeadsTable({
  leads,
  onEdit,
  quoteByLead,
  onOpenQuote,
}: {
  leads: Lead[]
  onEdit: (lead: Lead) => void
  quoteByLead?: Map<string, LeadQuoteRow>
  onOpenQuote?: (quoteId: string) => void
}) {
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [asc, setAsc] = useState(true)

  // Row single click opens the edit modal (unchanged). For a lead that
  // has a saved quote, a DOUBLE click opens that quote instead — the edit
  // open is held ~220ms and cancelled if a second click lands. One shared
  // timer is enough: only one click can be pending at a time.
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (clickTimer.current) clearTimeout(clickTimer.current) }, [])
  const handleRowClick = (lead: Lead) => {
    if (!quoteByLead?.get(lead.id)) { onEdit(lead); return }
    if (clickTimer.current) return
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null
      onEdit(lead)
    }, 220)
  }
  const handleRowDoubleClick = (lead: Lead) => {
    if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null }
    const quote = quoteByLead?.get(lead.id)
    if (quote) onOpenQuote?.(quote.id)
  }

  const sorted = [...leads].sort((a, b) => {
    const av = a[sortKey]
    const bv = b[sortKey]
    if (av == null) return 1
    if (bv == null) return -1
    if (typeof av === "number" && typeof bv === "number")
      return asc ? av - bv : bv - av
    return asc
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av))
  })

  const toggle = (key: SortKey) => {
    if (key === sortKey) setAsc((v) => !v)
    else {
      setSortKey(key)
      setAsc(true)
    }
  }

  const SortHead = ({
    label,
    k,
    className,
  }: {
    label: string
    k: SortKey
    className?: string
  }) => (
    <th className={className}>
      <button
        onClick={() => toggle(k)}
        className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
      >
        {label}
        {sortKey === k ? (
          asc ? (
            <ChevronUp className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )
        ) : (
          <ChevronsUpDown className="size-3.5 opacity-50" />
        )}
      </button>
    </th>
  )

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-left">
              <SortHead label="Name" k="name" className="px-4 py-3" />
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Phone
              </th>
              <SortHead label="Size" k="system_size" className="px-4 py-3" />
              <SortHead label="Budget" k="budget" className="px-4 py-3" />
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Source
              </th>
              <SortHead label="Stage" k="stage" className="px-4 py-3" />
              <SortHead
                label="Follow-up"
                k="follow_up_date"
                className="px-4 py-3"
              />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((lead) => {
              const hasQuote = !!quoteByLead?.get(lead.id)
              return (
              <tr
                key={lead.id}
                onClick={() => handleRowClick(lead)}
                onDoubleClick={() => handleRowDoubleClick(lead)}
                title={hasQuote ? "Click to edit · double-click to open the saved quote" : undefined}
                className="cursor-pointer transition-colors hover:bg-secondary/40"
              >
                <td className="px-4 py-3 font-semibold text-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    {lead.name}
                    {hasQuote && (
                      <span className="inline-flex text-primary" title="Saved quote — double-click the row to open">
                        <FileText className="size-3.5" />
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <PhoneCell lead={lead} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {lead.system_size != null ? `${lead.system_size} kWp` : "—"}
                </td>
                <td className="px-4 py-3 font-medium text-foreground">
                  {lead.budget != null ? formatINRCompact(lead.budget) : "—"}
                </td>
                <td className="px-4 py-3">
                  {lead.source ? (
                    <Badge
                      className={
                        sourceBadge[lead.source as LeadSource] ??
                        sourceBadge.Other
                      }
                    >
                      {lead.source}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: stageAccent[lead.stage] }}
                    />
                    {lead.stage}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDate(lead.follow_up_date)}
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
