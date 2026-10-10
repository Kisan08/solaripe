'use client'
import { useState } from 'react'
import { OTHER_BRAND_LABEL, MAX_BRAND_CHARS } from '@/lib/brands'

const OTHER = '__other__'

// A brand dropdown with "Other (type your own)" at the end, which shows a text
// box. `value` is always the final brand name as plain text ('' = none), so the
// same value can be saved, printed, or used as a Settings default.
export function BrandSelect({ label, value, onChange, options, className = '' }: {
  label: string
  value: string
  onChange: (brand: string) => void
  options: readonly string[]
  className?: string
}) {
  const [otherMode, setOtherMode] = useState(false)
  const isOther = otherMode || (value !== '' && !options.includes(value))
  const selectValue = isOther ? OTHER : value
  const fieldCls = 'w-full px-3 py-2 text-base rounded-lg bg-white border border-gray-200 text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all'

  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <select
        aria-label={label}
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value
          if (v === OTHER) { setOtherMode(true); if (options.includes(value)) onChange('') }
          else { setOtherMode(false); onChange(v) }
        }}
        className={fieldCls}
      >
        <option value="">Choose a brand</option>
        {options.map((b) => <option key={b} value={b}>{b}</option>)}
        <option value={OTHER}>{OTHER_BRAND_LABEL}</option>
      </select>
      {isOther && (
        <input
          type="text"
          aria-label={`${label}, your own`}
          value={options.includes(value) ? '' : value}
          maxLength={MAX_BRAND_CHARS}
          placeholder="Type the brand name"
          onChange={(e) => onChange(e.target.value)}
          className={`${fieldCls} mt-2`}
        />
      )}
    </div>
  )
}
