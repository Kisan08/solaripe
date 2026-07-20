'use client'
import { useEffect, useState, type ChangeEvent } from 'react'
import { Save, CheckCircle, Upload, Plus, Trash2 } from 'lucide-react'
import { getSettings, saveSettings, uploadBrandingAsset, defaultSettings, type AppSettings } from '@/lib/settings'
import { ClientLogosSection, TestimonialsSection, CertificationsSection, ProjectsSection, PipelineStagesSection } from './MediaSections'

const COLOR_FIELDS: { key: keyof AppSettings; label: string }[] = [
  { key: 'primary_color', label: 'Primary (headers, backgrounds)' },
  { key: 'secondary_color', label: 'Secondary (borders, highlights)' },
  { key: 'accent_color', label: 'Accent (CTAs, callouts)' },
]

const TOGGLE_FIELDS: { key: keyof AppSettings; label: string; help: string }[] = [
  { key: 'show_why_solar', label: '"Why Go Solar Now" strip', help: 'Generic savings/CO2 messaging on the cover page.' },
  { key: 'show_partner_logos', label: 'Panel partner logos', help: 'Waaree / Adani / Premier logos on the cover page.' },
]

const SECTIONS = [
  {
    title: 'Company Info',
    color: 'bg-blue-600',
    fields: [
      { key: 'name', label: 'Company Name', type: 'text', placeholder: 'Omkar Power Solutions' },
      { key: 'short_name', label: 'Short Name', type: 'text', placeholder: 'OPS' },
      { key: 'phone', label: 'Phone', type: 'text', placeholder: '8452035102' },
      { key: 'email', label: 'Email', type: 'email', placeholder: 'email@company.com' },
      { key: 'gst', label: 'GST Number', type: 'text', placeholder: '27XXXXX' },
      { key: 'proprietor', label: 'Proprietor Name', type: 'text', placeholder: 'Omkar Deshmukh' },
      { key: 'address', label: 'Address', type: 'text', placeholder: 'Kalyan East, Maharashtra' },
      { key: 'website', label: 'Website', type: 'text', placeholder: 'www.yoursite.in' },
    ],
  },
  {
    title: 'Quote Defaults',
    color: 'bg-green-600',
    fields: [
      { key: 'panel_brand', label: 'Panel Brand', type: 'text', placeholder: 'Waaree' },
      { key: 'panel_wp', label: 'Panel Wp', type: 'number', placeholder: '580' },
      { key: 'default_rate', label: 'Default Rate (₹/Wp)', type: 'number', placeholder: '52' },
      { key: 'yield_kwh', label: 'Yield (kWh/kWp/yr)', type: 'number', placeholder: '1332' },
      { key: 'gst_rate', label: 'GST Rate (%)', type: 'number', placeholder: '8.9' },
    ],
  },
  {
    title: 'AI Calling',
    color: 'bg-purple-600',
    fields: [
      { key: 'twilio_number', label: 'Twilio Number', type: 'text', placeholder: '+19154403891' },
      { key: 'owner_phone', label: 'Your Phone (alerts)', type: 'text', placeholder: '+918452035102' },
    ],
  },
]

export default function SettingsPage() {
  const [values, setValues] = useState<AppSettings>(defaultSettings)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      const s = await getSettings()
      setValues(s)
      setLoading(false)
    }
    run()
  }, [])

  const paymentTotal = values.default_payment_schedule.reduce((sum, m) => sum + (m.percent || 0), 0)
  const paymentValid = paymentTotal === 100

  const save = async () => {
    if (!paymentValid) {
      alert(`Payment schedule percentages must add up to 100% (currently ${paymentTotal}%). Fix that before saving.`)
      return
    }
    setSaving(true)
    try {
      await saveSettings(values)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      alert('Failed to save. Check Supabase connection.')
    } finally {
      setSaving(false)
    }
  }

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>, kind: 'logo' | 'cover') => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)
    const setUploading = kind === 'logo' ? setUploadingLogo : setUploadingCover
    setUploading(true)
    try {
      const url = await uploadBrandingAsset(file, kind)
      setValues(v => ({ ...v, [kind === 'logo' ? 'logo_url' : 'cover_image_url']: url }))
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : `Failed to upload ${kind}`)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center">
      <p className="text-sm text-gray-400">Loading settings...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#F4F6F9]">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between max-w-3xl mx-auto">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Settings</h1>
            <p className="text-sm text-gray-500 mt-0.5">Changes apply to all proposals automatically</p>
          </div>
          <button onClick={save} disabled={saving || !paymentValid}
            title={!paymentValid ? `Payment schedule must total 100% (currently ${paymentTotal}%)` : undefined}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50 transition-all"
            style={{ background: saved ? '#16a34a' : !paymentValid ? '#9CA3AF' : '#1A4F8A' }}>
            {saved ? <CheckCircle size={15} /> : <Save size={15} />}
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6 space-y-4">
        {SECTIONS.map(({ title, color, fields }) => (
          <div key={title} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
              <span className={`w-1.5 h-4 rounded ${color} inline-block`} />
              <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {fields.map(({ key, label, type, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                  <input
                    type={type}
                    placeholder={placeholder}
                    value={String(values[key as keyof AppSettings] ?? '')}
                    onChange={e => setValues(v => ({
                      ...v,
                      [key]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value
                    }))}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 bg-white text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Quote Branding */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <span className="w-1.5 h-4 rounded bg-orange-500 inline-block" />
            <h2 className="text-sm font-semibold text-gray-700">Quote Branding</h2>
          </div>
          <div className="p-5 space-y-5">
            {uploadError && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{uploadError}</div>
            )}

            {/* Logo + cover upload */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Logo</label>
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                    {values.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={values.logo_url} alt="Logo" className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-[10px] text-gray-400">No logo</span>
                    )}
                  </div>
                  <label className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50 transition-all">
                    <Upload size={13} />
                    {uploadingLogo ? 'Uploading…' : 'Upload'}
                    <input type="file" accept="image/*" className="hidden" disabled={uploadingLogo}
                      onChange={e => handleUpload(e, 'logo')} />
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Cover Image</label>
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                    {values.cover_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={values.cover_image_url} alt="Cover" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-gray-400 text-center px-1">Default image</span>
                    )}
                  </div>
                  <label className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50 transition-all">
                    <Upload size={13} />
                    {uploadingCover ? 'Uploading…' : 'Upload'}
                    <input type="file" accept="image/*" className="hidden" disabled={uploadingCover}
                      onChange={e => handleUpload(e, 'cover')} />
                  </label>
                </div>
              </div>
            </div>

            {/* Colors */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Quote Colors</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {COLOR_FIELDS.map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-3">
                    <input
                      type="color"
                      value={String(values[key] ?? '#000000')}
                      onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))}
                      className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer shrink-0"
                    />
                    <span className="text-xs text-gray-600">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Section toggles */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Optional Sections</label>
              <div className="space-y-2">
                {TOGGLE_FIELDS.map(({ key, label, help }) => (
                  <label key={key} className="flex items-start gap-3 px-3 py-2.5 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50 transition-all">
                    <input
                      type="checkbox"
                      checked={Boolean(values[key])}
                      onChange={e => setValues(v => ({ ...v, [key]: e.target.checked }))}
                      className="mt-0.5 accent-blue-600"
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-800">{label}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{help}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Quote Content */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <span className="w-1.5 h-4 rounded bg-indigo-600 inline-block" />
            <h2 className="text-sm font-semibold text-gray-700">Quote Content</h2>
          </div>
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Tagline</label>
                <input
                  type="text"
                  value={values.tagline}
                  onChange={e => setValues(v => ({ ...v, tagline: e.target.value }))}
                  placeholder="Engineering · Procurement · Construction (EPC) – Solar Division"
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 bg-white text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Terms &amp; Acceptance (Page 5)</label>
              <textarea
                value={values.default_terms}
                onChange={e => setValues(v => ({ ...v, default_terms: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 bg-white text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all resize-none"
              />
            </div>

            {/* Warranty rows */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-medium text-gray-500">Warranties (Page 4)</label>
                <button
                  onClick={() => setValues(v => ({ ...v, default_warranty: [...v.default_warranty, { item: '', coverage: '', period: '' }] }))}
                  className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
                  <Plus size={13} /> Add row
                </button>
              </div>
              <div className="space-y-2">
                {values.default_warranty.map((row, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                    <input type="text" placeholder="Item" value={row.item}
                      onChange={e => setValues(v => ({ ...v, default_warranty: v.default_warranty.map((r, j) => j === i ? { ...r, item: e.target.value } : r) }))}
                      className="px-2.5 py-2 text-xs rounded-lg border border-gray-200 outline-none focus:border-blue-400" />
                    <input type="text" placeholder="Coverage" value={row.coverage}
                      onChange={e => setValues(v => ({ ...v, default_warranty: v.default_warranty.map((r, j) => j === i ? { ...r, coverage: e.target.value } : r) }))}
                      className="px-2.5 py-2 text-xs rounded-lg border border-gray-200 outline-none focus:border-blue-400" />
                    <input type="text" placeholder="Period" value={row.period}
                      onChange={e => setValues(v => ({ ...v, default_warranty: v.default_warranty.map((r, j) => j === i ? { ...r, period: e.target.value } : r) }))}
                      className="px-2.5 py-2 text-xs rounded-lg border border-gray-200 outline-none focus:border-blue-400" />
                    <button onClick={() => setValues(v => ({ ...v, default_warranty: v.default_warranty.filter((_, j) => j !== i) }))}
                      className="p-2 text-gray-400 hover:text-red-600">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Scope of work */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(['included', 'excluded'] as const).map(kind => (
                <div key={kind}>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-medium text-gray-500">
                      {kind === 'included' ? 'Included in Scope' : 'Client Scope (Not Included)'}
                    </label>
                    <button
                      onClick={() => setValues(v => ({ ...v, default_scope: { ...v.default_scope, [kind]: [...v.default_scope[kind], ''] } }))}
                      className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
                      <Plus size={13} /> Add
                    </button>
                  </div>
                  <div className="space-y-2">
                    {values.default_scope[kind].map((item, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input type="text" value={item}
                          onChange={e => setValues(v => ({ ...v, default_scope: { ...v.default_scope, [kind]: v.default_scope[kind].map((x, j) => j === i ? e.target.value : x) } }))}
                          className="flex-1 px-2.5 py-2 text-xs rounded-lg border border-gray-200 outline-none focus:border-blue-400" />
                        <button onClick={() => setValues(v => ({ ...v, default_scope: { ...v.default_scope, [kind]: v.default_scope[kind].filter((_, j) => j !== i) } }))}
                          className="p-2 text-gray-400 hover:text-red-600">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Payment schedule */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-medium text-gray-500">Payment Schedule (Page 2) — exactly 4 milestones</label>
                <span className={`text-xs font-semibold ${paymentValid ? 'text-green-600' : 'text-red-600'}`}>
                  Total: {paymentTotal}%
                </span>
              </div>
              {!paymentValid && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-2">
                  Percentages must add up to 100% — saving is disabled until this is fixed.
                </div>
              )}
              <div className="space-y-2">
                {values.default_payment_schedule.map((m, i) => (
                  <div key={i} className="grid grid-cols-[1fr_100px] gap-2 items-center">
                    <input type="text" placeholder="Milestone label" value={m.label}
                      onChange={e => setValues(v => ({ ...v, default_payment_schedule: v.default_payment_schedule.map((x, j) => j === i ? { ...x, label: e.target.value } : x) }))}
                      className="px-2.5 py-2 text-xs rounded-lg border border-gray-200 outline-none focus:border-blue-400" />
                    <div className="relative">
                      <input type="number" value={m.percent} min={0} max={100}
                        onChange={e => setValues(v => ({ ...v, default_payment_schedule: v.default_payment_schedule.map((x, j) => j === i ? { ...x, percent: parseFloat(e.target.value) || 0 } : x) }))}
                        className="w-full px-2.5 py-2 text-xs rounded-lg border border-gray-200 outline-none focus:border-blue-400" />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Media Library (Phase 6) */}
        <ClientLogosSection />
        <TestimonialsSection />
        <CertificationsSection />
        <ProjectsSection />

        {/* Pipeline Tracker (Phase 7) */}
        <PipelineStagesSection />

        {/* Info banner */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-3">
          <div className="text-blue-500 text-lg">💡</div>
          <div>
            <p className="text-sm font-medium text-blue-800">Settings are live</p>
            <p className="text-xs text-blue-600 mt-0.5">Company name, phone, email and quote defaults update instantly across all new proposals when you save.</p>
          </div>
        </div>
      </div>
    </div>
  )
}