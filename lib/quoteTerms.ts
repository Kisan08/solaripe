// The quote's project types, number of years, validation and loan maths. Pure
// functions only (no React, no database), so they can be tested on their own.

// The only types a new quote can use. Quotes saved earlier may carry an older
// name ("CAPEX (EPC)", "OPEX / PPA", "AMC", "Hybrid"); those are kept exactly as
// saved and still render the way they always did (anything that is not OPEX has
// always been laid out as CAPEX), so nothing here ever rejects an unknown type.
export const PROJECT_TYPES = ['CAPEX', 'OPEX', 'Loan'] as const
export const isOpexType = (t: string) => t === 'OPEX' || t === 'OPEX / PPA'
export const isLoanType = (t: string) => t === 'Loan'

export const MIN_YEARS = 1
export const MAX_YEARS = 25
export const DEFAULT_YEARS = 10
// What every quote saved before the "Number of years" field showed for its
// savings projection; those quotes must keep showing exactly that.
export const LEGACY_CAPEX_YEARS = 25
export const MAX_LOAN_RATE = 50

export const clampYears = (n: number) =>
  Number.isFinite(n) ? Math.min(MAX_YEARS, Math.max(MIN_YEARS, Math.round(n))) : DEFAULT_YEARS
export const yearsIsValid = (n: unknown) =>
  typeof n === 'number' && Number.isInteger(n) && n >= MIN_YEARS && n <= MAX_YEARS

export interface TermsForm {
  projectType: string
  years?: number
  ppaTermYears?: string // only on quotes saved before `years` existed
  loanInterestRate?: number // % per year
  loanDownPaymentPct?: number // % of the amount payable after subsidy
}

// The one place a quote's number of years is decided. A new quote has `years`
// and everything (savings tables, returns, OPEX contract, loan tenure) uses it.
// A quote saved earlier has no `years`: its savings projection was always 25
// years and its OPEX contract was whatever its own "Contract Term" said.
export function horizon(f: TermsForm) {
  if (f.years !== undefined && f.years !== null) {
    const y = clampYears(f.years)
    return { capex: y, opex: y, loan: y, chosen: true }
  }
  return {
    capex: LEGACY_CAPEX_YEARS,
    opex: parseInt(f.ppaTermYears ?? '', 10) || DEFAULT_YEARS,
    loan: DEFAULT_YEARS,
    chosen: false,
  }
}

// Messages for anything the vendor must fix before a PDF can be made.
export function formErrors(f: TermsForm): string[] {
  const errs: string[] = []
  if (f.years !== undefined && !yearsIsValid(f.years)) {
    errs.push(`Number of years must be a whole number from ${MIN_YEARS} to ${MAX_YEARS}.`)
  }
  if (isLoanType(f.projectType)) {
    const r = f.loanInterestRate
    const d = f.loanDownPaymentPct
    if (r === undefined || !(r >= 0 && r <= MAX_LOAN_RATE)) errs.push(`Enter the loan interest rate (% per year), from 0 to ${MAX_LOAN_RATE}.`)
    if (d === undefined || !(d >= 0 && d < 100)) errs.push('Enter the down payment (%), from 0 to less than 100.')
  }
  return errs
}

// Standard reducing-balance EMI on the amount left after the down payment.
// The amount financed is the net payable after subsidy; the EMI is rounded to
// the rupee and totals are built from that rounded EMI so the figures printed
// on the quote add up exactly (EMI x months = total repayment).
export function loanSummary(f: TermsForm, netAfterSubsidy: number, years: number) {
  if (!isLoanType(f.projectType)) return null
  const rate = f.loanInterestRate
  const dpPct = f.loanDownPaymentPct
  if (rate === undefined || dpPct === undefined) return null
  if (!(rate >= 0 && rate <= MAX_LOAN_RATE) || !(dpPct >= 0 && dpPct < 100)) return null
  const cost = Math.round(netAfterSubsidy)
  if (cost <= 0) return null
  const downPayment = Math.round((cost * dpPct) / 100)
  const principal = cost - downPayment
  const months = years * 12
  const r = rate / 1200
  const emi = Math.round(
    r === 0 ? principal / months : (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1),
  )
  const totalRepayment = emi * months
  return {
    cost, downPayment, principal, months, years, rate, dpPct, emi,
    totalRepayment, totalInterest: totalRepayment - principal, totalPaid: downPayment + totalRepayment,
  }
}
