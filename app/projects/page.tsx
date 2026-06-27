"use client"

import { useState } from "react"
import { Plus, FolderKanban, Loader2 } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Card } from "@/components/ui/card"
import { ProjectCard } from "@/components/projects/project-card"
import { ProjectModal } from "@/components/projects/project-modal"
import {
  useProjects,
  saveProject,
  deleteProject,
  updateProjectMilestone,
} from "@/lib/data"
import type { Project } from "@/lib/types"

export default function ProjectsPage() {
  const { projects, isLoading, mutate } = useProjects()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)

  const openNew = () => {
    setEditing(null)
    setModalOpen(true)
  }
  const openEdit = (p: Project) => {
    setEditing(p)
    setModalOpen(true)
  }

  const handleSave = async (values: Partial<Project>) => {
    await saveProject(values)
    await mutate()
  }
  const handleDelete = async (id: string) => {
    await deleteProject(id)
    await mutate()
  }
  const handleToggleMilestone = async (
    p: Project,
    field: "t1_paid" | "t2_paid" | "t3_paid" | "t4_paid",
    value: boolean,
  ) => {
    // optimistic update
    await mutate(
      projects.map((x) => (x.id === p.id ? { ...x, [field]: value } : x)),
      false,
    )
    await updateProjectMilestone(p.id, field, value)
    await mutate()
  }

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Manage installations and track payment milestones."
        action={
          <button
            onClick={openNew}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="size-4" />
            New Project
          </button>
        }
      />

      <div className="p-5 md:p-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10">
              <FolderKanban className="size-6 text-emerald-600" />
            </div>
            <p className="mt-4 text-sm font-semibold text-foreground">
              No projects yet
            </p>
            <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">
              Create your first installation project to track payment
              milestones from advance to handover.
            </p>
            <button
              onClick={openNew}
              className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="size-4" />
              New Project
            </button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((p, i) => (
              <ProjectCard
                key={p.id}
                project={p}
                index={i}
                onEdit={openEdit}
                onToggleMilestone={handleToggleMilestone}
              />
            ))}
          </div>
        )}
      </div>

      <ProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        project={editing}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </>
  )
}
