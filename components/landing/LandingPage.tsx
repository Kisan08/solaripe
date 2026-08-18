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
  Quote as QuoteIcon,
  Check,
} from "lucide-react"
import { DemoRequestModal } from "@/components/landing/DemoRequestModal"

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
  "AI QUOTE PDFS",
  "LEADS KANBAN + CRM",
  "GIGI VOICE AI",
  "HINDI + HINGLISH CALLING",
  "WHITE-LABEL READY",
]

const PROBLEMS = [
  {
    n: "01",
    title: "Leads live in WhatsApp",
    body: "New enquiries arrive across five chats, three phones, and a notebook. Half of them never get a callback.",
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
    body: "Design accurate, shadow-aware rooftop proposals in 3D — without sending a site engineer.",
    solid: false,
  },
  {
    icon: FileText,
    title: "AI quote generator",
    body: "Itemised, branded quotes generated in minutes, exported to a client-ready PDF in one click.",
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
    body: "An AI agent that qualifies inbound leads, answers common questions, and books site visits in Hindi or Hinglish.",
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
    title: "White-label ready",
    body: "Your brand, your domain, your proposals. Amsu runs quietly in the background as your own operating system.",
    solid: true,
  },
]

const TESTIMONIALS = [
  {
    quote: "We went from two-day quote turnarounds to under fifteen minutes. The PDF proposals look like we hired a design agency.",
    name: "Arvind Menon",
    title: "Director, SuryaKiran Renewables · Kochi",
  },
  {
    quote: "For the first time in six years, I can see every open deal on one board. Our close rate is up 30% in a single quarter.",
    name: "Priya Deshmukh",
    title: "Founder, Helios Edge Solar · Pune",
  },
  {
    quote: "Gigi books site visits while my team is up on the roof. And the Hindi calling agent qualifies leads better than any intern we trained.",
    name: "Shalini Rao",
    title: "Director, RajSun Power · Jaipur",
  },
]

const PLANS = [
  {
    name: "Starter",
    price: "₹4,999",
    period: "/month",
    blurb: "For small EPC teams moving off spreadsheets.",
    features: [
      "Up to 100 leads / month",
      "AI quote generator + PDF export",
      "Leads Kanban + CRM",
      "2 team seats",
      "Email support",
    ],
    cta: "Start with Starter",
    highlighted: false,
  },
  {
    name: "Growth",
    price: "₹9,999",
    period: "/month",
    blurb: "The full operating system for a growing EPC.",
    features: [
      "Everything in Starter",
      "3D rooftop design tool",
      "AI calling · 500 min (Hindi/Hinglish)",
      "Gigi voice assistant",
      "10 team seats",
      "Priority support",
    ],
    cta: "Start with Growth",
    highlighted: true,
  },
  {
    name: "Scale",
    price: "Custom",
    period: "",
    blurb: "For multi-branch EPCs and enterprise volume.",
    features: [
      "Unlimited leads & calling",
      "White-label domain & branding",
      "API access & integrations",
      "Dedicated success manager",
      "Custom SLA",
    ],
    cta: "Talk to sales",
    highlighted: false,
  },
]

function DashboardMockup() {
  return (
    <motion.div
      className="relative mx-auto max-w-3xl"
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.7, ease: "easeOut" }}
    >
      <div className="animate-bob absolute -top-6 right-2 z-10 hidden items-center gap-2 rounded-xl border border-gray-100 bg-white px-3.5 py-2.5 shadow-lg sm:flex md:right-6">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Check className="size-4" />
        </span>
        <div className="leading-tight">
          <div className="text-xs font-semibold text-[#0F172A]">Quote accepted</div>
          <div className="text-[11px] text-gray-500">₹4.2L · just now</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl transition-transform duration-500 hover:-translate-y-1">
        <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-gray-300" />
          <span className="size-2.5 rounded-full bg-gray-300" />
          <span className="size-2.5 rounded-full bg-gray-300" />
          <div className="ml-3 flex-1 rounded-md bg-white px-3 py-1 text-center text-[11px] text-gray-400">
            app.amsu.io/dashboard
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,140px)_1fr] gap-0 sm:grid-cols-[160px_1fr]">
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
                <div className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                  Tuesday, 14 July
                </div>
                <div className="text-sm font-bold text-[#0F172A]">
                  Good morning, SuryaKiran Renewables
                </div>
              </div>
              <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
                </span>
                LIVE
              </span>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "Active Leads", value: "128", change: "+12%" },
                { label: "Quotes Sent", value: "46", change: "+8%" },
                { label: "Deals Won", value: "₹18.4L", change: "+22%" },
                { label: "Avg. Quote Time", value: "9 min", change: "-71%" },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-gray-100 bg-white p-2">
                  <div className="text-sm font-extrabold text-[#0F172A]">{s.value}</div>
                  <div className="text-[9px] text-gray-400">
                    {s.label} <span className="text-emerald-500">{s.change}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg border border-gray-100 bg-white p-2">
                <div className="mb-1 text-[9px] font-semibold uppercase text-gray-400">New</div>
                <div className="rounded-md bg-gray-50 p-1.5 text-[10px]">
                  <div className="font-semibold text-[#0F172A]">Sharma Residence</div>
                  <div className="text-gray-400">₹3.1L</div>
                </div>
              </div>
              <div className="rounded-lg border border-gray-100 bg-white p-2">
                <div className="mb-1 text-[9px] font-semibold uppercase text-gray-400">Qualified</div>
                <div className="rounded-md bg-gray-50 p-1.5 text-[10px]">
                  <div className="font-semibold text-[#0F172A]">Hotel Lakeview</div>
                  <div className="text-gray-400">₹11.2L</div>
                </div>
              </div>
              <div className="rounded-lg border border-gray-100 bg-white p-2">
                <div className="mb-1 text-[9px] font-semibold uppercase text-gray-400">Won</div>
                <div className="rounded-md bg-gray-50 p-1.5 text-[10px]">
                  <div className="font-semibold text-[#0F172A]">Sunrise Mall</div>
                  <div className="text-gray-400">₹38.4L</div>
                </div>
              </div>
              <div className="rounded-lg border border-gray-100 bg-primary p-2 text-white">
                <div className="mb-1 text-[9px] font-semibold uppercase text-white/70">AI Quote</div>
                <div className="text-[10px] font-semibold">Rooftop 8.6 kW</div>
                <div className="mt-1 rounded bg-white/15 px-1.5 py-1 text-center text-[9px] font-semibold">
                  Export PDF
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="animate-bob-delayed absolute -bottom-5 left-2 z-10 hidden max-w-[220px] items-start gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2.5 shadow-lg sm:flex md:left-6">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Mic className="size-3.5" />
        </span>
        <div className="leading-tight">
          <div className="text-[11px] font-semibold text-[#0F172A]">Gigi added a lead</div>
          <div className="text-[10px] text-gray-500">Rakesh · Udaipur · 5 kW</div>
          <div className="mt-0.5 text-[10px] italic text-gray-400">
            &ldquo;3 new leads added from today&apos;s calls.&rdquo;
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
          <img src="/brand/amsu-logo.svg" alt="Amsu" className="h-11 w-auto sm:h-12" />
          <nav className="hidden items-center gap-8 text-sm font-medium text-gray-600 md:flex">
            <a href="#problem" className="hover:text-[#0F172A]">Problem</a>
            <a href="#features" className="hover:text-[#0F172A]">Features</a>
            <a href="#testimonials" className="hover:text-[#0F172A]">Testimonials</a>
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
          <p className="mt-8 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
            Trusted by 120+ solar EPCs across 14 states
          </p>
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

      {/* Testimonials */}
      <section id="testimonials" className="px-5 py-20 md:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionLabel>Customers</SectionLabel>
          <h2 className="text-balance text-3xl font-extrabold tracking-tight text-[#0F172A] sm:text-4xl">
            EPC teams that stopped chasing spreadsheets.
          </h2>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="rounded-2xl border border-gray-100 bg-white p-6 card-shadow">
                <QuoteIcon className="size-6 text-primary/30" fill="currentColor" />
                <p className="mt-3 text-[15px] italic leading-relaxed text-gray-700">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="mt-5 flex items-center gap-3 border-t border-gray-100 pt-4">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {t.name.split(" ").map((w) => w[0]).join("")}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[#0F172A]">{t.name}</div>
                    <div className="text-xs text-gray-500">{t.title}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-gray-50/60 px-5 py-20 md:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionLabel>Pricing</SectionLabel>
          <h2 className="text-balance text-3xl font-extrabold tracking-tight text-[#0F172A] sm:text-4xl">
            Pays for itself with one recovered deal.
          </h2>
          <p className="mt-4 max-w-xl text-pretty text-gray-500">
            Per company, billed annually. No per-lead fees, no surprise add-ons.
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
                {plan.highlighted && (
                  <span className="mb-3 inline-block rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide">
                    Most Popular
                  </span>
                )}
                <div className={`text-sm font-semibold ${plan.highlighted ? "text-white/80" : "text-gray-500"}`}>
                  {plan.name}
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold">{plan.price}</span>
                  {plan.period && (
                    <span className={plan.highlighted ? "text-white/70" : "text-gray-400"}>{plan.period}</span>
                  )}
                </div>
                <p className={`mt-2 text-sm ${plan.highlighted ? "text-white/80" : "text-gray-500"}`}>
                  {plan.blurb}
                </p>

                <ul className="mt-5 space-y-2.5">
                  {plan.features.map((f) => (
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
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>

          <p className="mt-8 text-center text-[11px] font-semibold uppercase tracking-widest text-gray-400">
            All plans include onboarding · GST invoice · Cancel anytime
          </p>
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
            See your own pipeline, quotes, and 3D designs running on Amsu — in a 30-minute demo tailored to your EPC.
          </p>
          <div className="mt-7 flex flex-col items-start gap-4 pb-20 sm:flex-row sm:items-center">
            <button
              onClick={() => setShowDemoModal(true)}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-primary transition-transform hover:scale-[1.02]"
            >
              Request a Demo
              <ArrowRight className="size-4" />
            </button>
            <span className="text-xs font-semibold uppercase tracking-widest text-white/60">
              Setup in under a week
            </span>
          </div>

          {/* Footer */}
          <div className="border-t border-white/15 py-12">
            <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4">
              <div>
                <img src="/brand/amsu-logo-white.svg" alt="Amsu" className="h-7 w-auto" />
                <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/50">
                  Elevate. Inspire. Empower.
                </div>
                <p className="mt-4 max-w-xs text-sm text-white/70">
                  The white-label operating platform for solar EPC companies in India.
                </p>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-white/50">Product</div>
                <ul className="mt-3 space-y-2 text-sm text-white/80">
                  <li><a href="#features" className="hover:text-white">Features</a></li>
                  <li><a href="#pricing" className="hover:text-white">Pricing</a></li>
                  <li><a href="#testimonials" className="hover:text-white">Testimonials</a></li>
                </ul>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-white/50">Company</div>
                <ul className="mt-3 space-y-2 text-sm text-white/80">
                  <li><a href="#problem" className="hover:text-white">About</a></li>
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
              <span>© 2026 Amsu Technologies Pvt. Ltd. All rights reserved.</span>
              <span className="font-semibold uppercase tracking-widest">Made in India</span>
            </div>
          </div>
        </div>
      </section>

      {showDemoModal && <DemoRequestModal onClose={() => setShowDemoModal(false)} />}
    </div>
  )
}
