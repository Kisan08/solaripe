"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import {
  Users,
  FolderKanban,
  FileText,
  IndianRupee,
  ArrowRight,
  Activity,
  Sparkles,
  AlertTriangle,
} from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Card } from "@/components/ui/card"
import { StatCard } from "@/components/dashboard/stat-card"
import { QuickActions } from "@/components/dashboard/quick-actions"
import { useLeads, useProjects } from "@/lib/data"
import { daysStale, usePipelineStages } from "@/lib/pipeline"
import { formatINRCompact, formatDate } from "@/lib/format"

export default function DashboardPage() {
  const { leads } = useLeads()
  const { projects } = useProjects()
  const { stages } = usePipelineStages()

  const totalLeads = leads.length
  const activeProjects = projects.filter(
    (p) => p.status === "In Progress",
  ).length
  const staleProjects = projects.filter(
    (p) => daysStale(p, stages) != null,
  ).length
  const proposalsSent = leads.filter(
    (l) => l.stage === "Proposal Sent" || l.stage === "Negotiation",
  ).length
  const pipelineValue = leads
    .filter((l) => l.stage !== "Lost" && l.stage !== "Won")
    .reduce((sum, l) => sum + (l.budget ?? 0), 0)

  const recent = [
    ...leads.map((l) => ({
      id: l.id,
      kind: "Lead" as const,
      title: l.name,
      meta: l.stage,
      date: l.created_at,
    })),
    ...projects.map((p) => ({
      id: p.id,
      kind: "Project" as const,
      title: p.client_name,
      meta: p.status,
      date: p.created_at,
    })),
  ]
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
    .slice(0, 6)

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Welcome back — here's how your solar business is tracking."
        action={
          <Link
            href="/leads"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Users className="size-4" />
            New Lead
          </Link>
        }
      />

      <div className="space-y-6 p-5 md:p-8">
        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard
            index={0}
            label="Total Leads"
            value={String(totalLeads)}
            hint="All enquiries captured"
            icon={Users}
            accent="primary"
          />
          <StatCard
            index={1}
            label="Active Projects"
            value={String(activeProjects)}
            hint="Currently in progress"
            icon={FolderKanban}
            accent="green"
          />
          <StatCard
            index={2}
            label="Proposals Sent"
            value={String(proposalsSent)}
            hint="Awaiting client decision"
            icon={FileText}
            accent="violet"
          />
          <StatCard
            index={3}
            label="Pipeline Value"
            value={formatINRCompact(pipelineValue)}
            hint="Open opportunity value"
            icon={IndianRupee}
            accent="amber"
          />
          {/* Subsidy/net-metering pipeline staleness — links to the
              Projects page where the actual stage-change/history UI lives. */}
          <Link href="/projects">
            <StatCard
              index={4}
              label="Needs Attention"
              value={String(staleProjects)}
              hint="Stuck past expected stage time"
              icon={AlertTriangle}
              accent="amber"
            />
          </Link>
        </div>

        {/* Quick actions */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            Quick actions
          </h2>
          <QuickActions />
        </section>

        {/* Get started banner */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.6 }}
        >
          <div className="relative overflow-hidden rounded-[14px] bg-gradient-to-br from-[#1a4f8a] to-[#2d6cb5] p-6 text-primary-foreground md:p-8">
            <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="max-w-xl">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide">
                  <Sparkles className="size-3.5" />
                  Get started
                </span>
                <h3 className="mt-3 text-pretty text-xl font-bold md:text-2xl">
                  Set up your solar pipeline in minutes
                </h3>
                <p className="mt-1.5 text-pretty text-sm text-white/80">
                  Add your first lead, configure quote defaults, and start
                  tracking projects from site visit to commissioning.
                </p>
              </div>
              <Link
                href="/leads"
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-primary transition-transform hover:scale-[1.02]"
              >
                Add your first lead
                <ArrowRight className="size-4" />
              </Link>
            </div>
            <div
              aria-hidden="true"
              className="absolute -right-12 -top-12 size-48 rounded-full bg-white/10"
            />
            <div
              aria-hidden="true"
              className="absolute -bottom-16 right-24 size-40 rounded-full bg-white/5"
            />
          </div>
        </motion.div>

        {/* Recent activity */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            Recent activity
          </h2>
          <Card className="overflow-hidden">
            {recent.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-secondary">
                  <Activity className="size-6 text-muted-foreground" />
                </div>
                <p className="mt-4 text-sm font-semibold text-foreground">
                  No activity yet
                </p>
                <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">
                  When you add leads and projects, your latest updates will show
                  up here so you never lose track of a deal.
                </p>
                <Link
                  href="/leads"
                  className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Add a lead
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {recent.map((item) => (
                  <li
                    key={`${item.kind}-${item.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3.5"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex size-9 items-center justify-center rounded-lg ${
                          item.kind === "Lead"
                            ? "bg-primary/10 text-primary"
                            : "bg-emerald-500/10 text-emerald-600"
                        }`}
                      >
                        {item.kind === "Lead" ? (
                          <Users className="size-[18px]" />
                        ) : (
                          <FolderKanban className="size-[18px]" />
                        )}
                      </span>
                      <div>
                        <div className="text-sm font-semibold text-foreground">
                          {item.title}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {item.kind} · {item.meta}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(item.date)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      </div>
    </>
  )
}
