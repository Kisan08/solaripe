"use client"

import useSWR from "swr"
import { createClient } from "@/lib/supabase/client"
import type { Lead, Project } from "@/lib/types"

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
