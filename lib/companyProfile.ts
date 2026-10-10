// The optional "Company Profile" page of a quote. Every field starts empty:
// nothing here may carry sample text or numbers, and anything the vendor leaves
// empty is simply not printed.
export interface CompanyProfile {
  about: string
  yearsInBusiness: string
  projectsCompleted: string
  capacityInstalled: string
  certifications: string // one per line
  whyChooseUs: string // up to 5 lines
}

export const PROFILE_LIMITS = {
  about: 600,
  stat: 24,
  certLines: 10,
  certLineChars: 80,
  whyLines: 5,
  whyLineChars: 120,
} as const

export const EMPTY_PROFILE: CompanyProfile = {
  about: '',
  yearsInBusiness: '',
  projectsCompleted: '',
  capacityInstalled: '',
  certifications: '',
  whyChooseUs: '',
}

// Non-empty, trimmed lines, cut to the allowed number and length.
export function profileLines(text: string, maxLines: number, maxChars: number): string[] {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim().slice(0, maxChars))
    .filter(Boolean)
    .slice(0, maxLines)
}

// Accepts whatever was stored (including nothing, or an old/odd shape) and
// returns a profile that respects every limit.
export function normalizeProfile(raw: unknown): CompanyProfile {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const str = (k: string, max: number) => String(r[k] ?? '').slice(0, max)
  return {
    about: str('about', PROFILE_LIMITS.about),
    yearsInBusiness: str('yearsInBusiness', PROFILE_LIMITS.stat).trim(),
    projectsCompleted: str('projectsCompleted', PROFILE_LIMITS.stat).trim(),
    capacityInstalled: str('capacityInstalled', PROFILE_LIMITS.stat).trim(),
    certifications: profileLines(String(r.certifications ?? ''), PROFILE_LIMITS.certLines, PROFILE_LIMITS.certLineChars).join('\n'),
    whyChooseUs: profileLines(String(r.whyChooseUs ?? ''), PROFILE_LIMITS.whyLines, PROFILE_LIMITS.whyLineChars).join('\n'),
  }
}

// What will actually be printed, field by field. Empty fields are absent.
export function profileView(p: CompanyProfile) {
  const stats = [
    { label: 'Years in business', value: p.yearsInBusiness.trim() },
    { label: 'Projects completed', value: p.projectsCompleted.trim() },
    { label: 'Capacity installed', value: p.capacityInstalled.trim() },
  ].filter((s) => s.value)
  return {
    about: p.about.trim(),
    stats,
    certifications: profileLines(p.certifications, PROFILE_LIMITS.certLines, PROFILE_LIMITS.certLineChars),
    whyChooseUs: profileLines(p.whyChooseUs, PROFILE_LIMITS.whyLines, PROFILE_LIMITS.whyLineChars),
  }
}

// True when there is at least one thing to print. When false, the quote gets
// no profile page at all, even if the switch is on.
export function profileHasContent(p: CompanyProfile): boolean {
  const v = profileView(p)
  return !!(v.about || v.stats.length || v.certifications.length || v.whyChooseUs.length)
}
