import { createClient } from '@/lib/supabase/client'

export type ProductCategory = 'panel' | 'inverter' | 'cable' | 'structure' | 'battery'

export interface Product {
  id: string
  category: ProductCategory
  brand: string
  model: string
  wattage_or_spec: string | null
  specs: Record<string, string>
  warranty_years: number | null
  logo_url: string | null
  active: boolean
  display_order: number
}

// Reuses the exact same `branding` storage bucket/policies from Phase 3
// (public read, write restricted to the uploader's own auth.uid() folder)
// rather than creating a new bucket — the admin's own uid is a valid
// folder path under those policies just like any tenant's, so
// branding/<admin_uid>/product-<id>.<ext> satisfies them with zero schema
// changes. Only reachable from the admin UI, which is already gated by
// proxy.ts + the /api/admin/* routes' own check.
export async function uploadProductLogo(file: File, productId: string): Promise<string> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const ext = file.name.split('.').pop() || 'png'
  const path = `${user.id}/product-${productId}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('branding')
    .upload(path, file, { upsert: true, cacheControl: '3600' })
  if (uploadError) throw uploadError

  const { data } = supabase.storage.from('branding').getPublicUrl(path)
  return data.publicUrl
}

// Tenant-facing read — RLS on product_library already filters to
// active=true for any non-admin session, so this is a plain filtered
// select, same pattern as lib/data.ts's useLeads()/useProjects(). No admin
// check needed here; every authenticated tenant can read active products.
export async function fetchActiveProducts(category: ProductCategory): Promise<Product[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('product_library')
    .select('*')
    .eq('category', category)
    .eq('active', true)
    .order('display_order', { ascending: true })

  if (error) {
    console.error(`Failed to load ${category} products:`, error.message)
    return []
  }
  return (data ?? []) as Product[]
}
