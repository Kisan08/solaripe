export type LeadStage =
  | "New Lead"
  | "Site Visit"
  | "Proposal Sent"
  | "Negotiation"
  | "Won"
  | "Lost"

export type LeadSource =
  | "Website"
  | "Referral"
  | "Social Media"
  | "Walk-in"
  | "Cold Call"
  | "Exhibition"
  | "Other"

export type ProjectType = "EPC" | "OPEX" | "AMC" | "PPA"
export type ProjectStatus = "In Progress" | "Completed" | "On Hold"

export interface Lead {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  system_size: number | null
  budget: number | null
  source: LeadSource | null
  stage: LeadStage
  notes: string | null
  follow_up_date: string | null
  created_at: string
}

export interface Project {
  id: string
  client_name: string
  phone: string | null
  address: string | null
  system_size: number | null
  project_type: ProjectType
  status: ProjectStatus
  t1_paid: boolean
  t2_paid: boolean
  t3_paid: boolean
  t4_paid: boolean
  total_value: number | null
  notes: string | null
  created_at: string
  current_stage_id: string | null
  current_stage_entered_at: string | null
}

export const LEAD_STAGES: LeadStage[] = [
  "New Lead",
  "Site Visit",
  "Proposal Sent",
  "Negotiation",
  "Won",
  "Lost",
]

export const LEAD_SOURCES: LeadSource[] = [
  "Website",
  "Referral",
  "Social Media",
  "Walk-in",
  "Cold Call",
  "Exhibition",
  "Other",
]

export const PROJECT_TYPES: ProjectType[] = ["EPC", "OPEX", "AMC", "PPA"]
export const PROJECT_STATUSES: ProjectStatus[] = [
  "In Progress",
  "Completed",
  "On Hold",
]
