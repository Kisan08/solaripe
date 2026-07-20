import { createClient } from '@/lib/supabase/client'

export interface ClientLogo {
  id: string
  name: string
  logo_url: string
  display_order: number
  active: boolean
}

export interface Testimonial {
  id: string
  customer_name: string
  customer_company: string | null
  designation: string | null
  photo_url: string | null
  rating: number | null
  testimonial_text: string
  display_order: number
  active: boolean
}

export interface Certification {
  id: string
  name: string
  issuing_authority: string | null
  certificate_number: string | null
  issue_date: string | null
  expiry_date: string | null
  certificate_image_url: string | null
  description: string | null
  display_order: number
  active: boolean
}

export interface TenantProject {
  id: string
  title: string
  site_name: string | null
  location: string | null
  system_capacity_kwp: number | null
  completion_date: string | null
  main_image_url: string | null
  description: string | null
  featured: boolean
  display_order: number
  active: boolean
}

type MediaKind = 'logo' | 'testimonial' | 'certificate' | 'project'
// tenant_pipeline_stages (Phase 7) is included here too — it's not a
// "media" table, but it shares the exact same reorder/toggle-active/
// upsert shape, so the settings-side PipelineStagesSection reuses these
// generic helpers instead of a duplicate generic layer for one table.
type MediaTable = 'tenant_client_logos' | 'tenant_testimonials' | 'tenant_certifications' | 'tenant_projects' | 'tenant_pipeline_stages'

// Reuses the existing `branding` storage bucket/policies (see
// supabase/migrations/0006_quote_branding.sql) exactly like
// uploadProductLogo in lib/products.ts — write is restricted to the
// uploader's own auth.uid() folder, so branding/<tenant_id>/media/... is
// a valid path with zero new bucket/policy changes.
export async function uploadMediaAsset(file: File, kind: MediaKind, id: string): Promise<string> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const ext = file.name.split('.').pop() || 'png'
  const path = `${user.id}/media/${kind}-${id}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('branding')
    .upload(path, file, { upsert: true, cacheControl: '3600' })
  if (uploadError) throw uploadError

  const { data } = supabase.storage.from('branding').getPublicUrl(path)
  return data.publicUrl
}

// ── Tenant-facing reads (quote page) — RLS already scopes rows to the
// signed-in tenant, so these are plain filtered selects, same pattern as
// fetchActiveProducts() in lib/products.ts. Degrade to [] on error rather
// than throwing, so a fetch hiccup hides the optional PDF section instead
// of crashing the page.
export async function fetchClientLogos(): Promise<ClientLogo[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('tenant_client_logos')
    .select('*')
    .eq('active', true)
    .order('display_order', { ascending: true })
  if (error) {
    console.error('Failed to load client logos:', error.message)
    return []
  }
  return (data ?? []) as ClientLogo[]
}

export async function fetchTestimonials(): Promise<Testimonial[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('tenant_testimonials')
    .select('*')
    .eq('active', true)
    .order('display_order', { ascending: true })
  if (error) {
    console.error('Failed to load testimonials:', error.message)
    return []
  }
  return (data ?? []) as Testimonial[]
}

export async function fetchCertifications(): Promise<Certification[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('tenant_certifications')
    .select('*')
    .eq('active', true)
    .order('display_order', { ascending: true })
  if (error) {
    console.error('Failed to load certifications:', error.message)
    return []
  }
  return (data ?? []) as Certification[]
}

export async function fetchFeaturedProjects(): Promise<TenantProject[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('tenant_projects')
    .select('*')
    .eq('active', true)
    .eq('featured', true)
    .order('display_order', { ascending: true })
  if (error) {
    console.error('Failed to load featured projects:', error.message)
    return []
  }
  return (data ?? []) as TenantProject[]
}

// ── Settings-side CRUD — lists everything (incl. inactive) so a tenant
// can reactivate something, mirrors app/admin/products/page.tsx's
// list/add/edit/deactivate shape but calls Supabase directly (no API
// route layer) per lib/settings.ts's established direct-client pattern,
// since this data is tenant-owned and RLS alone is the security boundary.
export async function fetchAllClientLogos(): Promise<ClientLogo[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from('tenant_client_logos').select('*').order('display_order', { ascending: true })
  if (error) throw error
  return (data ?? []) as ClientLogo[]
}

export async function fetchAllTestimonials(): Promise<Testimonial[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from('tenant_testimonials').select('*').order('display_order', { ascending: true })
  if (error) throw error
  return (data ?? []) as Testimonial[]
}

export async function fetchAllCertifications(): Promise<Certification[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from('tenant_certifications').select('*').order('display_order', { ascending: true })
  if (error) throw error
  return (data ?? []) as Certification[]
}

export async function fetchAllProjects(): Promise<TenantProject[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from('tenant_projects').select('*').order('display_order', { ascending: true })
  if (error) throw error
  return (data ?? []) as TenantProject[]
}

export async function upsertMediaRow<T extends { id?: string }>(table: MediaTable, row: T): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  if (row.id) {
    const { error } = await supabase.from(table).update(row).eq('id', row.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from(table).insert({ ...row, tenant_id: user.id })
    if (error) throw error
  }
}

export async function toggleMediaActive(table: MediaTable, id: string, active: boolean): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from(table).update({ active }).eq('id', id)
  if (error) throw error
}

// Swaps display_order between two adjacent rows — the up/down reorder
// control's underlying operation. No drag-and-drop library exists in
// this repo, and the spec explicitly allows this simpler approach.
export async function swapDisplayOrder(table: MediaTable, rowA: { id: string; display_order: number }, rowB: { id: string; display_order: number }): Promise<void> {
  const supabase = createClient()
  const { error: errA } = await supabase.from(table).update({ display_order: rowB.display_order }).eq('id', rowA.id)
  if (errA) throw errA
  const { error: errB } = await supabase.from(table).update({ display_order: rowA.display_order }).eq('id', rowB.id)
  if (errB) throw errB
}
