"use client"

import { useMemo } from "react"
import useSWR from "swr"
import { createClient } from "@/lib/supabase/client"
import type { Lead, Project } from "@/lib/types"
import type { QuoteSnapshot } from "@/lib/quoteSnapshot"

const supabase = createClient()

export function useLeads() {
  const { data, error, isLoading, mutate } = useSWR<Lead[]>(
    "leads",
    async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false })
      if (error) throw error
      return (data ?? []) as Lead[]
    },
    {
      revalidateOnFocus: true,
      revalidateOnMount: true,
      revalidateOnReconnect: true,
      dedupingInterval: 5000,
    }
  )
  return { leads: data ?? [], error, isLoading, mutate }
}

export function useProjects() {
  const { data, error, isLoading, mutate } = useSWR<Project[]>(
    "projects",
    async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false })
      if (error) throw error
      return (data ?? []) as Project[]
    },
    {
      revalidateOnFocus: true,
      revalidateOnMount: true,
      revalidateOnReconnect: true,
      dedupingInterval: 5000,
    }
  )
  return { projects: data ?? [], error, isLoading, mutate }
}

// ── lead_quotes ────────────────────────────────────────────────────
// Saved quote "recipes" — see lib/quoteSnapshot.ts and
// supabase/migrations/0019_lead_quotes.sql. Same RLS-scoped direct-from-
// browser pattern as leads/projects above.

export interface LeadQuoteRow {
  id: string
  lead_id: string
  proposal_no: string | null
  client_name: string | null
  system_kwp: number | null
  total_value: number | null
  created_at: string
}

/**
 * Every saved quote for the tenant, newest first, plus `latestByLead` —
 * the most recent quote per lead, which is what the Leads kanban/table
 * use to show the "has a quote" marker and as the double-click target.
 * The heavy `snapshot` column is intentionally NOT selected here; fetch
 * it per-quote with getLeadQuote() only when one is actually opened.
 */
export function useLeadQuotes() {
  const { data, error, isLoading, mutate } = useSWR<LeadQuoteRow[]>(
    "lead_quotes",
    async () => {
      const { data, error } = await supabase
        .from("lead_quotes")
        .select("id, lead_id, proposal_no, client_name, system_kwp, total_value, created_at")
        .order("created_at", { ascending: false })
      if (error) throw error
      return (data ?? []) as LeadQuoteRow[]
    },
    {
      revalidateOnFocus: true,
      revalidateOnMount: true,
      revalidateOnReconnect: true,
      dedupingInterval: 5000,
    }
  )

  const latestByLead = useMemo(() => {
    const map = new Map<string, LeadQuoteRow>()
    // `data` is already created_at-desc, so the first row seen per lead
    // is the newest.
    for (const row of data ?? []) {
      if (!map.has(row.lead_id)) map.set(row.lead_id, row)
    }
    return map
  }, [data])

  return { quotes: data ?? [], latestByLead, error, isLoading, mutate }
}

export async function saveLeadQuote(input: {
  leadId: string
  proposalNo?: string | null
  clientName?: string | null
  systemKwp?: number | null
  totalValue?: number | null
  snapshot: QuoteSnapshot
}) {
  const { data, error } = await supabase
    .from("lead_quotes")
    .insert({
      lead_id: input.leadId,
      proposal_no: input.proposalNo ?? null,
      client_name: input.clientName ?? null,
      system_kwp: input.systemKwp ?? null,
      total_value: input.totalValue ?? null,
      snapshot: input.snapshot,
    })
    .select("id")
    .single()
  if (error) throw error
  return data as { id: string }
}

export async function getLeadQuote(id: string) {
  const { data, error } = await supabase
    .from("lead_quotes")
    .select("id, lead_id, proposal_no, snapshot, created_at")
    .eq("id", id)
    .single()
  if (error) throw error
  return data as {
    id: string
    lead_id: string
    proposal_no: string | null
    snapshot: QuoteSnapshot
    created_at: string
  }
}

export async function saveLead(lead: Partial<Lead> & { id?: string }) {
  const { id, created_at, ...payload } = lead as Lead
  if (id) {
    const { error } = await supabase.from("leads").update(payload).eq("id", id)
    if (error) throw error
  } else {
    const { error } = await supabase.from("leads").insert(payload)
    if (error) throw error
  }
}

export async function deleteLead(id: string) {
  const { error } = await supabase.from("leads").delete().eq("id", id)
  if (error) throw error
}

export async function updateLeadStage(id: string, stage: string) {
  const { error } = await supabase.from("leads").update({ stage }).eq("id", id)
  if (error) throw error
}

export async function saveProject(
  project: Partial<Project> & { id?: string },
) {
  const { id, created_at, ...payload } = project as Project
  if (id) {
    const { error } = await supabase
      .from("projects")
      .update(payload)
      .eq("id", id)
    if (error) throw error
  } else {
    const { error } = await supabase.from("projects").insert(payload)
    if (error) throw error
  }
}

export async function deleteProject(id: string) {
  const { error } = await supabase.from("projects").delete().eq("id", id)
  if (error) throw error
}

export async function updateProjectMilestone(
  id: string,
  field: "t1_paid" | "t2_paid" | "t3_paid" | "t4_paid",
  value: boolean,
) {
  const { error } = await supabase
    .from("projects")
    .update({ [field]: value })
    .eq("id", id)
  if (error) throw error
}
