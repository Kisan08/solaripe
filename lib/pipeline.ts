import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import type { Project } from '@/lib/types'

export interface PipelineStage {
  id: string
  name: string
  display_order: number
  expected_days: number | null
  active: boolean
}

export interface ProjectPipelineHistoryEntry {
  id: string
  project_id: string
  stage_id: string
  notes: string | null
  entered_at: string
}

// All stages, including inactive ones — needed because a project's
// history can reference a stage the tenant later renamed or deactivated,
// and the history view still needs to resolve a name for it.
export async function fetchAllPipelineStages(): Promise<PipelineStage[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('tenant_pipeline_stages')
    .select('*')
    .order('display_order', { ascending: true })
  if (error) throw error
  return (data ?? []) as PipelineStage[]
}

// SWR hook, mirrors useProjects() in lib/data.ts — fetched once at the
// projects page level and passed down to every ProjectCard, rather than
// each card fetching its own copy.
export function usePipelineStages() {
  const { data, error, isLoading, mutate } = useSWR<PipelineStage[]>(
    'pipeline-stages',
    fetchAllPipelineStages,
    {
      revalidateOnFocus: true,
      revalidateOnMount: true,
      revalidateOnReconnect: true,
      dedupingInterval: 5000,
    },
  )
  return { stages: data ?? [], error, isLoading, mutate }
}

// Active-only, for the project card's stage-change dropdown — a
// deactivated stage shouldn't be selectable going forward.
export async function fetchActivePipelineStages(): Promise<PipelineStage[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('tenant_pipeline_stages')
    .select('*')
    .eq('active', true)
    .order('display_order', { ascending: true })
  if (error) {
    console.error('Failed to load pipeline stages:', error.message)
    return []
  }
  return (data ?? []) as PipelineStage[]
}

export async function fetchProjectPipelineHistory(projectId: string): Promise<ProjectPipelineHistoryEntry[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('project_pipeline_history')
    .select('*')
    .eq('project_id', projectId)
    .order('entered_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ProjectPipelineHistoryEntry[]
}

// Days a project has sat in its current stage past that stage's
// expected_days — null means either no current stage, no expected_days
// set (deliberately not staleness-tracked, e.g. an installer-controlled
// milestone), or still within the expected window. Shared by the project
// card's badge and the dashboard's "Needs Attention" count, so both agree
// on exactly what counts as stale.
export function daysStale(project: Project, stages: PipelineStage[]): number | null {
  if (!project.current_stage_id || !project.current_stage_entered_at) return null
  const stage = stages.find((s) => s.id === project.current_stage_id)
  if (!stage || stage.expected_days == null) return null
  const daysElapsed = Math.floor(
    (Date.now() - new Date(project.current_stage_entered_at).getTime()) / 86400000,
  )
  const over = daysElapsed - stage.expected_days
  return over > 0 ? over : null
}

// Two sequential direct-client calls (insert history row, then update the
// project's current-stage pointer) rather than a Postgres RPC/transaction
// — this repo has no precedent for RPC functions anywhere, and every
// other mutation (saveProject, updateProjectMilestone, upsertMediaRow)
// already accepts this same non-atomic shape. A failure between the two
// calls would leave a history row without a matching project update,
// which is recoverable (the history is still accurate) rather than
// silently wrong.
export async function updateProjectPipelineStage(projectId: string, stageId: string, notes: string | null): Promise<void> {
  const supabase = createClient()
  const enteredAt = new Date().toISOString()

  const { error: historyError } = await supabase
    .from('project_pipeline_history')
    .insert({ project_id: projectId, stage_id: stageId, notes: notes?.trim() || null, entered_at: enteredAt })
  if (historyError) throw historyError

  const { error: projectError } = await supabase
    .from('projects')
    .update({ current_stage_id: stageId, current_stage_entered_at: enteredAt })
    .eq('id', projectId)
  if (projectError) throw projectError
}
