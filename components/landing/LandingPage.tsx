"use client"

import { useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  ArrowRight,
  Box,
  FileText,
  Columns3,
  Phone,
  Mic,
  BadgeCheck,
  Check,
} from "lucide-react"
import { DemoRequestModal } from "@/components/landing/DemoRequestModal"
import { limitFor } from "@/lib/usage/rules"

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
      <span className="h-px w-6 bg-primary/40" />
      {children}
    </div>
  )
}

const TICKER_ITEMS = [
  "3D ROOFTOP DESIGN",
  "QUOTE PDFS",
  "LEADS KANBAN + CRM",
  "GIGI VOICE AI",
  "HINDI + HINGLISH CALLING",
  "YOUR LOGO ON EVERY QUOTE",
]

const PROBLEMS = [
  {
    n: "01",
    title: "Leads live in WhatsApp",
    body: "New enquiries arrive across five chats, three phones, and a notebook.",
  },
  {
    n: "02",
    title: "Quotes are Excel gymnastics",
    body: "Every proposal is copy-paste, manual math, and crossed fingers. One wrong cell can kill your margin.",
  },
  {
    n: "03",
    title: "No view of the pipeline",
    body: "Which deals are hot, stalled, or dead? Without a board, every Monday review meeting is pure guesswork.",
  },
  {
    n: "04",
    title: "Follow-ups slip quietly",
    body: "Site surveys get rescheduled, quotes go unread, and warm leads go cold — because nobody was reminded.",
  },
]

const FEATURES = [
  {
    icon: Box,
    title: "3D rooftop solar design",
    body: "Trace the roof on a satellite map and lay out panels in 3D to show your client a design.",
    solid: false,
  },
  {
    icon: FileText,
    title: "Quote generator",
    body: "Itemised, branded quotes exported to a client-ready PDF in one click.",
    solid: true,
  },
  {
    icon: Columns3,
    title: "Leads Kanban + CRM",
    body: "Every enquiry on one board — from first contact to close. Nothing slips, nothing hides.",
    solid: false,
  },
  {
    icon: Phone,
    title: "AI-assisted calling",
    body: "An AI agent calls the leads on your list in Hindi or Hinglish, asks for their city and electricity bill, and records the result in your CRM.",
    solid: false,
  },
  {
    icon: Mic,
    title: "Gigi, the voice assistant",
    body: "Add leads, update your pipeline, and get status on any deal — just by asking, from anywhere in the app.",
    solid: false,
  },
  {
    icon: BadgeCheck,
    title: "Your branding on quotes",
    body: "Add your logo, colours and company details to every proposal.",
    solid: true,
  },
]

// Only what the product actually enforces today: the monthly AI-call and
// WhatsApp allowances. The numbers are read from the same rules the server
// uses (lib/usage/rules.ts), so this page cannot drift from what is enforced.
// "Scale" is the public name of the plan the code calls "enterprise".
const PLANS = [
  { name: "Starter", price: "₹999", plan: "starter", highlighted: false },
  { name: "Growth", price: "₹2,500", plan: "growth", highlighted: false },
  { name: "Scale", price: "₹5,000", plan: "enterprise", highlighted: false },
] as const

function planFeatures(plan: "starter" | "growth" | "enterprise") {
  const n = (v: number) => v.toLocaleString("en-IN")
  return [
    `${n(limitFor("ai_call", plan))} AI calls per month`,
    `${n(limitFor("whatsapp", plan))} WhatsApp messages per month`,
  ]
}

function DashboardMockup() {
  return (
    <motion.div
      className="relative mx-auto max-w-3xl"
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.7, ease: "easeOut" }}
    >
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl transition-transform duration-500 hover:-translate-y-1">
        <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-gray-300" />
          <span className="size-2.5 rounded-full bg-gray-300" />
          <span className="size-2.5 rounded-full bg-gray-300" />
          <div className="ml-3 flex-1 rounded-md bg-white px-3 py-1 text-center text-[11px] text-gray-400">
            amsuapp.in
          </div>
        </div>

        {/* grid-cols-1 below sm: the sidebar column is hidden (flex/hidden
            below) but a fixed-width grid track still reserves its space
            even when empty, squeezing the real content on mobile. Single
            column with no dead reserved track until sm:, where the
            sidebar reappears and the two-column layout applies. */}
        <div className="grid grid-cols-1 gap-0 sm:grid-cols-[160px_1fr]">
          <div className="hidden flex-col gap-1 border-r border-gray-100 bg-gray-50/70 p-3 sm:flex">
            <div className="mb-2 flex items-center gap-1.5 px-1">
              <img src="/brand/amsu-mark.png" alt="" className="size-4" />
              <span className="text-[11px] font-bold text-[#0F172A]">Amsu</span>
            </div>
            {["Dashboard", "Leads", "Quotes", "Designs", "Gigi AI"].map((item, i) => (
              <div
                key={item}
                className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium ${
                  i === 0 ? "bg-primary text-white" : "text-gray-400"
                }`}
              >
                {item}
              </div>
            ))}
          </div>

          <div className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-[#0F172A]">Dashboard</div>
              </div>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                Sample data
              </span>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {["Active Leads", "Quotes Sent", "Deals Won", "Avg. Quote Time"].map((label) => (
                <div key={label} className="rounded-lg border border-gray-100 bg-white p-2">
                  <div className="text-sm font-extrabold text-gray-300">—</div>
                  <div className="text-[9px] text-gray-400">{label}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg border border-gray-100 bg-white p-2">
                <div className="mb-1 text-[9px] font-semibold uppercase text-gray-400">New Lead</div>
                <div className="rounded-md bg-gray-50 p-1.5 text-[10px]">
                  <div className="font-semibold text-gray-400">Sample lead</div>
                </div>
              </div>
              <div className="rounded-lg border border-gray-100 bg-white p-2">
                <div className="mb-1 text-[9px] font-semibold uppercase text-gray-400">Site Visit</div>
                <div className="rounded-md bg-gray-50 p-1.5 text-[10px]">
                  <div className="font-semibold text-gray-400">Sample lead</div>
                </div>
              </div>
              <div className="rounded-lg border border-gray-100 bg-white p-2">
                <div className="mb-1 text-[9px] font-semibold uppercase text-gray-400">Won</div>
                <div className="rounded-md bg-gray-50 p-1.5 text-[10px]">
                  <div className="font-semibold text-gray-400">Sample lead</div>
                </div>
              </div>
              <div className="rounded-lg border border-gray-100 bg-primary p-2 text-white">
                <div className="mb-1 text-[9px] font-semibold uppercase text-white/70">Quote</div>
                <div className="text-[10px] font-semibold">Rooftop quote</div>
                <div className="mt-1 rounded bg-white/15 px-1.5 py-1 text-center text-[9px] font-semibold">
                  Export PDF
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </motion.div>
  )
}

export function LandingPage() {
  const [showDemoModal, setShowDemoModal] = useState(false)

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:px-8">
          {/* Reverted from amsu-wordmark.png (a single baked icon+tagline
              image) back to a coded icon + text lockup — amsu-mark.png as
              the small icon only, "Amsu" as real text next to it, no
              tagline, no logotype graphic. */}
          <div className="flex items-center gap-2">
            <img src="/brand/amsu-mark.png" alt="" className="h-8 w-auto sm:h-9" />
            <span className="text-2xl font-bold tracking-tight text-[#0F172A]">Amsu</span>
          </div>
          <nav className="hidden items-center gap-8 text-sm font-medium text-gray-600 md:flex">
            <a href="#problem" className="hover:text-[#0F172A]">Problem</a>
            <a href="#features" className="hover:text-[#0F172A]">Features</a>
            <a href="#pricing" className="hover:text-[#0F172A]">Pricing</a>
          </nav>
          <div className="flex items-center gap-5">
            <Link href="/login" className="hidden text-sm font-medium text-gray-600 hover:text-[#0F172A] sm:block">
              Log in
            </Link>
            <button
              onClick={() => setShowDemoModal(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Request a Demo
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="px-5 pb-16 pt-14 md:px-8 md:pt-20">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-4 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
            <span className="h-px w-6 bg-primary/40" />
            For Solar EPC Companies
            <span className="h-px w-6 bg-primary/40" />
          </div>
          <h1 className="text-balance text-4xl font-extrabold leading-[1.1] tracking-tight text-[#0F172A] sm:text-5xl md:text-6xl">
            Run your entire solar EPC business{" "}
            <span className="text-primary">from one platform.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-base text-gray-500 sm:text-lg">
            Design, quote, track leads, and close deals — without the spreadsheet chaos.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <button
              onClick={() => setShowDemoModal(true)}
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-white transition-transform hover:scale-[1.02]"
            >
              Request a Demo
              <ArrowRight className="size-4" />
            </button>
            <Link href="/login" className="text-sm font-medium text-gray-500 underline underline-offset-4 hover:text-[#0F172A]">
              Log in
            </Link>
          </div>
        </div>

        <div className="mt-14">
          <DashboardMockup />
        </div>
      </section>

      {/* Ticker */}
      <div className="overflow-hidden border-y border-gray-100 bg-gray-50 py-3">
        <div className="flex w-max animate-marquee gap-10 whitespace-nowrap text-xs font-semibold uppercase tracking-widest text-gray-400">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span key={i} className="flex items-center gap-10">
              {item}
              <span className="text-primary/40">◆</span>
            </span>
          ))}
        </div>
      </div>

      {/* Problem */}
      <section id="problem" className="px-5 py-20 md:px-8">
        <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-2 md:gap-16">
          <div>
            <SectionLabel>The Problem</SectionLabel>
            <h2 className="text-balance text-3xl font-extrabold tracking-tight text-[#0F172A] sm:text-4xl">
              Still running your EPC on WhatsApp and Excel?
            </h2>
            <p className="mt-4 text-pretty text-gray-500">
              Most solar EPCs in India grow on hustle — until the hustle starts leaking revenue.
              Four places where it breaks:
            </p>
            <a href="#features" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
              See how Amsu fixes it ↓
            </a>
          </div>
          <div className="divide-y divide-gray-100">
            {PROBLEMS.map((p) => (
              <div key={p.n} className="flex gap-4 py-5 first:pt-0 last:pb-0">
                <span className="shrink-0 text-sm font-bold text-primary">{p.n}</span>
                <div>
                  <h3 className="font-bold text-[#0F172A]">{p.title}</h3>
                  <p className="mt-1 text-sm text-gray-500">{p.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-gray-50/60 px-5 py-20 md:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionLabel>The Platform</SectionLabel>
          <h2 className="text-balance text-3xl font-extrabold tracking-tight text-[#0F172A] sm:text-4xl">
            Everything after the first hello, handled.
          </h2>
          <p className="mt-4 max-w-2xl text-pretty text-gray-500">
            Six tools that replace the patchwork of chats, sheets, and memory your team runs on today.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-gray-100 bg-white p-6 card-shadow">
                <span
                  className={`mb-4 flex size-10 items-center justify-center rounded-xl ${
                    f.solid ? "bg-primary text-white" : "bg-primary/10 text-primary"
                  }`}
                >
                  <f.icon className="size-5" />
                </span>
                <h3 className="font-bold text-[#0F172A]">{f.title}</h3>
                <p className="mt-1.5 text-sm text-gray-500">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-5 py-20 md:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionLabel>Pricing</SectionLabel>
          <h2 className="text-balance text-3xl font-extrabold tracking-tight text-[#0F172A] sm:text-4xl">
            Plans and pricing.
          </h2>
          <p className="mt-4 max-w-xl text-pretty text-gray-500">
            Per company. No per-lead fees.
          </p>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl p-6 ${
                  plan.highlighted
                    ? "bg-primary text-white shadow-2xl lg:-translate-y-2"
                    : "border border-gray-200 bg-white"
                }`}
              >
                <div className={`text-sm font-semibold ${plan.highlighted ? "text-white/80" : "text-gray-500"}`}>
                  {plan.name}
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold">{plan.price}</span>
                  <span className={plan.highlighted ? "text-white/70" : "text-gray-400"}>/month</span>
                </div>

                <ul className="mt-5 space-y-2.5">
                  {planFeatures(plan.plan).map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className={`mt-0.5 size-4 shrink-0 ${plan.highlighted ? "text-white" : "text-primary"}`} />
                      <span className={plan.highlighted ? "text-white/90" : "text-gray-600"}>{f}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => setShowDemoModal(true)}
                  className={`mt-6 w-full rounded-xl py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 ${
                    plan.highlighted
                      ? "bg-white text-primary"
                      : "border border-primary text-primary"
                  }`}
                >
                  Request a Demo
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA + footer */}
      <section className="bg-primary px-5 pt-20 text-white md:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="text-xs font-semibold uppercase tracking-widest text-white/70">Ready when you are</div>
          <h2 className="mt-3 max-w-2xl text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
            Stop losing deals to spreadsheet chaos.
          </h2>
          <p className="mt-4 max-w-xl text-pretty text-white/80">
            Request a demo to see the pipeline, quotes, and 3D designs in Amsu.
          </p>
          <div className="mt-7 flex flex-col items-start gap-4 pb-20 sm:flex-row sm:items-center">
            <button
              onClick={() => setShowDemoModal(true)}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-primary transition-transform hover:scale-[1.02]"
            >
              Request a Demo
              <ArrowRight className="size-4" />
            </button>
          </div>

          {/* Footer */}
          <div className="border-t border-white/15 py-12">
            <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4">
              <div>
                {/* amsu-mark.png (icon only) + a separately styled white
                    "Amsu" label — not amsu-wordmark.png, which (a) has
                    blue gradient text that would have poor contrast
                    against this dark bg-primary (#1a4f8a) footer, unlike
                    the old amsu-logo-white.svg's white text, and (b)
                    bakes its own "Elevate. Inspire. Empower." tagline
                    into the image, which would duplicate the separate
                    tagline line already rendered right below this. Best
                    match for what the old white SVG variant was actually
                    doing (icon + white wordmark text) using the correct
                    mark. Worth a visual check: the icon's darkest gradient
                    stop is close in value to this background color, so
                    contrast there is tighter than on a lighter surface. */}
                <div className="flex items-center gap-2">
                  <img src="/brand/amsu-mark.png" alt="" className="h-7 w-auto" />
                  <span className="text-xl font-semibold tracking-tight text-white">Amsu</span>
                </div>
                <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/50">
                  Elevate. Inspire. Empower.
                </div>
                <p className="mt-4 max-w-xs text-sm text-white/70">
                  The operating platform for solar EPC companies in India.
                </p>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-white/50">Product</div>
                <ul className="mt-3 space-y-2 text-sm text-white/80">
                  <li><a href="#features" className="hover:text-white">Features</a></li>
                  <li><a href="#pricing" className="hover:text-white">Pricing</a></li>
                </ul>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-white/50">Company</div>
                <ul className="mt-3 space-y-2 text-sm text-white/80">
                  <li><button onClick={() => setShowDemoModal(true)} className="hover:text-white">Contact</button></li>
                  <li><Link href="/login" className="hover:text-white">Log in</Link></li>
                </ul>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-white/50">Legal</div>
                <ul className="mt-3 space-y-2 text-sm text-white/80">
                  <li><span className="cursor-default">Privacy Policy</span></li>
                  <li><span className="cursor-default">Terms of Service</span></li>
                </ul>
              </div>
            </div>

            <div className="mt-10 flex flex-col gap-2 border-t border-white/15 pt-6 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between">
              <span>© {new Date().getFullYear()} Amsu</span>
              <span className="font-semibold uppercase tracking-widest">Made in India</span>
            </div>
          </div>
        </div>
      </section>

      {showDemoModal && <DemoRequestModal onClose={() => setShowDemoModal(false)} />}
    </div>
  )
}
