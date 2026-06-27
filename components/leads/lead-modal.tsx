"use client"

import { useEffect, useState } from "react"
import { Trash2, Loader2 } from "lucide-react"
import { Modal } from "@/components/ui/modal"
import { Field, Input, Select, Textarea } from "@/components/ui/field"
import {
  LEAD_SOURCES,
  LEAD_STAGES,
  type Lead,
  type LeadSource,
  type LeadStage,
} from "@/lib/types"

type FormState = {
  name: string
  phone: string
  email: string
  address: string
  system_size: string
  budget: string
  source: LeadSource
  stage: LeadStage
  notes: string
  follow_up_date: string
}

const empty: FormState = {
  name: "",
  phone: "",
  email: "",
  address: "",
  system_size: "",
  budget: "",
  source: "Website",
  stage: "New Lead",
  notes: "",
  follow_up_date: "",
}

export function LeadModal({
  open,
  onClose,
  lead,
  onSave,
  onDelete,
}: {
  open: boolean
  onClose: () => void
  lead: Lead | null
  onSave: (values: Partial<Lead>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [form, setForm] = useState<FormState>(empty)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!open) return
    if (lead) {
      setForm({
        name: lead.name ?? "",
        phone: lead.phone ?? "",
        email: lead.email ?? "",
        address: lead.address ?? "",
        system_size: lead.system_size != null ? String(lead.system_size) : "",
        budget: lead.budget != null ? String(lead.budget) : "",
        source: (lead.source as LeadSource) ?? "Website",
        stage: lead.stage,
        notes: lead.notes ?? "",
        follow_up_date: lead.follow_up_date ?? "",
      })
    } else {
      setForm(empty)
    }
  }, [open, lead])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await onSave({
        ...(lead ? { id: lead.id } : {}),
        name: form.name.trim(),
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        system_size: form.system_size ? Number(form.system_size) : null,
        budget: form.budget ? Number(form.budget) : null,
        source: form.source,
        stage: form.stage,
        notes: form.notes || null,
        follow_up_date: form.follow_up_date || null,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!lead) return
    setDeleting(true)
    try {
      await onDelete(lead.id)
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={lead ? "Edit lead" : "Add new lead"}
      description={
        lead ? "Update enquiry details and stage." : "Capture a new enquiry."
      }
      footer={
        <>
          {lead && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="mr-auto inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
            >
              {deleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Delete
            </button>
          )}
          <button
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.name.trim()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            {lead ? "Save changes" : "Add lead"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full name" className="sm:col-span-2">
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Rajesh Kumar"
            autoFocus
          />
        </Field>
        <Field label="Phone">
          <Input
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="+91 98765 43210"
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="name@example.com"
          />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <Input
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
            placeholder="City, State"
          />
        </Field>
        <Field label="System size (kWp)">
          <Input
            type="number"
            value={form.system_size}
            onChange={(e) => set("system_size", e.target.value)}
            placeholder="5"
          />
        </Field>
        <Field label="Budget (₹)">
          <Input
            type="number"
            value={form.budget}
            onChange={(e) => set("budget", e.target.value)}
            placeholder="350000"
          />
        </Field>
        <Field label="Source">
          <Select
            value={form.source}
            onChange={(e) => set("source", e.target.value as LeadSource)}
          >
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Stage">
          <Select
            value={form.stage}
            onChange={(e) => set("stage", e.target.value as LeadStage)}
          >
            {LEAD_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Follow-up date" className="sm:col-span-2">
          <Input
            type="date"
            value={form.follow_up_date}
            onChange={(e) => set("follow_up_date", e.target.value)}
          />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Site conditions, requirements, conversation notes…"
          />
        </Field>
      </div>
    </Modal>
  )
}
