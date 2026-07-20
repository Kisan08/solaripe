import { createClient } from '@/lib/supabase/client'
import { company } from '@/lib/company.config'

export interface WarrantyRow {
  item: string
  coverage: string
  period: string
}

export interface ScopeLists {
  included: string[]
  excluded: string[]
}

export interface PaymentMilestone {
  label: string
  percent: number
}

export interface AppSettings {
  name: string
  short_name: string
  phone: string
  email: string
  gst: string
  proprietor: string
  address: string
  website: string
  panel_brand: string
  panel_wp: number
  default_rate: number
  yield_kwh: number
  gst_rate: number
  twilio_number: string
  owner_phone: string
  // Quote branding (Phase 3) — every field falls back to today's exact
  // look, so a tenant who's never touched these sees the identical quote
  // that existed before this feature.
  logo_url: string | null
  cover_image_url: string | null
  primary_color: string
  secondary_color: string
  accent_color: string
  show_why_solar: boolean
  show_partner_logos: boolean
  // Phase 6: superseded by tenant_client_logos (lib/media.ts) — "Our
  // Clients" visibility is now purely data-driven (shown iff the tenant
  // has added ≥1 active logo), so this toggle is no longer read by the
  // quote page or shown in Settings. Left here (and in the DB column)
  // rather than dropped, since removing a column is a destructive,
  // non-reversible migration for a field that costs nothing to keep idle.
  show_client_logos: boolean
  // Quote content defaults (Phase 4) — same fallback philosophy as Phase
  // 3's branding fields: every default below matches today's exact
  // hardcoded content, so a tenant who's never touched these sees an
  // identical PDF. authorized_signatory was deliberately NOT added as a
  // separate field — `proprietor` above already serves that exact role.
  tagline: string
  default_terms: string
  default_warranty: WarrantyRow[]
  default_scope: ScopeLists
  default_payment_schedule: PaymentMilestone[]
}

export const defaultSettings: AppSettings = {
  name: company.name,
  short_name: company.shortName,
  phone: company.phone,
  email: company.email,
  gst: company.gst,
  proprietor: company.proprietor,
  address: company.address,
  website: company.website,
  panel_brand: 'Waaree',
  panel_wp: 580,
  default_rate: 52,
  yield_kwh: 1332,
  gst_rate: 8.9,
  twilio_number: '+19154403891',
  owner_phone: company.phone,
  logo_url: null,
  cover_image_url: null,
  primary_color: '#0F1E3D',
  secondary_color: '#1E88E5',
  accent_color: '#F5A623',
  show_why_solar: true,
  show_partner_logos: true,
  show_client_logos: false,
  tagline: 'Engineering · Procurement · Construction (EPC) – Solar Division',
  default_terms: 'By signing below, both parties agree to the Techno-Commercial Proposal terms. Payments as per milestone schedule. GST as applicable. Proposal valid for 30 days from date above.',
  default_warranty: [
    { item: 'Solar PV Modules', coverage: 'Manufacturing Defect', period: '12 Years' },
    { item: 'Solar PV Modules', coverage: 'Linear Performance (80%)', period: '30 Years' },
    { item: 'Inverter', coverage: 'Standard OEM', period: '5 Yrs (ext. 8)' },
    { item: 'HDG Structure', coverage: 'Corrosion Warranty', period: '15 Years' },
    { item: 'Balance of System', coverage: 'OEM Standard', period: '1 Year' },
    { item: 'Workmanship', coverage: 'Installation Quality', period: '1 Year' },
  ],
  default_scope: {
    included: [
      'Solar modules, inverter, structure', 'DC and AC cables, connectors, trays',
      'Earthing system and lightning arrester', 'Net meter with LT/CT box',
      'DISCOM net metering approval', 'EAR and Marine insurance',
      'Commissioning and monitoring setup', 'Remote monitoring (1 year free)',
    ],
    excluded: [
      'Water supply at site', 'Internet for monitoring', 'Power during installation',
      'Service lift / crane', 'Roof access ladder', 'Removal of existing system',
      'Meter merging / load enhancement', 'Civil / waterproofing work',
    ],
  },
  default_payment_schedule: [
    { label: 'Advance on PO', percent: 30 },
    { label: 'Material Delivery', percent: 40 },
    { label: 'Installation & Commissioning', percent: 20 },
    { label: 'Net Meter & Handover', percent: 10 },
  ],
}

// Was a single row shared by everyone, keyed by the literal string
// 'default' — now one row per tenant, keyed by tenant_id (RLS enforces a
// tenant can only ever see/touch their own row; see
// supabase/migrations/0004_tenant_scope.sql). A brand-new tenant has no
// settings row yet, which is why this reads with maybeSingle() (not
// single()) and falls back to defaultSettings rather than erroring.
export async function getSettings(): Promise<AppSettings> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return defaultSettings

  const { data } = await supabase
    .from('settings')
    .select('*')
    .eq('tenant_id', user.id)
    .maybeSingle()
  if (!data) return defaultSettings
  return { ...defaultSettings, ...data }
}

export async function saveSettings(settings: Partial<AppSettings>) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('settings')
    .upsert(
      { id: user.id, tenant_id: user.id, ...settings, updated_at: new Date().toISOString() },
      { onConflict: 'tenant_id' },
    )
  if (error) throw error
}

// Uploads to the `branding` storage bucket under the current tenant's own
// folder (branding/<tenant_id>/logo|cover.<ext>) — the bucket's storage
// policies (see supabase/migrations/0006_quote_branding.sql) only allow a
// user to write inside a folder matching their own auth.uid(), and allow
// public read (needed so the logo/cover renders in a shared quote/PDF with
// no auth session). Returns the public URL to save on the settings row.
export async function uploadBrandingAsset(
  file: File,
  kind: 'logo' | 'cover',
): Promise<string> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const ext = file.name.split('.').pop() || 'png'
  const path = `${user.id}/${kind}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('branding')
    .upload(path, file, { upsert: true, cacheControl: '3600' })
  if (uploadError) throw uploadError

  const { data } = supabase.storage.from('branding').getPublicUrl(path)
  return data.publicUrl
}