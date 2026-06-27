"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"
import { Sun } from "lucide-react"
import { NAV_ITEMS } from "@/lib/nav"
import { cn } from "@/lib/utils"

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[220px] flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
          <Sun className="size-5 text-primary-foreground" aria-hidden="true" />
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-base font-bold tracking-tight text-foreground">
            Solaripe
          </span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Solar EPC OS
          </span>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
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
              <Icon className="relative z-10 size-[18px]" aria-hidden="true" />
              <span className="relative z-10">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3 rounded-lg bg-secondary px-3 py-2.5">
          <div className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            SE
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-xs font-semibold text-foreground">
              SunEdge Energy
            </span>
            <span className="text-[11px] text-muted-foreground">Pro plan</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
