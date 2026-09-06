"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { MOBILE_NAV } from "@/lib/nav"
import { cn } from "@/lib/utils"
import { AccountSheet, useAccountInfo, initialsFor } from "@/components/account-menu"

export function BottomNav() {
  const pathname = usePathname()
  const [accountOpen, setAccountOpen] = useState(false)
  const { email, companyName } = useAccountInfo()

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur md:hidden">
        {/* pt-1 + a real 0.75rem bottom gap (plus the safe-area inset when
            iOS reports one) so the labels sit clear of the home-indicator
            bar instead of butting against it — the old bare
            pb-[env(safe-area-inset-bottom)] gave no gap at all. */}
        <div className="mx-auto flex max-w-md items-stretch justify-between px-1 pt-1 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]">
          {MOBILE_NAV.map((item) => {
            const active =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon
                  className={cn("size-5", active && "fill-primary/10")}
                  aria-hidden="true"
                />
                {item.label}
              </Link>
            )
          })}

          {/* Account — opens the shared sheet (Settings + Log out live in
              there on mobile). The whole cell is well over the 44px
              tap-target minimum. */}
          <button
            type="button"
            onClick={() => setAccountOpen(true)}
            aria-label="Account and settings"
            className="flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium text-muted-foreground transition-colors"
          >
            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[9px] font-bold leading-none text-primary-foreground">
              {initialsFor(companyName, email)}
            </span>
            Account
          </button>
        </div>
      </nav>

      <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} />
    </>
  )
}
