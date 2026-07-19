'use client'
import { useEffect, useState, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Upload, CheckCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { isPlatformAdmin } from '@/lib/admin'
import { uploadProductLogo, type Product, type ProductCategory } from '@/lib/products'

const CATEGORIES: ProductCategory[] = ['panel', 'inverter', 'cable', 'structure', 'battery']

// Which two free-text "spec" fields make sense to expose per category —
// keeps the admin form to plain text inputs (no per-category schema,
// no rich editor) while still landing in the same `specs` jsonb keys the
// quote page's spec-string composition reads from (see app/quote/page.tsx
// panelSpecLine/inverterSpecLine).
const SPEC_FIELDS: Record<ProductCategory, { key: string; label: string }[]> = {
  panel: [
    { key: 'certification', label: 'Certification (e.g. BIS Compliant)' },
    { key: 'degradation', label: 'Degradation (e.g. 0.45% degradation)' },
  ],
  inverter: [
    { key: 'connectivity', label: 'Connectivity (e.g. Grid-tied)' },
    { key: 'monitoring', label: 'Monitoring (e.g. Remote monitoring ready)' },
  ],
  cable: [
    { key: 'note1', label: 'Spec Note 1' },
    { key: 'note2', label: 'Spec Note 2' },
  ],
  structure: [
    { key: 'note1', label: 'Spec Note 1' },
    { key: 'note2', label: 'Spec Note 2' },
  ],
  battery: [
    { key: 'note1', label: 'Spec Note 1' },
    { key: 'note2', label: 'Spec Note 2' },
  ],
}

const emptyForm = {
  id: '' as string | null,
  category: 'panel' as ProductCategory,
  brand: '',
  model: '',
  wattage_or_spec: '',
  specs: {} as Record<string, string>,
  warranty_years: '' as string | number,
  logo_url: null as string | null,
  active: true,
}

export default function AdminProductsPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<ProductCategory>('panel')
  const [form, setForm] = useState(emptyForm)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Client-side check too — belt and suspenders on top of proxy.ts, which
  // already blocks a non-admin from ever reaching this route. If proxy.ts
  // were ever bypassed or misconfigured, this still redirects instead of
  // silently rendering admin-only content.
  useEffect(() => {
    const run = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!isPlatformAdmin(user?.id)) {
        router.replace('/')
        return
      }
      setChecking(false)
      loadProducts()
    }
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadProducts = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/products')
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to load products')
      setProducts(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products')
    } finally {
      setLoading(false)
    }
  }

  const openAdd = () => {
    setForm({ ...emptyForm, category: filter })
    setShowForm(true)
  }

  const openEdit = (p: Product) => {
    setForm({
      id: p.id,
      category: p.category,
      brand: p.brand,
      model: p.model,
      wattage_or_spec: p.wattage_or_spec ?? '',
      specs: p.specs ?? {},
      warranty_years: p.warranty_years ?? '',
      logo_url: p.logo_url,
      active: p.active,
    })
    setShowForm(true)
  }

  const handleLogoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingLogo(true)
    setError(null)
    try {
      const url = await uploadProductLogo(file, form.id || crypto.randomUUID())
      setForm(f => ({ ...f, logo_url: url }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload logo')
    } finally {
      setUploadingLogo(false)
      e.target.value = ''
    }
  }

  const save = async () => {
    if (!form.brand.trim() || !form.model.trim()) {
      setError('Brand and model are required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        category: form.category,
        brand: form.brand.trim(),
        model: form.model.trim(),
        wattage_or_spec: form.wattage_or_spec.trim() || null,
        specs: form.specs,
        warranty_years: form.warranty_years === '' ? null : Number(form.warranty_years),
        logo_url: form.logo_url,
        active: form.active,
      }
      const res = form.id
        ? await fetch(`/api/admin/products/${form.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
        : await fetch('/api/admin/products', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Save failed')
      setShowForm(false)
      await loadProducts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (p: Product) => {
    try {
      const res = await fetch(`/api/admin/products/${p.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !p.active }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Update failed')
      await loadProducts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center">
        <p className="text-sm text-gray-400">Checking access…</p>
      </div>
    )
  }

  const filtered = products.filter(p => p.category === filter)

  return (
    <div className="min-h-screen bg-[#F4F6F9]">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Product Library</h1>
            <p className="text-sm text-gray-500 mt-0.5">Platform-wide catalog — every tenant reads this, only you can edit it</p>
          </div>
          <button onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-all"
            style={{ background: '#1A4F8A' }}>
            <Plus size={15} /> Add Product
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-4">
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</div>
        )}

        {/* Category tabs */}
        <div className="flex gap-2">
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setFilter(cat)}
              className={`px-3.5 py-2 text-xs font-medium rounded-xl border capitalize transition-all ${
                filter === cat ? 'bg-[#1A4F8A] text-white border-[#1A4F8A]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}>
              {cat}
            </button>
          ))}
        </div>

        {/* Add/Edit form */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">{form.id ? 'Edit Product' : 'Add Product'}</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
                <select value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value as ProductCategory, specs: {} }))}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 bg-white text-gray-900 outline-none focus:border-blue-400 capitalize">
                  {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Warranty (years)</label>
                <input type="number" value={form.warranty_years}
                  onChange={e => setForm(f => ({ ...f, warranty_years: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Brand</label>
                <input type="text" value={form.brand} placeholder="Waaree / Premier"
                  onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Model</label>
                <input type="text" value={form.model} placeholder="TOPCon Bifacial"
                  onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Wattage / Spec</label>
                <input type="text" value={form.wattage_or_spec} placeholder="580 Wp"
                  onChange={e => setForm(f => ({ ...f, wattage_or_spec: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 outline-none focus:border-blue-400" />
              </div>
              {SPEC_FIELDS[form.category].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                  <input type="text" value={form.specs[key] ?? ''}
                    onChange={e => setForm(f => ({ ...f, specs: { ...f.specs, [key]: e.target.value } }))}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 outline-none focus:border-blue-400" />
                </div>
              ))}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Logo</label>
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                  {form.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.logo_url} alt="Logo" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-[10px] text-gray-400">No logo</span>
                  )}
                </div>
                <label className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50">
                  <Upload size={13} />
                  {uploadingLogo ? 'Uploading…' : 'Upload'}
                  <input type="file" accept="image/*" className="hidden" disabled={uploadingLogo} onChange={handleLogoUpload} />
                </label>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer w-fit">
              <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                className="accent-blue-600" />
              <span className="text-sm text-gray-700">Active (visible to tenants)</span>
            </label>

            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)} disabled={saving}
                className="px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={save} disabled={saving}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl text-white disabled:opacity-50"
                style={{ background: '#1A4F8A' }}>
                {saving ? 'Saving…' : (<><CheckCircle size={15} /> Save Product</>)}
              </button>
            </div>
          </div>
        )}

        {/* Product list */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">No {filter} products yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                  <th className="px-5 py-3 font-medium">Brand / Model</th>
                  <th className="px-5 py-3 font-medium">Spec</th>
                  <th className="px-5 py-3 font-medium">Warranty</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-5 py-3 font-medium text-gray-800">{p.brand} {p.model}</td>
                    <td className="px-5 py-3 text-gray-600">{p.wattage_or_spec || '—'}</td>
                    <td className="px-5 py-3 text-gray-600">{p.warranty_years ? `${p.warranty_years} yrs` : '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${p.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {p.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right space-x-3">
                      <button onClick={() => openEdit(p)} className="text-xs font-medium text-blue-600 hover:text-blue-700">Edit</button>
                      <button onClick={() => toggleActive(p)} className="text-xs font-medium text-gray-500 hover:text-gray-700">
                        {p.active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
