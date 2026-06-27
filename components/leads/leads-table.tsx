"use client"

import { useState } from "react"
import { ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { sourceBadge, stageAccent } from "@/lib/badges"
import type { Lead, LeadSource } from "@/lib/types"
import { formatINRCompact, formatDate } from "@/lib/format"

type SortKey = "name" | "system_size" | "budget" | "stage" | "follow_up_date"

export function LeadsTable({
  leads,
  onEdit,
}: {
  leads: Lead[]
  onEdit: (lead: Lead) => void
}) {
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [asc, setAsc] = useState(true)

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
            {sorted.map((lead) => (
              <tr
                key={lead.id}
                onClick={() => onEdit(lead)}
                className="cursor-pointer transition-colors hover:bg-secondary/40"
              >
                <td className="px-4 py-3 font-semibold text-foreground">
                  {lead.name}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {lead.phone ?? "—"}
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
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
