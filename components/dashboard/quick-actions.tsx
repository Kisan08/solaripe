"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { UserPlus, FolderPlus, FileText, Settings } from "lucide-react"
import { Card } from "@/components/ui/card"

const ACTIONS = [
  {
    label: "Add Lead",
    desc: "Capture a new enquiry",
    href: "/leads",
    icon: UserPlus,
    color: "bg-primary/10 text-primary",
  },
  {
    label: "New Project",
    desc: "Kick off an installation",
    href: "/projects",
    icon: FolderPlus,
    color: "bg-emerald-500/10 text-emerald-600",
  },
  {
    label: "Create Quote",
    desc: "Build a proposal",
    href: "/quotes",
    icon: FileText,
    color: "bg-accent/15 text-[#b9760a]",
  },
  {
    label: "Settings",
    desc: "Configure your company",
    href: "/settings",
    icon: Settings,
    color: "bg-violet-500/10 text-violet-600",
  },
]

export function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {ACTIONS.map((action, i) => {
        const Icon = action.icon
        return (
          <motion.div
            key={action.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.4 + i * 0.08 }}
            whileHover={{ y: -3 }}
          >
            <Link href={action.href}>
              <Card className="h-full p-5 transition-shadow duration-200 hover:card-shadow-hover">
                <span
                  className={`flex size-10 items-center justify-center rounded-lg ${action.color}`}
                >
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div className="mt-3.5 text-sm font-semibold text-foreground">
                  {action.label}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {action.desc}
                </div>
              </Card>
            </Link>
          </motion.div>
        )
      })}
    </div>
  )
}
