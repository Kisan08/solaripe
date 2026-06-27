'use client'
import { useEffect, useState } from 'react'
import { Save, CheckCircle } from 'lucide-react'
import { getSettings, saveSettings, defaultSettings, type AppSettings } from '@/lib/settings'

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

  useEffect(() => {
    const run = async () => {
      const s = await getSettings()
      setValues(s)
      setLoading(false)
    }
    run()
  }, [])

  const save = async () => {
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
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50 transition-all"
            style={{ background: saved ? '#16a34a' : '#1A4F8A' }}>
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