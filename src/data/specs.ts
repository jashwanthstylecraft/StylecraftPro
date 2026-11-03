import { Product, hasMeasured, isEstimated, isIron } from './product'
import { nf, fixed, money } from './format'

export type Better = 'HIGHER' | 'LOWER' | 'NONE'

/** One line of the spec sheet. [number] is used for comparison bars; null = not comparable. */
export interface SpecRow {
  label: string
  text: string | null
  number: number | null
  unit: string
  better: Better
  /** Estimated from a sister model / regional version rather than published for this exact product. */
  estimated: boolean
  /** A Stylecraft test result (not a brand claim). */
  measured: boolean
}

const row = (label: string, text: string | null, number: number | null = null, unit = '', better: Better = 'NONE', extra: Partial<SpecRow> = {}): SpecRow =>
  ({ label, text, number, unit, better, estimated: false, measured: false, ...extra })

const watts = (w: number | null) => w == null ? null : (w % 1 === 0 ? `${w} W` : `${fixed(w, 1)} W`)
const yesNo = (b: boolean | null) => b === true ? 'Yes' : b === false ? 'No' : null
const price = (v: number | null) => v == null ? null : money(v)
const grams = (g: number | null) => g == null ? null : `${g} g (${fixed(g / 28.3495, 1)} oz)`
const heat = (c: number | null) => c == null ? null : `${c} °C (${Math.trunc((c * 9) / 5) + 32} °F)`
const minutes = (m: number | null) => {
  if (m == null) return null
  if (m >= 60 && m % 60 === 0) return `${m / 60} h (${m} min)`
  if (m > 60) return `${Math.floor(m / 60)} h ${m % 60} min`
  return `${m} min`
}
const speed = (p: Product) => p.rpmText ?? (p.rpm != null ? `${nf(p.rpm)} RPM` : null)

function inches(v: number | null): string | null {
  if (v == null) return null
  const whole = Math.trunc(v), frac = v - whole
  let f: string | null
  if (frac < 0.01) f = ''
  else if (Math.abs(frac - 0.25) < 0.01) f = '-1/4'
  else if (Math.abs(frac - 0.5) < 0.01) f = '-1/2'
  else if (Math.abs(frac - 0.75) < 0.01) f = '-3/4'
  else if (Math.abs(frac - 0.625) < 0.01) f = '-5/8'
  else if (Math.abs(frac - 0.375) < 0.01) f = '-3/8'
  else f = null
  if (f == null) return `${fixed(v, 2)} in`
  return whole === 0 ? f.replace(/^-/, '') + ' in' : `${whole}${f} in`
}

function tempRange(lo: number | null, hi: number | null): string | null {
  if (hi == null) return null
  const c = (f: number) => Math.trunc(((f - 32) * 5) / 9)
  if (lo == null) return `up to ${hi} °F (${c(hi)} °C)`
  return `${lo}–${hi} °F (${c(lo)}–${c(hi)} °C)`
}

function ionic(p: Product): string | null {
  if (p.ions == null) return null
  switch (p.ions.toLowerCase()) { case 'true': case 'yes': return 'Yes'; case 'false': case 'no': case 'none': return 'No'; default: return p.ions }
}

/** Rows with Stylecraft's own test results (text is null when not tested yet). */
export function measuredRowsAll(p: Product): SpecRow[] {
  return [
    row('Measured speed', p.measuredRpm != null ? nf(p.measuredRpm) + ' RPM' : null, p.measuredRpm, 'RPM', 'HIGHER', { measured: true }),
    row('Measured noise', p.measuredNoiseDb != null ? `${fixed(p.measuredNoiseDb, 1)} dB` : null, p.measuredNoiseDb, 'dB', 'LOWER', { measured: true }),
    row('Measured power', watts(p.measuredWatts), p.measuredWatts, 'W', 'NONE', { measured: true }),
  ]
}

/** Only the measured rows that have a value. */
export const measuredRows = (p: Product) => measuredRowsAll(p).filter(r => r.text != null)

/** Rows for a side-by-side comparison: published specs, plus Stylecraft test results when either product has them. */
export function compareRows(a: Product, b: Product): [SpecRow[], SpecRow[]] {
  const withMeasured = hasMeasured(a) || hasMeasured(b)
  return [
    [...specRows(a, false), ...(withMeasured ? measuredRowsAll(a) : [])],
    [...specRows(b, false), ...(withMeasured ? measuredRowsAll(b) : [])],
  ]
}

const FIELD_OF_LABEL: Record<string, string> = {
  'Runtime': 'runtimeMin', 'Charge time': 'chargeMin', 'Weight': 'weightG', 'Motor type': 'motorType',
  'Motor speed': 'rpm', 'Noise': 'noiseDb', 'Guards': 'guards', 'Charging port': 'chargingPort',
  'Max heat': 'maxHeatC', 'Ions': 'ions', 'Infrared': 'infrared', 'Power': 'wattage',
  'Plate': 'plateMaterial', 'Barrel': 'plateMaterial', 'Plate width': 'sizeIn', 'Barrel size': 'sizeIn', 'Temperature': 'maxTempF',
  'Heat settings': 'heatSettings', 'Heat-up time': 'heatUpSec', 'Heater': 'heater', 'Dual voltage': 'dualVoltage',
  'Cord': 'cordFt', 'Auto shut-off': 'autoShutoffMin', 'Ionic': 'ions',
}

export function specRows(p: Product, hideNotApplicable = true): SpecRow[] {
  return baseRows(p, hideNotApplicable).map(r => {
    const field = FIELD_OF_LABEL[r.label] ?? ''
    if (field && r.text != null && isEstimated(p, field)) return { ...r, text: r.text + ' (est.)', estimated: true }
    return r
  })
}

function ironRows(p: Product, hide: boolean): SpecRow[] {
  const curl = p.category === 'CURLING_IRON'
  const all = [
    row('Model', p.model),
    row(curl ? 'Barrel size' : 'Plate width', p.sizeText ?? inches(p.sizeIn), p.sizeIn, 'in'),
    row(curl ? 'Barrel' : 'Plate', p.plateMaterial),
    row('Temperature', tempRange(p.minTempF, p.maxTempF), p.maxTempF, '°F', 'HIGHER'),
    row('Heat settings', p.heatSettings),
    row('Heat-up time', p.heatUpSec != null ? (p.heatUpSec >= 60 && p.heatUpSec % 60 === 0 ? `${p.heatUpSec / 60} min` : `${p.heatUpSec} s`) : null, p.heatUpSec, 's', 'LOWER'),
    row('Heater', p.heater),
    row('Power', watts(p.wattage), p.wattage, 'W'),
    row('Dual voltage', yesNo(p.dualVoltage)),
    row('Cord', p.cordFt != null ? `${p.cordFt} ft` : p.chargingPort, p.cordFt, 'ft', 'HIGHER'),
    row('Auto shut-off', p.autoShutoffMin != null ? `${p.autoShutoffMin} min` : null),
    row('Ionic', ionic(p)),
    row('Infrared', yesNo(p.infrared)),
    row('Weight', grams(p.weightG), p.weightG, 'g', 'LOWER'),
    row('List price', price(p.priceUsd), p.priceUsd, '$', 'LOWER'),
  ]
  const hidden = new Set(['Heater', 'Infrared', 'Power', 'Heat-up time'])
  return all.filter(r => !(hide && r.text == null && hidden.has(r.label)))
}

function baseRows(p: Product, hide: boolean): SpecRow[] {
  const cat = p.category
  if (isIron(cat)) return ironRows(p, hide)
  if (cat === 'DRYER') return [
    row('Model', p.model),
    row('Motor speed', speed(p), p.rpm, 'RPM', 'HIGHER'),
    row('Max heat', heat(p.maxHeatC), p.maxHeatC, '°C'),
    row('Weight', grams(p.weightG), p.weightG, 'g', 'LOWER'),
    row('Motor type', p.motorType),
    row('Ions', p.ions),
    row('Infrared', yesNo(p.infrared)),
    row('Power', watts(p.wattage), p.wattage, 'W'),
    row('Noise', p.noiseDb != null ? `${Math.trunc(p.noiseDb)} dB` : null, p.noiseDb, 'dB', 'LOWER'),
    row('List price', price(p.priceUsd), p.priceUsd, '$', 'LOWER'),
  ]
  return [
    row('Model', p.model),
    row('Runtime', minutes(p.runtimeMin), p.runtimeMin, 'min', 'HIGHER'),
    row('Charge time', minutes(p.chargeMin), p.chargeMin, 'min', 'LOWER'),
    row('Weight', grams(p.weightG), p.weightG, 'g', 'LOWER'),
    row('Motor type', p.motorType),
    row('Motor speed', speed(p), p.rpm, 'RPM', 'HIGHER'),
    row('Noise', p.noiseDb != null ? `${Math.trunc(p.noiseDb)} dB` : null, p.noiseDb, 'dB', 'LOWER'),
    row('Guards', p.guards),
    row('Charging port', p.chargingPort),
    row('Power', watts(p.wattage), p.wattage, 'W'),
    row('List price', price(p.priceUsd), p.priceUsd, '$', 'LOWER'),
  ].filter(r =>
    // Foil shavers don't use guards: hide that row unless a guard set is actually listed.
    // Battery tools rarely publish watts: only show Power when it's known.
    !(hide && cat === 'SHAVER' && r.label === 'Guards' && r.text == null) &&
    !(hide && r.label === 'Power' && r.text == null))
}

export const NOT_PUBLISHED = 'Not listed'

/**
 * What the brand claims for motor speed, as a range.
 * Stylecraft and Gamma+ IN2 / IN3 vector motors adjust their speed under load, so any reading
 * from 8,500 to 11,500 RPM matches their claim. Every other product is compared with its single RPM.
 */
export interface SpeedClaim { low: number; high: number }
export const claimIsRange = (c: SpeedClaim) => c.low !== c.high
export const claimText = (c: SpeedClaim) => claimIsRange(c) ? `${nf(c.low)}–${nf(c.high)} RPM` : `${nf(c.low)} RPM`

export const VECTOR_RPM_LOW = 8500
export const VECTOR_RPM_HIGH = 11500

export function isOwnVectorMotor(p: Product): boolean {
  if (p.category === 'DRYER' || isIron(p.category)) return false
  const b = p.brand.toLowerCase()
  if (!(b === 'stylecraft' || b === 'gamma+')) return false
  const m = p.motorType?.toLowerCase(); if (!m) return false
  return m.includes('in2') || m.includes('in3') || m.includes('vector')
}

export function speedClaim(p: Product): SpeedClaim | null {
  if (isOwnVectorMotor(p)) return { low: VECTOR_RPM_LOW, high: VECTOR_RPM_HIGH }
  if (p.rpm != null && p.rpm > 0) return { low: p.rpm, high: p.rpm }
  return null
}

/** Result of comparing a measured speed with the claim. [diffPct] is 0 when inside the claimed range. */
export interface SpeedVerdict { matches: boolean; diffPct: number; label: string }
export const verdictDiffText = (v: SpeedVerdict) => (v.diffPct >= 0 ? '+' : '') + fixed(v.diffPct, 1) + '%'

export function checkClaim(c: SpeedClaim, measured: number): SpeedVerdict {
  if (claimIsRange(c)) {
    if (measured >= c.low && measured <= c.high) return { matches: true, diffPct: 0, label: 'Matches the claim' }
    if (measured < c.low) return { matches: false, diffPct: ((measured - c.low) * 100) / c.low, label: 'Below the claim' }
    return { matches: true, diffPct: ((measured - c.high) * 100) / c.high, label: 'Above the claim' }
  }
  const diff = ((measured - c.low) * 100) / c.low
  // single published number: within 5% (or faster) counts as a match
  return diff >= -5 ? { matches: true, diffPct: diff, label: 'Matches the claim' } : { matches: false, diffPct: diff, label: 'Below the claim' }
}

/** 1 if a is better, 2 if b is better, 0 if equal / not comparable. (ShareTools.winnerOf) */
export function winnerOf(a: SpecRow, b: SpecRow): 0 | 1 | 2 {
  if (a.number == null || b.number == null) return 0
  const x = a.number, y = b.number
  if (x === y) return 0
  switch (a.better) {
    case 'HIGHER': return x > y ? 1 : 2
    case 'LOWER': return x < y ? 1 : 2
    default: return 0
  }
}
