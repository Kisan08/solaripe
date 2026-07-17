import { createClient } from '@/lib/supabase/client'
import { company } from '@/lib/company.config'

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
}

export async function getSettings(): Promise<AppSettings> {
  const supabase = createClient()
  const { data } = await supabase
    .from('settings')
    .select('*')
    .eq('id', 'default')
    .single()
  if (!data) return defaultSettings
  return { ...defaultSettings, ...data }
}

export async function saveSettings(settings: Partial<AppSettings>) {
  const supabase = createClient()
  const { error } = await supabase
    .from('settings')
    .upsert({ id: 'default', ...settings, updated_at: new Date().toISOString() })
  if (error) throw error
}