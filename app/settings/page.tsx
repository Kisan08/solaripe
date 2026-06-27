"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Building2, FileSpreadsheet, PhoneCall, Check, Loader2 } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Card } from "@/components/ui/card"
import { Field, Input, Select, Textarea } from "@/components/ui/field"

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Building2
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card className="p-5 md:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-[18px]" />
        </span>
        <div>
          <h2 className="text-sm font-bold text-foreground">{title}</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </Card>
  )
}

export default function SettingsPage() {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await new Promise((r) => setTimeout(r, 700))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2200)
  }

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Configure your company, quotes, and AI calling."
        action={
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex h-9 min-w-32 items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-70"
          >
            <AnimatePresence mode="wait" initial={false}>
              {saving ? (
                <motion.span
                  key="saving"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="inline-flex items-center gap-1.5"
                >
                  <Loader2 className="size-4 animate-spin" />
                  Saving…
                </motion.span>
              ) : saved ? (
                <motion.span
                  key="saved"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="inline-flex items-center gap-1.5"
                >
                  <Check className="size-4" />
                  Saved
                </motion.span>
              ) : (
                <motion.span
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  Save changes
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        }
      />

      <div className="mx-auto max-w-3xl space-y-5 p-5 md:p-8">
        <Section
          icon={Building2}
          title="Company information"
          description="Details shown on proposals and invoices."
        >
          <Field label="Company name">
            <Input defaultValue="SunEdge Energy Pvt. Ltd." />
          </Field>
          <Field label="GSTIN">
            <Input defaultValue="29ABCDE1234F1Z5" />
          </Field>
          <Field label="Contact email">
            <Input type="email" defaultValue="hello@sunedge.in" />
          </Field>
          <Field label="Contact phone">
            <Input defaultValue="+91 98765 43210" />
          </Field>
          <Field label="Registered address" className="sm:col-span-2">
            <Textarea defaultValue="No. 24, MG Road, Bengaluru, Karnataka 560001" />
          </Field>
        </Section>

        <Section
          icon={FileSpreadsheet}
          title="Quote defaults"
          description="Pre-filled values when creating new proposals."
        >
          <Field label="Default price / Wp (₹)">
            <Input type="number" defaultValue="48" />
          </Field>
          <Field label="GST rate (%)">
            <Input type="number" defaultValue="13.8" />
          </Field>
          <Field label="Default warranty (years)">
            <Input type="number" defaultValue="25" />
          </Field>
          <Field label="Quote validity (days)">
            <Input type="number" defaultValue="15" />
          </Field>
          <Field label="Default module type" className="sm:col-span-2">
            <Select defaultValue="Mono PERC">
              <option>Mono PERC</option>
              <option>TOPCon</option>
              <option>Bifacial</option>
              <option>Polycrystalline</option>
            </Select>
          </Field>
        </Section>

        <Section
          icon={PhoneCall}
          title="AI calling"
          description="Automated follow-ups for your leads."
        >
          <Field label="Caller ID name">
            <Input defaultValue="SunEdge Solar" />
          </Field>
          <Field label="Outbound number">
            <Input defaultValue="+91 80471 23456" />
          </Field>
          <Field label="Call language">
            <Select defaultValue="Hindi + English">
              <option>Hindi + English</option>
              <option>English</option>
              <option>Hindi</option>
              <option>Kannada</option>
              <option>Tamil</option>
            </Select>
          </Field>
          <Field label="Voice tone">
            <Select defaultValue="Professional">
              <option>Professional</option>
              <option>Friendly</option>
              <option>Concise</option>
            </Select>
          </Field>
          <Field label="Call script" className="sm:col-span-2">
            <Textarea defaultValue="Hi, this is SunEdge Solar following up on your rooftop solar enquiry. Is this a good time to discuss your savings estimate?" />
          </Field>
        </Section>
      </div>
    </>
  )
}
