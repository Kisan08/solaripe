"use client"

import { useEffect } from "react"

// next-pwa's `register: true` only wires up auto-registration for the
// Pages Router (it prepends to `main.js`), so under the App Router the
// service worker has to be registered by hand. This runs once on the
// client, after `load`, and only in production — matching next-pwa's
// `disable: NODE_ENV === 'development'`, so there's no sw.js to register
// in dev anyway. Renders nothing.
export function PwaRegister() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV !== "production"
    ) {
      return
    }

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => console.error("Service worker registration failed:", err))
    }

    if (document.readyState === "complete") {
      register()
      return
    }
    window.addEventListener("load", register, { once: true })
    return () => window.removeEventListener("load", register)
  }, [])

  return null
}
