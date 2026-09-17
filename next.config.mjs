import withPWAInit from 'next-pwa'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  transpilePackages: ['konva', 'react-konva', 'three'],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // next-pwa (below) adds a `webpack` step. On Next 16, having a `webpack`
  // config while Turbopack is the default build/dev engine is a hard
  // error unless a `turbopack` key is also present — an empty object is
  // enough to say "Turbopack for dev is intentional". `next dev` keeps
  // using Turbopack (fast, and next-pwa is disabled in dev anyway); the
  // production build opts back into webpack via `next build --webpack`
  // in package.json so next-pwa's workbox step actually runs.
  turbopack: {},
}

// next-pwa wraps the config: it merges in a webpack step that runs
// workbox's GenerateSW at `next build` time, emitting public/sw.js +
// public/workbox-*.js and a client-side registration script. Every
// option in `nextConfig` above is preserved (next-pwa spreads it through
// untouched).
const withPWA = withPWAInit({
  dest: 'public',
  // next-pwa's auto-register only patches the Pages Router entry, so on
  // the App Router we register sw.js ourselves — see
  // components/pwa-register.tsx, mounted in app/layout.tsx.
  register: false,
  skipWaiting: true, // a freshly built SW activates without waiting for tabs to close
  cacheStartUrl: false,
  dynamicStartUrl: false,
  runtimeCaching: [],
  importScripts: ['/security-cache-cleanup.js'],
  // No SW during `next dev` (which runs Turbopack, not webpack, so this
  // plugin can't hook in there anyway) — the SW is strictly a
  // `next build` artifact.
  disable: process.env.NODE_ENV === 'development',
  // Precache /offline and serve it for navigations that fail while the
  // requested page isn't in the cache (see app/offline/page.tsx).
  // Private pages and API responses must never be runtime-cached across accounts.
  fallbacks: {
    document: '/offline',
  },
})

export default withPWA(nextConfig)
