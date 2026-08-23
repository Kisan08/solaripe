"use client"

import type { ChangeEvent, ClipboardEvent, KeyboardEvent } from "react"
import { cn } from "@/lib/utils"

const NAV_KEYS = [
  "Backspace", "Delete", "Tab", "Enter",
  "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End",
]

// India-only, matching lib/phone.ts's cleanPhone and
// lib/whatsappNotify.ts's normalizeWhatsAppNumber, which both already
// assume a bare 10-digit Indian mobile everywhere in this app. This locks
// the +91 country code and 10-digit length in the UI itself — a keystroke
// filter, not just after-the-fact validation — since a malformed number
// silently breaks Twilio WhatsApp sending downstream. If international
// numbers are ever needed, this needs a real country selector (and
// cleanPhone would need to stop assuming India) — not worth building for
// a need this app doesn't have today.
//
// `value`/`onChange` deal only in the bare digit string (0-10 chars, no
// "+91", no spaces) — the exact same shape every save handler in this
// app already normalizes through cleanPhone, so nothing downstream of
// this component needs to change.
export function PhoneInput({
  value, onChange, placeholder, disabled, autoFocus, id,
  inputClassName, chipClassName, containerClassName,
}: {
  value: string
  onChange: (digits: string) => void
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
  id?: string
  inputClassName?: string
  chipClassName?: string
  containerClassName?: string
}) {
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return // copy/paste/select-all shortcuts etc.
    if (NAV_KEYS.includes(e.key)) return
    if (!/^[0-9]$/.test(e.key)) e.preventDefault()
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value.replace(/\D/g, "").slice(0, 10))
  }

  // Pasting a full number ("+91 98765-43210", "098765 43210") needs the
  // LAST 10 digits, not the first — matching cleanPhone's own .slice(-10),
  // which correctly drops a leading country code or trunk 0 instead of
  // truncating into the middle of the real subscriber number.
  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    onChange(e.clipboardData.getData("text").replace(/\D/g, "").slice(-10))
  }

  return (
    <div className={cn("flex", containerClassName)}>
      <span
        aria-hidden="true"
        className={cn(
          "flex shrink-0 select-none items-center rounded-l-lg border border-r-0 border-input bg-secondary px-3 text-base font-medium text-muted-foreground",
          chipClassName,
        )}
      >
        +91
      </span>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        maxLength={10}
        onKeyDown={handleKeyDown}
        onChange={handleChange}
        onPaste={handlePaste}
        className={cn(
          "w-full rounded-l-none rounded-r-lg border border-input bg-card px-3 py-2 text-base text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50",
          inputClassName,
        )}
      />
    </div>
  )
}

// Sanitizes an existing stored/URL-sourced phone value (which may already
// carry "+91", spaces, dashes, a leading 0, or nothing at all) down to the
// bare ≤10-digit string this component's `value` prop expects, so editing
// an existing record never shows garbage in the box. Deliberately more
// lenient than lib/phone.ts's cleanPhone (which returns null for anything
// that isn't a valid 10-digit mobile starting 6-9) — this is for
// populating an editable field, not for save-time validation, so a
// landline or partially-typed number still displays instead of vanishing.
export function digitsForPhoneInput(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "").slice(-10)
}
