"use client"

import type React from "react"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"
import { Sidebar } from "@/components/sidebar"
import { BottomNav } from "@/components/bottom-nav"

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="md:pl-[220px]">
        <main className="mx-auto min-h-screen w-full max-w-7xl pb-24 md:pb-0">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {children}
          </motion.div>
        </main>
      </div>
      <BottomNav />
    </div>
  )
}