import type {
  LeadSource,
  LeadStage,
  ProjectStatus,
  ProjectType,
} from "./types"

// Tailwind utility classes for color-coded badges (solid, readable, themed).
export const sourceBadge: Record<LeadSource, string> = {
  Website: "bg-blue-50 text-blue-700 ring-blue-200",
  Referral: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "Social Media": "bg-pink-50 text-pink-700 ring-pink-200",
  "Walk-in": "bg-amber-50 text-amber-700 ring-amber-200",
  "Cold Call": "bg-cyan-50 text-cyan-700 ring-cyan-200",
  Exhibition: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  Other: "bg-slate-100 text-slate-600 ring-slate-200",
}

export const stageAccent: Record<LeadStage, string> = {
  "New Lead": "#3b82f6",
  "Site Visit": "#06b6d4",
  "Proposal Sent": "#8b5cf6",
  Negotiation: "#f5a623",
  Won: "#16a34a",
  Lost: "#ef4444",
}

export const projectTypeBadge: Record<ProjectType, string> = {
  EPC: "bg-[#1a4f8a]/10 text-[#1a4f8a] ring-[#1a4f8a]/20",
  OPEX: "bg-violet-50 text-violet-700 ring-violet-200",
  AMC: "bg-teal-50 text-teal-700 ring-teal-200",
  PPA: "bg-amber-50 text-amber-700 ring-amber-200",
}

export const statusBadge: Record<ProjectStatus, string> = {
  "In Progress": "bg-blue-50 text-blue-700 ring-blue-200",
  Completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "On Hold": "bg-amber-50 text-amber-700 ring-amber-200",
}
