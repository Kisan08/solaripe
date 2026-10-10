// The ONLY place the inverter and panel brand lists live. To add a brand, add
// its name to the right list below. Nothing else needs changing: the quote
// form, the Settings defaults and the PDF all read from here.
//
// "Other (type your own)" is not a brand; it is offered after the last one and
// lets the vendor type any name, which is then stored and printed as typed.

export const INVERTER_BRANDS: readonly string[] = [
  'Growatt', 'Solis', 'Sungrow', 'Huawei', 'Fronius', 'SMA', 'Delta', 'GoodWe',
  'Sofar Solar', 'Havells', 'Polycab', 'Waaree',
  // extra brands
  'Luminous', 'Microtek', 'SolarEdge', 'Enphase', 'Deye', 'KSTAR', 'Livguard', 'Fimer',
]

export const PANEL_BRANDS: readonly string[] = [
  'Waaree', 'Adani Solar', 'Vikram Solar', 'Premier Energies', 'Rayzon Solar',
  'Goldi Solar', 'Saatvik', 'Emmvee', 'RenewSys', 'Navitas', 'Tata Power Solar',
  'LONGi', 'JA Solar', 'Trina Solar', 'Jinko Solar', 'Canadian Solar',
  // extra brands
  'Insolation Energy', 'Websol', 'Loom Solar', 'Gautam Solar', 'Jakson Solar',
  'Solex Energy', 'Pahal Solar', 'Risen', 'Astronergy', 'Hanwha Qcells', 'REC',
]

export const OTHER_BRAND_LABEL = 'Other (type your own)'
export const MAX_BRAND_CHARS = 60

// A brand name is stored as plain text: either one of the list names or what
// the vendor typed. Cleans a typed name (no line breaks, bounded length).
export function cleanBrand(raw: unknown): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_BRAND_CHARS)
}
