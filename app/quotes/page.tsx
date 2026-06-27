'use client'
import { useRouter } from 'next/navigation'

export default function QuotesPage() {
  const router = useRouter()
  return (
    <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Quotation Generator</h2>
        <p className="text-gray-500 text-sm mb-6">Create professional solar proposals in seconds</p>
        <button
          onClick={() => router.push('/quote')}
          className="px-6 py-3 rounded-xl text-sm font-medium text-white transition-all"
          style={{ background: '#1A4F8A' }}>
          Create Quote
        </button>
      </div>
    </div>
  )
}