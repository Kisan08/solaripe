"use client"

import { useState, type FormEvent } from "react"
import { X } from "lucide-react"
import { PhoneInput } from "@/components/ui/phone-input"

export function DemoRequestModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [city, setCity] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/demo-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, companyName, phone, email, city }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.")
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#0F172A]">Request a Demo</h2>
            <p className="mt-1 text-sm text-gray-500">
              See Amsu running on your own pipeline in 30 minutes.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="size-5" />
          </button>
        </div>

        {done ? (
          <div className="rounded-xl bg-[#EEF6F0] px-4 py-6 text-center">
            <p className="text-sm font-semibold text-[#065F46]">Request received</p>
            <p className="mt-1 text-sm text-[#065F46]/80">
              Our team will reach out shortly to schedule your demo.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Your name</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Rakesh Sharma"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Company name</label>
              <input
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="SuryaKiran Renewables"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Phone</label>
              <PhoneInput
                value={phone}
                onChange={setPhone}
                placeholder="98765 43210"
                chipClassName="border-gray-200 bg-gray-50 text-gray-500"
                inputClassName="border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Email</label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">City / region</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Pune, Maharashtra"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
              />
            </div>

            {error && (
              <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full rounded-xl bg-[#1A4F8A] py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            >
              {submitting ? "Sending…" : "Request a Demo"}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
