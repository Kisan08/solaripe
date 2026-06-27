export function formatINR(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "₹0"
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatINRCompact(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "₹0"
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`
  return `₹${value}`
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—"
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function formatKwp(value: number | null | undefined): string {
  if (value == null) return "—"
  return `${value} kWp`
}
