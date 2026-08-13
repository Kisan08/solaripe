import type React from "react"
import { cn } from "@/lib/utils"

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
        className,
      )}
      {...props}
    />
  )
}

// text-base (16px), not text-sm — iOS Safari (and mobile Chrome) auto-zooms
// the viewport when a focused input's font-size is below 16px, leaving the
// page stuck zoomed in until the user manually pinches back out. This is
// the single shared base for every Input/Textarea/Select in the app, so
// keeping it at 16px here is what makes the fix apply everywhere at once.
const fieldBase =
  "w-full rounded-lg border border-input bg-card px-3 py-2 text-base text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, className)} {...props} />
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={cn(fieldBase, "min-h-20 resize-y", className)} {...props} />
  )
}

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(fieldBase, "appearance-none bg-card pr-8", className)}
      {...props}
    />
  )
}

export function Field({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      {children}
    </div>
  )
}
