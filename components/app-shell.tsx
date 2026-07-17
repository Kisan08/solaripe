"use client"

import type React from "react"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"
import { Sidebar } from "@/components/sidebar"
import { BottomNav } from "@/components/bottom-nav"

// Routes that should render standalone — no sidebar, no bottom nav, no
// app chrome at all. A logged-out visitor on /login or /signup has no
// account yet, so showing them navigation to pages they can't access
// (and which would just redirect them back here via middleware) is both
// confusing and a preview of internal nav to someone who isn't authed.
const AUTH_ROUTES = ["/login", "/signup"]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route))

  if (isAuthRoute) {
    return (
      <div className="min-h-screen bg-background">
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          {children}
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      {/* Content pushes right in sync with the rail's hover-expand. Using a
          plain <style> tag with a real CSS sibling selector here instead of
          Tailwind's peer-hover: utility — the combination of responsive +
          peer + arbitrary-value stacked together is an unusual enough
          combo that Tailwind's JIT wasn't reliably generating it, which is
          why the padding was stuck at one value regardless of hover state.
          This is just standard CSS, so it can't fail to compile. */}
      <style>{`
        .app-content { padding-left: 0; transition: padding-left .2s ease-out; }
        @media (min-width: 768px) {
          .app-content { padding-left: 68px; }
          .app-sidebar-rail:hover ~ .app-content { padding-left: 220px; }
        }
      `}</style>
      <div className="app-content">
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
