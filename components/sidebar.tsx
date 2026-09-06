"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"
import { NAV_ITEMS } from "@/lib/nav"
import { cn } from "@/lib/utils"
import { AccountSheet, useAccountInfo, initialsFor } from "@/components/account-menu"

// Collapsed width shows icons only; hovering the rail expands it to reveal
// labels, matching the SeaArt-style reference. The rail is `fixed` and
// OVERLAYS page content when expanded (like VS Code's activity bar or
// Notion's collapsed sidebar) rather than pushing content over — reflowing
// the whole page's layout on hover causes janky content-shift, whereas an
// overlay expansion feels instant and doesn't disturb whatever's underneath.
// AppShell's content padding matches the COLLAPSED width permanently.
export function Sidebar() {
  const pathname = usePathname()
  const { email, companyName } = useAccountInfo()
  const [accountOpen, setAccountOpen] = useState(false)

  return (
    <>
    <aside
      className={cn(
        "app-sidebar-rail group fixed inset-y-0 left-0 z-30 hidden flex-col overflow-hidden",
        "border-r border-sidebar-border bg-sidebar md:flex",
        "w-[68px] hover:w-[220px] transition-[width] duration-200 ease-out",
      )}
    >
      <div className="flex h-16 shrink-0 items-center gap-2.5 px-[22px]">
        <img src="/brand/amsu-mark.png" alt="Amsu" className="size-8 shrink-0 object-contain" />
        <div className="flex flex-col leading-none whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <span className="text-base font-bold tracking-tight text-foreground">
            Amsu
          </span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Solar EPC OS
          </span>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        {NAV_ITEMS.map((item) => {
          // "Design" shares its href with "Projects" (it's a shortcut into
          // Projects now, not its own destination — see lib/nav.ts), so
          // the plain startsWith check would light up BOTH items whenever
          // you're on /projects. "Design" never gets its own active state;
          // "Projects" is the real owner of that route.
          const active =
            item.label === "Design"
              ? false
              : item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.label}
              href={item.href}
              title={item.label}
              className={cn(
                "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "text-sidebar-active-foreground"
                  : "text-sidebar-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-lg bg-sidebar-active shadow-[0_0_0_1px_rgba(26,79,138,0.4),0_8px_20px_-6px_rgba(26,79,138,0.5)]"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <Icon className="relative z-10 size-[18px] shrink-0" aria-hidden="true" />
              <span className="relative z-10 whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                {item.label}
              </span>
            </Link>
          )
        })}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border p-2">
        {/* Whole block is now the account trigger — opens the shared sheet
            (identity + Settings + Log out), same as the mobile bottom nav.
            px-2 keeps the avatar aligned with the nav icons and inside the
            68px collapsed rail (overflow-hidden would clip anything wider). */}
        <button
          type="button"
          onClick={() => setAccountOpen(true)}
          title="Account"
          className="flex w-full items-center gap-3 rounded-lg bg-secondary px-2 py-2 text-left transition-colors hover:bg-secondary/70"
        >
          <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
            {initialsFor(companyName, email)}
          </div>
          <span
            className="flex-1 truncate whitespace-nowrap text-xs font-semibold text-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100"
            title={companyName ?? undefined}
          >
            {/* First word only — "Suryodaya Solar Solutions" reads as
                "Suryodaya" here, which fits the expanded rail instead of
                ellipsizing mid-name. */}
            {companyName ? companyName.split(" ")[0] : "Account"}
          </span>
        </button>
      </div>
    </aside>

    <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} />
    </>
  )
}
