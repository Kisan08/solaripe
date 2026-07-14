"use client"

import type React from "react"
import { Suspense } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { motion } from "framer-motion"
import { Sidebar } from "@/components/sidebar"
import { BottomNav } from "@/components/bottom-nav"

// useSearchParams() requires a Suspense boundary around whatever calls it,
// or Next.js's static prerendering of routes with no dynamic data of their
// own (like the auto-generated /_not-found page, which renders through
// this same root-level AppShell) fails at build time with "useSearchParams
// should be wrapped in a suspense boundary". usePathname() has no such
// requirement, so it stays in the outer component; only the searchParams-
// dependent logic (Client View detection) is isolated in the inner
// component below and wrapped in <Suspense>.
function AppShellInner({ pathname, isDesignRoute, children }: {
  pathname: string | null
  isDesignRoute: boolean
  children: React.ReactNode
}) {
  const searchParams = useSearchParams()

  // Client View (?client=1 on /design) must hide global navigation
  // entirely, not just visually cover it with a fixed/z-9999 overlay —
  // that left the Sidebar and BottomNav still mounted underneath. AppShell
  // is the workspace-level layout that actually controls whether those
  // mount at all, so this is a real bypass: a client opening a shared
  // design link never renders any internal navigation chrome, and there's
  // nothing for the page itself to "escape" from anymore.
  const isDesignClientView = isDesignRoute && searchParams.get("client") === "1"

  if (isDesignClientView) {
    return <div className="min-h-screen bg-background">{children}</div>
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
        <main
          className={
            isDesignRoute
              ? "min-h-screen w-full"
              : "mx-auto min-h-screen w-full max-w-7xl pb-24 md:pb-0"
          }
        >
          {isDesignRoute ? (
            children
          ) : (
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          )}
        </main>
      </div>
      <BottomNav />
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // The Design workspace is a CAD-style tool, not a dashboard page — it
  // needs the full available width instead of sitting in the centered
  // max-w-7xl column every other page uses. This ONLY removes that width
  // cap + centering for /design; the sidebar's own fixed positioning and
  // the .app-content padding-left push/hover-expand mechanics above are
  // completely untouched, so the global rail behaves identically on every
  // other route.
  const isDesignRoute = pathname?.startsWith("/design") ?? false

  return (
    <Suspense fallback={<div className="min-h-screen bg-background">{children}</div>}>
      <AppShellInner pathname={pathname} isDesignRoute={isDesignRoute}>
        {children}
      </AppShellInner>
    </Suspense>
  )
}