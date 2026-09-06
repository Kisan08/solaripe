"use client"

import { useEffect } from "react"
import Link from "next/link"
import useSWR from "swr"
import { AnimatePresence, motion } from "framer-motion"
import { LogIn, LogOut, Settings as SettingsIcon, X } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { signOutAction } from "@/lib/auth/actions"

// One shared fetch (SWR dedupes by key) for every surface that shows the
// signed-in state — the desktop sidebar, the mobile bottom nav, and the
// sheet itself.
export function useAccountInfo() {
  const { data } = useSWR(
    "account-info",
    async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return { email: null as string | null, companyName: null as string | null }
      const { data: tenant } = await supabase
        .from("tenants")
        .select("company_name")
        .eq("id", user.id)
        .single()
      return {
        email: user.email ?? null,
        companyName: (tenant?.company_name as string | undefined) ?? null,
      }
    },
    { revalidateOnFocus: false },
  )
  return {
    email: data?.email ?? null,
    companyName: data?.companyName ?? null,
    loading: !data,
  }
}

export function initialsFor(name: string | null, email: string | null) {
  const src = name?.trim() || email?.trim() || "?"
  const parts = src.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return src.slice(0, 2).toUpperCase()
}

/**
 * Slide-up account sheet: identity ("Signed in as …"), Settings, and a
 * working Log out — or a Log in button when signed out. Bottom sheet on
 * mobile, centred card on ≥sm. Shared by the bottom nav and the sidebar
 * so both surfaces expose the same login state. Every row is ≥44px tall.
 */
export function AccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { email, companyName, loading } = useAccountInfo()
  const loggedIn = !loading && !!email

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener("keydown", onKey)
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Account"
            className="relative w-full max-w-md rounded-t-2xl bg-card p-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] shadow-2xl sm:mb-8 sm:rounded-2xl sm:pb-4"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border sm:hidden" />

            <div className="flex items-center gap-3 px-1">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {loggedIn ? initialsFor(companyName, email) : <LogIn className="size-5" />}
              </div>
              <div className="min-w-0 flex-1">
                {loggedIn ? (
                  <>
                    <p className="truncate text-sm font-semibold text-foreground">
                      {companyName ?? "Your account"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">Signed in as {email}</p>
                  </>
                ) : (
                  <p className="text-sm font-semibold text-foreground">
                    {loading ? "Loading…" : "You're signed out"}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="-mr-1 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="my-3 h-px bg-border" />

            {loggedIn ? (
              <div className="flex flex-col gap-0.5">
                <Link
                  href="/settings"
                  onClick={onClose}
                  className="flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                >
                  <SettingsIcon className="size-[18px] text-muted-foreground" aria-hidden="true" />
                  Settings
                </Link>
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <LogOut className="size-[18px]" aria-hidden="true" />
                    Log out
                  </button>
                </form>
              </div>
            ) : (
              <Link
                href="/login"
                onClick={onClose}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <LogIn className="size-[18px]" aria-hidden="true" />
                Log in
              </Link>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
