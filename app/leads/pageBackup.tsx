"use client"

import { useState } from "react"
import { Plus, LayoutGrid, Table2, Users, Loader2 } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Card } from "@/components/ui/card"
import { LeadsKanban } from "@/components/leads/leads-kanban"
import { LeadsTable } from "@/components/leads/leads-table"
import { LeadModal } from "@/components/leads/lead-modal"
import { useLeads, saveLead, deleteLead } from "@/lib/data"
import { cn } from "@/lib/utils"
import type { Lead } from "@/lib/types"

type View = "kanban" | "table"

export default function LeadsPage() {
  const { leads, isLoading, mutate } = useLeads()
  const [view, setView] = useState<View>("kanban")
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Lead | null>(null)

  const openNew = () => {
    setEditing(null)
    setModalOpen(true)
  }
  const openEdit = (lead: Lead) => {
    setEditing(lead)
    setModalOpen(true)
  }

  const handleSave = async (values: Partial<Lead>) => {
    await saveLead(values)
    await mutate()
  }
  const handleDelete = async (id: string) => {
    await deleteLead(id)
    await mutate()
  }

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle="Track every enquiry from first contact to close."
        action={
          <div className="flex items-center gap-2">
            <div className="hidden items-center rounded-lg border border-border bg-card p-0.5 sm:flex">
              <button
                onClick={() => setView("kanban")}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
                  view === "kanban"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <LayoutGrid className="size-4" />
                Kanban
              </button>
              <button
                onClick={() => setView("table")}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
                  view === "table"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Table2 className="size-4" />
                Table
              </button>
            </div>
            <button
              onClick={openNew}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="size-4" />
              Add Lead
            </button>
          </div>
        }
      />

      <div className="p-5 md:p-8">
        {/* mobile view toggle */}
        <div className="mb-4 flex items-center rounded-lg border border-border bg-card p-0.5 sm:hidden">
          <button
            onClick={() => setView("kanban")}
            className={cn(
              "inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md text-[13px] font-medium transition-colors",
              view === "kanban"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground",
            )}
          >
            <LayoutGrid className="size-4" />
            Kanban
          </button>
          <button
            onClick={() => setView("table")}
            className={cn(
              "inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md text-[13px] font-medium transition-colors",
              view === "table"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground",
            )}
          >
            <Table2 className="size-4" />
            Table
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : leads.length === 0 ? (
          <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
              <Users className="size-6 text-primary" />
            </div>
            <p className="mt-4 text-sm font-semibold text-foreground">
              No leads yet
            </p>
            <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">
              Add your first enquiry and start moving it through your pipeline —
              from site visit to a won deal.
            </p>
            <button
              onClick={openNew}
              className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="size-4" />
              Add Lead
            </button>
          </Card>
        ) : view === "kanban" ? (
          <LeadsKanban leads={leads} onEdit={openEdit} />
        ) : (
          <LeadsTable leads={leads} onEdit={openEdit} />
        )}
      </div>

      <LeadModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        lead={editing}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </>
  )
}
