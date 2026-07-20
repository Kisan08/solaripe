'use client'
import { useEffect, useState, type ChangeEvent } from 'react'
import { ChevronUp, ChevronDown, Pencil, Upload, Plus, X } from 'lucide-react'
import {
  fetchAllClientLogos, fetchAllTestimonials, fetchAllCertifications, fetchAllProjects,
  upsertMediaRow, toggleMediaActive, swapDisplayOrder, uploadMediaAsset,
  type ClientLogo, type Testimonial, type Certification, type TenantProject,
} from '@/lib/media'
import { fetchAllPipelineStages, type PipelineStage } from '@/lib/pipeline'

/* ─── Shared bits ─── */

function SectionShell({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <span className={`w-1.5 h-4 rounded ${color} inline-block`} />
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      </div>
      <div className="p-5 space-y-3">{children}</div>
    </div>
  )
}

function ReorderButtons({ onUp, onDown, upDisabled, downDisabled }: { onUp: () => void; onDown: () => void; upDisabled: boolean; downDisabled: boolean }) {
  return (
    <div className="flex flex-col shrink-0">
      <button onClick={onUp} disabled={upDisabled} className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-25 disabled:hover:text-gray-400">
        <ChevronUp size={14} />
      </button>
      <button onClick={onDown} disabled={downDisabled} className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-25 disabled:hover:text-gray-400">
        <ChevronDown size={14} />
      </button>
    </div>
  )
}

function ActiveToggle({ active, onChange }: { active: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer shrink-0">
      <input type="checkbox" checked={active} onChange={e => onChange(e.target.checked)} className="accent-blue-600" />
      Active
    </label>
  )
}

function ImageUploadField({ label, url, uploading, onUpload }: { label: string; url: string | null; uploading: boolean; onUpload: (e: ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={label} className="w-full h-full object-contain" />
          ) : (
            <span className="text-[10px] text-gray-400">None</span>
          )}
        </div>
        <label className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50 transition-all">
          <Upload size={13} />
          {uploading ? 'Uploading…' : 'Upload'}
          <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={onUpload} />
        </label>
      </div>
    </div>
  )
}

const inputCls = "w-full px-2.5 py-2 text-xs rounded-lg border border-gray-200 outline-none focus:border-blue-400"

/* ─── Client Logos ─── */

export function ClientLogosSection() {
  const [items, setItems] = useState<ClientLogo[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Partial<ClientLogo>>({ name: '', logo_url: '' })
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = async () => setItems(await fetchAllClientLogos())
  useEffect(() => { load().finally(() => setLoading(false)) }, [])

  const openAdd = () => { setForm({ name: '', logo_url: '' }); setShowForm(true) }
  const openEdit = (item: ClientLogo) => { setForm(item); setShowForm(true) }

  const save = async () => {
    if (!form.name || !form.logo_url) { alert('Name and logo image are required.'); return }
    setSaving(true)
    try {
      await upsertMediaRow('tenant_client_logos', form)
      setShowForm(false)
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadMediaAsset(file, 'logo', form.id || crypto.randomUUID())
      setForm(f => ({ ...f, logo_url: url }))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const move = async (i: number, dir: -1 | 1) => {
    const other = items[i + dir]
    if (!other) return
    await swapDisplayOrder('tenant_client_logos', items[i], other)
    await load()
  }

  return (
    <SectionShell title="Client Logos" color="bg-cyan-600">
      <p className="text-xs text-gray-500">Shown as &quot;Our Clients&quot; on the final page of every quote — hidden entirely until at least one logo is added.</p>
      {loading ? <p className="text-xs text-gray-400">Loading…</p> : (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={item.id} className="flex items-center gap-3 px-3 py-2 rounded-xl border border-gray-200">
              <ReorderButtons onUp={() => move(i, -1)} onDown={() => move(i, 1)} upDisabled={i === 0} downDisabled={i === items.length - 1} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.logo_url} alt={item.name} className="w-10 h-10 object-contain rounded border border-gray-100 shrink-0" />
              <div className="flex-1 text-sm text-gray-800">{item.name}</div>
              <ActiveToggle active={item.active} onChange={v => toggleMediaActive('tenant_client_logos', item.id, v).then(load)} />
              <button onClick={() => openEdit(item)} className="p-1.5 text-gray-400 hover:text-blue-600"><Pencil size={14} /></button>
            </div>
          ))}
          {items.length === 0 && <p className="text-xs text-gray-400">No client logos yet.</p>}
        </div>
      )}
      {!showForm ? (
        <button onClick={openAdd} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"><Plus size={13} /> Add client logo</button>
      ) : (
        <div className="border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-600">{form.id ? 'Edit' : 'Add'} client logo</span>
            <button onClick={() => setShowForm(false)}><X size={14} className="text-gray-400" /></button>
          </div>
          <input className={inputCls} placeholder="Client name" value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <ImageUploadField label="Logo image" url={form.logo_url || null} uploading={uploading} onUpload={handleUpload} />
          <button onClick={save} disabled={saving} className="px-3 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </SectionShell>
  )
}

/* ─── Testimonials ─── */

export function TestimonialsSection() {
  const [items, setItems] = useState<Testimonial[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Partial<Testimonial>>({})
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = async () => setItems(await fetchAllTestimonials())
  useEffect(() => { load().finally(() => setLoading(false)) }, [])

  const openAdd = () => { setForm({ customer_name: '', testimonial_text: '' }); setShowForm(true) }
  const openEdit = (item: Testimonial) => { setForm(item); setShowForm(true) }

  const save = async () => {
    if (!form.customer_name || !form.testimonial_text) { alert('Customer name and testimonial text are required.'); return }
    setSaving(true)
    try {
      await upsertMediaRow('tenant_testimonials', form)
      setShowForm(false)
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadMediaAsset(file, 'testimonial', form.id || crypto.randomUUID())
      setForm(f => ({ ...f, photo_url: url }))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const move = async (i: number, dir: -1 | 1) => {
    const other = items[i + dir]
    if (!other) return
    await swapDisplayOrder('tenant_testimonials', items[i], other)
    await load()
  }

  return (
    <SectionShell title="Testimonials" color="bg-pink-600">
      <p className="text-xs text-gray-500">Shown on Page 5 of the quote, before the signature blocks — hidden entirely until at least one testimonial is added.</p>
      {loading ? <p className="text-xs text-gray-400">Loading…</p> : (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={item.id} className="flex items-start gap-3 px-3 py-2 rounded-xl border border-gray-200">
              <ReorderButtons onUp={() => move(i, -1)} onDown={() => move(i, 1)} upDisabled={i === 0} downDisabled={i === items.length - 1} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800">{item.customer_name}{item.customer_company ? ` · ${item.customer_company}` : ''}</div>
                <div className="text-xs text-gray-500 truncate">{item.testimonial_text}</div>
              </div>
              <ActiveToggle active={item.active} onChange={v => toggleMediaActive('tenant_testimonials', item.id, v).then(load)} />
              <button onClick={() => openEdit(item)} className="p-1.5 text-gray-400 hover:text-blue-600 shrink-0"><Pencil size={14} /></button>
            </div>
          ))}
          {items.length === 0 && <p className="text-xs text-gray-400">No testimonials yet.</p>}
        </div>
      )}
      {!showForm ? (
        <button onClick={openAdd} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"><Plus size={13} /> Add testimonial</button>
      ) : (
        <div className="border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-600">{form.id ? 'Edit' : 'Add'} testimonial</span>
            <button onClick={() => setShowForm(false)}><X size={14} className="text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input className={inputCls} placeholder="Customer name" value={form.customer_name || ''} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} />
            <input className={inputCls} placeholder="Company (optional)" value={form.customer_company || ''} onChange={e => setForm(f => ({ ...f, customer_company: e.target.value }))} />
            <input className={inputCls} placeholder="Designation (optional)" value={form.designation || ''} onChange={e => setForm(f => ({ ...f, designation: e.target.value }))} />
            <input className={inputCls} type="number" min={1} max={5} placeholder="Rating (1-5, optional)" value={form.rating ?? ''} onChange={e => setForm(f => ({ ...f, rating: e.target.value ? parseFloat(e.target.value) : null }))} />
          </div>
          <textarea className={inputCls} rows={3} placeholder="Testimonial text" value={form.testimonial_text || ''} onChange={e => setForm(f => ({ ...f, testimonial_text: e.target.value }))} />
          <ImageUploadField label="Customer photo (optional)" url={form.photo_url || null} uploading={uploading} onUpload={handleUpload} />
          <button onClick={save} disabled={saving} className="px-3 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </SectionShell>
  )
}

/* ─── Certifications ─── */

export function CertificationsSection() {
  const [items, setItems] = useState<Certification[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Partial<Certification>>({})
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = async () => setItems(await fetchAllCertifications())
  useEffect(() => { load().finally(() => setLoading(false)) }, [])

  const openAdd = () => { setForm({ name: '' }); setShowForm(true) }
  const openEdit = (item: Certification) => { setForm(item); setShowForm(true) }

  const save = async () => {
    if (!form.name) { alert('Certification name is required.'); return }
    setSaving(true)
    try {
      await upsertMediaRow('tenant_certifications', form)
      setShowForm(false)
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadMediaAsset(file, 'certificate', form.id || crypto.randomUUID())
      setForm(f => ({ ...f, certificate_image_url: url }))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const move = async (i: number, dir: -1 | 1) => {
    const other = items[i + dir]
    if (!other) return
    await swapDisplayOrder('tenant_certifications', items[i], other)
    await load()
  }

  return (
    <SectionShell title="Certifications" color="bg-emerald-600">
      <p className="text-xs text-gray-500">Shown on Page 4 near Warranties, as a compact badge row — hidden entirely until at least one certification is added.</p>
      {loading ? <p className="text-xs text-gray-400">Loading…</p> : (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={item.id} className="flex items-center gap-3 px-3 py-2 rounded-xl border border-gray-200">
              <ReorderButtons onUp={() => move(i, -1)} onDown={() => move(i, 1)} upDisabled={i === 0} downDisabled={i === items.length - 1} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800">{item.name}</div>
                {item.issuing_authority && <div className="text-xs text-gray-500">{item.issuing_authority}</div>}
              </div>
              <ActiveToggle active={item.active} onChange={v => toggleMediaActive('tenant_certifications', item.id, v).then(load)} />
              <button onClick={() => openEdit(item)} className="p-1.5 text-gray-400 hover:text-blue-600 shrink-0"><Pencil size={14} /></button>
            </div>
          ))}
          {items.length === 0 && <p className="text-xs text-gray-400">No certifications yet.</p>}
        </div>
      )}
      {!showForm ? (
        <button onClick={openAdd} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"><Plus size={13} /> Add certification</button>
      ) : (
        <div className="border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-600">{form.id ? 'Edit' : 'Add'} certification</span>
            <button onClick={() => setShowForm(false)}><X size={14} className="text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input className={inputCls} placeholder="Certification name" value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <input className={inputCls} placeholder="Issuing authority (optional)" value={form.issuing_authority || ''} onChange={e => setForm(f => ({ ...f, issuing_authority: e.target.value }))} />
            <input className={inputCls} placeholder="Certificate number (optional)" value={form.certificate_number || ''} onChange={e => setForm(f => ({ ...f, certificate_number: e.target.value }))} />
            <input className={inputCls} type="date" placeholder="Issue date" value={form.issue_date || ''} onChange={e => setForm(f => ({ ...f, issue_date: e.target.value }))} />
            <input className={inputCls} type="date" placeholder="Expiry date" value={form.expiry_date || ''} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} />
          </div>
          <textarea className={inputCls} rows={2} placeholder="Description (optional)" value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <ImageUploadField label="Certificate image (optional)" url={form.certificate_image_url || null} uploading={uploading} onUpload={handleUpload} />
          <button onClick={save} disabled={saving} className="px-3 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </SectionShell>
  )
}

/* ─── Projects ─── */

export function ProjectsSection() {
  const [items, setItems] = useState<TenantProject[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Partial<TenantProject>>({})
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = async () => setItems(await fetchAllProjects())
  useEffect(() => { load().finally(() => setLoading(false)) }, [])

  const openAdd = () => { setForm({ title: '', featured: false }); setShowForm(true) }
  const openEdit = (item: TenantProject) => { setForm(item); setShowForm(true) }

  const save = async () => {
    if (!form.title) { alert('Project title is required.'); return }
    setSaving(true)
    try {
      await upsertMediaRow('tenant_projects', form)
      setShowForm(false)
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadMediaAsset(file, 'project', form.id || crypto.randomUUID())
      setForm(f => ({ ...f, main_image_url: url }))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const move = async (i: number, dir: -1 | 1) => {
    const other = items[i + dir]
    if (!other) return
    await swapDisplayOrder('tenant_projects', items[i], other)
    await load()
  }

  return (
    <SectionShell title="Completed Projects" color="bg-amber-600">
      <p className="text-xs text-gray-500">Only projects marked &quot;Featured&quot; appear on their own dedicated page in the quote (between Financial Analysis and Warranties) — the page is entirely absent until at least one project is featured.</p>
      {loading ? <p className="text-xs text-gray-400">Loading…</p> : (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={item.id} className="flex items-center gap-3 px-3 py-2 rounded-xl border border-gray-200">
              <ReorderButtons onUp={() => move(i, -1)} onDown={() => move(i, 1)} upDisabled={i === 0} downDisabled={i === items.length - 1} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
                  {item.title}
                  {item.featured && <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Featured</span>}
                </div>
                <div className="text-xs text-gray-500">{[item.site_name, item.location].filter(Boolean).join(' · ')}</div>
              </div>
              <ActiveToggle active={item.active} onChange={v => toggleMediaActive('tenant_projects', item.id, v).then(load)} />
              <button onClick={() => openEdit(item)} className="p-1.5 text-gray-400 hover:text-blue-600 shrink-0"><Pencil size={14} /></button>
            </div>
          ))}
          {items.length === 0 && <p className="text-xs text-gray-400">No projects yet.</p>}
        </div>
      )}
      {!showForm ? (
        <button onClick={openAdd} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"><Plus size={13} /> Add project</button>
      ) : (
        <div className="border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-600">{form.id ? 'Edit' : 'Add'} project</span>
            <button onClick={() => setShowForm(false)}><X size={14} className="text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input className={inputCls} placeholder="Project title" value={form.title || ''} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            <input className={inputCls} placeholder="Site name (optional)" value={form.site_name || ''} onChange={e => setForm(f => ({ ...f, site_name: e.target.value }))} />
            <input className={inputCls} placeholder="Location (optional)" value={form.location || ''} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
            <input className={inputCls} type="number" placeholder="System capacity (kWp)" value={form.system_capacity_kwp ?? ''} onChange={e => setForm(f => ({ ...f, system_capacity_kwp: e.target.value ? parseFloat(e.target.value) : null }))} />
            <input className={inputCls} type="date" placeholder="Completion date" value={form.completion_date || ''} onChange={e => setForm(f => ({ ...f, completion_date: e.target.value }))} />
          </div>
          <textarea className={inputCls} rows={2} placeholder="Description (optional)" value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <ImageUploadField label="Main image (optional)" url={form.main_image_url || null} uploading={uploading} onUpload={handleUpload} />
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={Boolean(form.featured)} onChange={e => setForm(f => ({ ...f, featured: e.target.checked }))} className="accent-blue-600" />
            Featured — include on the quote PDF&apos;s Completed Projects page
          </label>
          <button onClick={save} disabled={saving} className="px-3 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </SectionShell>
  )
}

/* ─── Pipeline Stages ─── */

export function PipelineStagesSection() {
  const [items, setItems] = useState<PipelineStage[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Partial<PipelineStage>>({})
  const [saving, setSaving] = useState(false)

  const load = async () => setItems(await fetchAllPipelineStages())
  useEffect(() => { load().finally(() => setLoading(false)) }, [])

  const openAdd = () => { setForm({ name: '' }); setShowForm(true) }
  const openEdit = (item: PipelineStage) => { setForm(item); setShowForm(true) }

  const save = async () => {
    if (!form.name) { alert('Stage name is required.'); return }
    setSaving(true)
    try {
      await upsertMediaRow('tenant_pipeline_stages', form)
      setShowForm(false)
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const move = async (i: number, dir: -1 | 1) => {
    const other = items[i + dir]
    if (!other) return
    await swapDisplayOrder('tenant_pipeline_stages', items[i], other)
    await load()
  }

  return (
    <SectionShell title="Pipeline Stages" color="bg-sky-600">
      <p className="text-xs text-gray-500">
        Tracks each project&apos;s subsidy / net-metering approval progress — this is a manual tracker (you update it yourself after checking the actual government portal, nothing here syncs live). &quot;Expected days&quot; drives the staleness flag on a project&apos;s card; leave it blank for milestones that shouldn&apos;t be flagged as stuck (e.g. one the installer controls).
      </p>
      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
        The stages below are a reasonable starting point, not verified against any current, authoritative PM Surya Ghar or DISCOM source — rename, reorder, add, or remove them to match what you actually see for your state/DISCOM.
      </p>
      {loading ? <p className="text-xs text-gray-400">Loading…</p> : (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={item.id} className="flex items-center gap-3 px-3 py-2 rounded-xl border border-gray-200">
              <ReorderButtons onUp={() => move(i, -1)} onDown={() => move(i, 1)} upDisabled={i === 0} downDisabled={i === items.length - 1} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800">{item.name}</div>
                <div className="text-xs text-gray-500">
                  {item.expected_days != null ? `Expected: ${item.expected_days} days` : 'No staleness alert'}
                </div>
              </div>
              <ActiveToggle active={item.active} onChange={v => toggleMediaActive('tenant_pipeline_stages', item.id, v).then(load)} />
              <button onClick={() => openEdit(item)} className="p-1.5 text-gray-400 hover:text-blue-600 shrink-0"><Pencil size={14} /></button>
            </div>
          ))}
          {items.length === 0 && <p className="text-xs text-gray-400">No stages yet.</p>}
        </div>
      )}
      {!showForm ? (
        <button onClick={openAdd} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"><Plus size={13} /> Add stage</button>
      ) : (
        <div className="border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-600">{form.id ? 'Edit' : 'Add'} stage</span>
            <button onClick={() => setShowForm(false)}><X size={14} className="text-gray-400" /></button>
          </div>
          <input className={inputCls} placeholder="Stage name" value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <input
            className={inputCls}
            type="number"
            min={0}
            placeholder="Expected days (blank = no staleness alert)"
            value={form.expected_days ?? ''}
            onChange={e => setForm(f => ({ ...f, expected_days: e.target.value ? parseInt(e.target.value, 10) : null }))}
          />
          <button onClick={save} disabled={saving} className="px-3 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </SectionShell>
  )
}
