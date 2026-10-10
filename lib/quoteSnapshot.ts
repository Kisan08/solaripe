// Shape of a saved quote's "recipe" — everything app/quote/page.tsx needs
// to re-render an identical <QuotationDocument> without the user re-entering
// anything. Stored as the `snapshot` jsonb column on public.lead_quotes
// (see supabase/migrations/0019_lead_quotes.sql).
//
// Deliberately loose on the nested payloads (f / settings / products /
// media): the quote page owns those exact types (QuoteForm, AppSettings,
// Product, ClientLogo, …) and casts on hydrate. Pinning them here would
// couple this small shared module to a ~1800-line page component and risk
// an import cycle (the quote page imports the save/load helpers from
// lib/data.ts, which imports this).
export interface QuoteSnapshot {
  /** Snapshot format version — bump if the hydrate contract changes. */
  v: 1
  /** The QuoteForm state object. */
  f: Record<string, unknown>
  showSiteDetails: boolean
  selectedPanelId: string
  selectedInverterId: string
  /** Resolved AppSettings at save time (branding, payment schedule, …). */
  settings: Record<string, unknown>
  /** The selected panel/inverter Product objects, or null for "default". */
  panel: Record<string, unknown> | null
  inverter: Record<string, unknown> | null
  /** Tenant media-library arrays passed to <QuotationDocument>. */
  clientLogos: unknown[]
  testimonials: unknown[]
  certifications: unknown[]
  featuredProjects: unknown[]
  // Added later, so all optional: a quote saved before they existed simply
  // lacks them and is rendered exactly as it always was.
  /** Partner brands for the cover strip. Absent = an older quote with its old logo strip. */
  partnerBrands?: unknown[]
  /** Whether the optional Company Profile page is in the PDF. */
  includeProfile?: boolean
  /** The company profile text for that page. */
  profile?: Record<string, unknown>
}
