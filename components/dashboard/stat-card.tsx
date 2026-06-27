"use client"

import { motion } from "framer-motion"
import type { LucideIcon } from "lucide-react"
import { Card } from "@/components/ui/card"

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  index,
  accent,
}: {
  label: string
  value: string
  hint?: string
  icon: LucideIcon
  index: number
  accent: "primary" | "amber" | "green" | "violet"
}) {
  const accentMap = {
    primary: "bg-primary/10 text-primary",
    amber: "bg-accent/15 text-[#b9760a]",
    green: "bg-emerald-500/10 text-emerald-600",
    violet: "bg-violet-500/10 text-violet-600",
  } as const

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1, ease: "easeOut" }}
      whileHover={{ y: -3 }}
    >
      <Card className="group h-full p-5 transition-shadow duration-200 hover:card-shadow-hover">
        <div className="flex items-start justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <span
            className={`flex size-9 items-center justify-center rounded-lg ${accentMap[accent]}`}
          >
            <Icon className="size-[18px]" aria-hidden="true" />
          </span>
        </div>
        <div className="mt-4 text-[26px] font-bold leading-none tracking-tight text-foreground">
          {value}
        </div>
        {hint && (
          <div className="mt-2 text-xs text-muted-foreground">{hint}</div>
        )}
      </Card>
    </motion.div>
  )
}
