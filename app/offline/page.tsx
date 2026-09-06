import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Offline — AMSU',
}

// Precached by next-pwa (fallbacks.document in next.config.mjs) and shown
// when a navigation request fails offline and the target page isn't
// already cached. Kept dependency-free and static so it renders from the
// service worker with no network at all.
export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-2xl">
        📡
      </div>
      <h1 className="text-lg font-semibold text-foreground">You&apos;re offline</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        AMSU can&apos;t reach the network right now. Pages you&apos;ve already opened
        still work — reconnect to load anything new.
      </p>
      <Link
        href="/dashboard"
        className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Try the dashboard
      </Link>
    </div>
  )
}
