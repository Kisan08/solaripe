"use client"

import { useEffect, useState } from "react"
import { Trash2, Loader2 } from "lucide-react"
import { Modal } from "@/components/ui/modal"
import { Field, Input, Select, Textarea } from "@/components/ui/field"
import {
  PROJECT_STATUSES,
  PROJECT_TYPES,
  type Project,
  type ProjectStatus,
  type ProjectType,
} from "@/lib/types"

type FormState = {
  client_name: string
  phone: string
  address: string
  system_size: string
  project_type: ProjectType
  status: ProjectStatus
  total_value: string
  notes: string
  t1_paid: boolean
  t2_paid: boolean
  t3_paid: boolean
  t4_paid: boolean
}

const empty: FormState = {
  client_name: "",
  phone: "",
  address: "",
  system_size: "",
  project_type: "EPC",
  status: "In Progress",
  total_value: "",
  notes: "",
  t1_paid: false,
  t2_paid: false,
  t3_paid: false,
  t4_paid: false,
}

const MILESTONES = [
  { key: "t1_paid", label: "T1 — Advance" },
  { key: "t2_paid", label: "T2 — Material" },
  { key: "t3_paid", label: "T3 — Install" },
  { key: "t4_paid", label: "T4 — Handover" },
] as const

export function ProjectModal({
  open,
  onClose,
  project,
  onSave,
  onDelete,
}: {
  open: boolean
  onClose: () => void
  project: Project | null
  onSave: (values: Partial<Project>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [form, setForm] = useState<FormState>(empty)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!open) return
    if (project) {
      setForm({
        client_name: project.client_name ?? "",
        phone: project.phone ?? "",
        address: project.address ?? "",
        system_size:
          project.system_size != null ? String(project.system_size) : "",
        project_type: project.project_type,
        status: project.status,
        total_value:
          project.total_value != null ? String(project.total_value) : "",
        notes: project.notes ?? "",
        t1_paid: project.t1_paid,
        t2_paid: project.t2_paid,
        t3_paid: project.t3_paid,
        t4_paid: project.t4_paid,
      })
    } else {
      setForm(empty)
    }
  }, [open, project])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const handleSave = async () => {
    if (!form.client_name.trim()) return
    setSaving(true)
    try {
      await onSave({
        ...(project ? { id: project.id } : {}),
        client_name: form.client_name.trim(),
        phone: form.phone || null,
        address: form.address || null,
        system_size: form.system_size ? Number(form.system_size) : null,
        project_type: form.project_type,
        status: form.status,
        total_value: form.total_value ? Number(form.total_value) : null,
        notes: form.notes || null,
        t1_paid: form.t1_paid,
        t2_paid: form.t2_paid,
        t3_paid: form.t3_paid,
        t4_paid: form.t4_paid,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!project) return
    setDeleting(true)
    try {
      await onDelete(project.id)
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? "Edit project" : "New project"}
      description={
        project
          ? "Update project details and payment milestones."
          : "Set up a new installation project."
      }
      footer={
        <>
          {project && (
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
            disabled={saving || !form.client_name.trim()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            {project ? "Save changes" : "Create project"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Client name" className="sm:col-span-2">
          <Input
            value={form.client_name}
            onChange={(e) => set("client_name", e.target.value)}
            placeholder="e.g. Sharma Residence"
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
        <Field label="System size (kWp)">
          <Input
            type="number"
            value={form.system_size}
            onChange={(e) => set("system_size", e.target.value)}
            placeholder="10"
          />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <Input
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
            placeholder="City, State"
          />
        </Field>
        <Field label="Project type">
          <Select
            value={form.project_type}
            onChange={(e) =>
              set("project_type", e.target.value as ProjectType)
            }
          >
            {PROJECT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select
            value={form.status}
            onChange={(e) => set("status", e.target.value as ProjectStatus)}
          >
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Total value (₹)" className="sm:col-span-2">
          <Input
            type="number"
            value={form.total_value}
            onChange={(e) => set("total_value", e.target.value)}
            placeholder="750000"
          />
        </Field>

        <div className="sm:col-span-2">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Payment milestones
          </span>
          <div className="grid grid-cols-2 gap-2">
            {MILESTONES.map((m) => {
              const paid = form[m.key]
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => set(m.key, !paid)}
                  className={
                    "flex items-center justify-between rounded-lg px-3 py-2.5 text-[13px] font-medium ring-1 ring-inset transition-colors " +
                    (paid
                      ? "bg-success/10 text-success ring-success/30"
                      : "bg-secondary text-muted-foreground ring-border hover:bg-secondary/70")
                  }
                >
                  {m.label}
                  <span className="text-[11px] font-semibold">
                    {paid ? "Paid" : "Pending"}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <Field label="Notes" className="sm:col-span-2">
          <Textarea
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Inverter brand, panel count, scheduling notes…"
          />
        </Field>
      </div>
    </Modal>
  )
}
