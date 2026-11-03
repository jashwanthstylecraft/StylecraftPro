export type Category = 'CLIPPER' | 'TRIMMER' | 'SHAVER' | 'DRYER' | 'STRAIGHTENER' | 'CURLING_IRON'

/** Same order as the Kotlin enum (ordinal is used for sorting). */
export const CATEGORIES: Category[] = ['CLIPPER', 'TRIMMER', 'SHAVER', 'DRYER', 'STRAIGHTENER', 'CURLING_IRON']

const CAT_INFO: Record<Category, { label: string; plural: string }> = {
  CLIPPER: { label: 'Clipper', plural: 'Clippers' },
  TRIMMER: { label: 'Trimmer', plural: 'Trimmers' },
  SHAVER: { label: 'Shaver', plural: 'Shavers' },
  DRYER: { label: 'Dryer', plural: 'Dryers' },
  STRAIGHTENER: { label: 'Straightener', plural: 'Hair Straighteners' },
  CURLING_IRON: { label: 'Curling Iron', plural: 'Curling Irons' },
}

export const categoryLabel = (c: Category) => CAT_INFO[c].label
export const categoryPlural = (c: Category) => CAT_INFO[c].plural
export const categoryOrdinal = (c: Category) => CATEGORIES.indexOf(c)
/** Flat irons and curling irons: heated plates/barrels, no motor. */
export const isIron = (c: Category) => c === 'STRAIGHTENER' || c === 'CURLING_IRON'
/** Tools with a motor that the Speed Analyzer can measure. */
export const hasMotor = (c: Category) => !isIron(c)

export function categoryFrom(value: string | null | undefined): Category | null {
  const v = value?.trim()
  if (!v) return null
  const hit = CATEGORIES.find(c => CAT_INFO[c].label.toLowerCase() === v.toLowerCase() || CAT_INFO[c].plural.toLowerCase() === v.toLowerCase())
  if (hit) return hit
  switch (v.toLowerCase()) {
    case 'hair dryer': return 'DRYER'
    case 'straighteners': case 'flat iron': case 'flat irons': case 'hair straightener': return 'STRAIGHTENER'
    case 'curling irons': case 'curling wand': case 'curling wands': case 'wand': case 'marcel iron': return 'CURLING_IRON'
    default: return null
  }
}

/**
 * One product in the catalog (Stylecraft or a competitor).
 * Every spec is nullable: null means "not published by the brand".
 */
export interface Product {
  id: string
  brand: string
  name: string
  category: Category
  model: string | null
  runtimeMin: number | null
  chargeMin: number | null
  guards: string | null
  chargingPort: string | null
  weightG: number | null
  motorType: string | null
  rpm: number | null
  rpmText: string | null
  noiseDb: number | null
  maxHeatC: number | null
  ions: string | null
  infrared: boolean | null
  wattage: number | null
  fanBlades: number | null
  features: string[]
  imageUrl: string | null
  websiteUrl: string | null
  sourceUrl: string | null
  localImages: string[]
  motorImage: string | null
  priceUsd: number | null
  buyUrl: string | null
  upc: string[]
  estimated: string[]
  sources: string[]
  measuredRpm: number | null
  measuredNoiseDb: number | null
  measuredWatts: number | null
  measuredDate: string | null
  family: string | null
  plateMaterial: string | null
  sizeIn: number | null
  sizeText: string | null
  minTempF: number | null
  maxTempF: number | null
  heatSettings: string | null
  heatUpSec: number | null
  heater: string | null
  dualVoltage: boolean | null
  cordFt: number | null
  autoShutoffMin: number | null
}

export const isEstimated = (p: Product, field: string) => p.estimated.some(e => e.toLowerCase() === field.toLowerCase())
export const hasMeasured = (p: Product) => p.measuredRpm != null || p.measuredNoiseDb != null || p.measuredWatts != null
export const isStylecraft = (p: Product) => p.brand.toLowerCase() === 'stylecraft'
export const displayName = (p: Product) => p.name.toLowerCase().startsWith(p.brand.toLowerCase()) ? p.name : `${p.brand} ${p.name}`

// ---- JSON helpers (mirror JSONObject.str / int / dbl / strList) ----
export type J = Record<string, unknown>
const has = (o: J, k: string) => o[k] !== undefined && o[k] !== null
export const jStr = (o: J, k: string): string | null => has(o, k) ? (String(o[k]).trim() || null) : null
export const jInt = (o: J, k: string): number | null => has(o, k) && typeof o[k] === 'number' ? Math.trunc(o[k] as number) : null
export const jDbl = (o: J, k: string): number | null => has(o, k) && typeof o[k] === 'number' ? (o[k] as number) : null
export const jBool = (o: J, k: string): boolean | null => has(o, k) ? Boolean(o[k]) : null
export const jList = (o: J, k: string): string[] => Array.isArray(o[k]) ? (o[k] as unknown[]).map(x => String(x ?? '').trim()).filter(Boolean) : []

export function productFromJson(o: J): Product | null {
  const id = jStr(o, 'id'); if (!id) return null
  const name = jStr(o, 'name'); if (!name) return null
  const category = categoryFrom(jStr(o, 'category')); if (!category) return null
  return {
    id, brand: jStr(o, 'brand') ?? 'Unknown', name, category, model: jStr(o, 'model'),
    runtimeMin: jInt(o, 'runtimeMin'), chargeMin: jInt(o, 'chargeMin'), guards: jStr(o, 'guards'), chargingPort: jStr(o, 'chargingPort'),
    weightG: jInt(o, 'weightG'), motorType: jStr(o, 'motorType'), rpm: jInt(o, 'rpm'), rpmText: jStr(o, 'rpmText'), noiseDb: jDbl(o, 'noiseDb'),
    maxHeatC: jInt(o, 'maxHeatC'), ions: jStr(o, 'ions'), infrared: jBool(o, 'infrared'), wattage: jDbl(o, 'wattage'), fanBlades: jInt(o, 'fanBlades'),
    features: jList(o, 'features'), imageUrl: jStr(o, 'imageUrl'), websiteUrl: jStr(o, 'websiteUrl'), sourceUrl: jStr(o, 'sourceUrl'),
    localImages: jList(o, 'localImages'), motorImage: jStr(o, 'motorImage'),
    priceUsd: jDbl(o, 'priceUsd'), buyUrl: jStr(o, 'buyUrl'), upc: jList(o, 'upc'),
    estimated: jList(o, 'estimated'), sources: jList(o, 'sources'),
    measuredRpm: jInt(o, 'measuredRpm'), measuredNoiseDb: jDbl(o, 'measuredNoiseDb'), measuredWatts: jDbl(o, 'measuredWatts'),
    measuredDate: jStr(o, 'measuredDate'), family: jStr(o, 'family'),
    plateMaterial: jStr(o, 'plateMaterial'), sizeIn: jDbl(o, 'sizeIn'), sizeText: jStr(o, 'sizeText'),
    minTempF: jInt(o, 'minTempF'), maxTempF: jInt(o, 'maxTempF'), heatSettings: jStr(o, 'heatSettings'),
    heatUpSec: jInt(o, 'heatUpSec'), heater: jStr(o, 'heater'), dualVoltage: jBool(o, 'dualVoltage'),
    cordFt: jDbl(o, 'cordFt'), autoShutoffMin: jInt(o, 'autoShutoffMin'),
  }
}

/** Builds a product from one spreadsheet row (header name -> cell text). */
export function productFromRow(r: Record<string, string>): Product | null {
  const s = (k: string) => { const v = r[k]?.trim(); return v ? v : null }
  const d = (k: string) => { const v = s(k)?.replace(/,/g, '').replace(/\$/g, ''); if (!v) return null; const n = Number(v); return isNaN(n) ? null : n }
  const i = (k: string) => { const v = s(k)?.replace(/,/g, ''); if (!v) return null; const n = Number(v); return isNaN(n) ? null : Math.trunc(n) }
  const list = (k: string) => s(k)?.split('|').map(x => x.trim()).filter(Boolean) ?? []
  const bool = (k: string): boolean | null => {
    switch (s(k)?.toLowerCase()) { case 'yes': case 'true': case 'y': case '1': return true; case 'no': case 'false': case 'n': case '0': return false; default: return null }
  }
  const id = s('id'); if (!id) return null
  const name = s('name'); if (!name) return null
  const category = categoryFrom(s('category')); if (!category) return null
  return {
    id, brand: s('brand') ?? 'Unknown', name, category, model: s('model'),
    runtimeMin: i('runtimeMin'), chargeMin: i('chargeMin'), guards: s('guards'), chargingPort: s('chargingPort'),
    weightG: i('weightG'), motorType: s('motorType'), rpm: i('rpm'), rpmText: s('rpmText'), noiseDb: d('noiseDb'),
    maxHeatC: i('maxHeatC'), ions: s('ions'), infrared: bool('infrared'), wattage: d('wattage'), fanBlades: i('fanBlades'),
    features: list('features'), imageUrl: s('imageUrl'), websiteUrl: s('websiteUrl'), sourceUrl: s('sourceUrl'),
    localImages: list('localImages'), motorImage: s('motorImage'),
    priceUsd: d('priceUsd'), buyUrl: s('buyUrl'), upc: list('upc').map(x => x.replace(/\D/g, '')).filter(Boolean),
    estimated: list('estimated'), sources: list('sources'),
    measuredRpm: i('measuredRpm'), measuredNoiseDb: d('measuredNoiseDb'), measuredWatts: d('measuredWatts'),
    measuredDate: s('measuredDate'), family: s('family'),
    plateMaterial: s('plateMaterial'), sizeIn: d('sizeIn'), sizeText: s('sizeText'),
    minTempF: i('minTempF'), maxTempF: i('maxTempF'), heatSettings: s('heatSettings'),
    heatUpSec: i('heatUpSec'), heater: s('heater'), dualVoltage: bool('dualVoltage'),
    cordFt: d('cordFt'), autoShutoffMin: i('autoShutoffMin'),
  }
}

/** Minimal CSV reader (quotes, commas and line breaks inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else inQuotes = false
      } else cell += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\r') { /* skip */ }
    else if (c === '\n') { row.push(cell); cell = ''; rows.push(row); row = [] }
    else cell += c
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.some(x => x.trim() !== ''))
}

/** Rows of a CSV as header-keyed maps. */
export function csvRecords(text: string): Record<string, string>[] {
  const rows = parseCsv(text)
  if (rows.length === 0) return []
  const header = rows[0].map(h => h.trim())
  return rows.slice(1).map(cells => Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ''])))
}

export const stripBom = (s: string) => s.trim().replace(/^﻿/, '')

/**
 * Accepts the app's JSON ({"products":[...]} or [...]) or a spreadsheet saved / published as CSV
 * (first row = column names such as id, brand, name, category, model, runtimeMin ...).
 */
export function parseCatalog(text: string): Product[] {
  const t = stripBom(text)
  const safe = (o: unknown) => { try { return productFromJson(o as J) } catch { return null } }
  let list: Product[]
  if (t.startsWith('[')) list = (JSON.parse(t) as unknown[]).map(safe).filter((p): p is Product => !!p)
  else if (t.startsWith('{')) list = ((JSON.parse(t) as { products: unknown[] }).products).map(safe).filter((p): p is Product => !!p)
  else list = csvRecords(t).map(r => { try { return productFromRow(r) } catch { return null } }).filter((p): p is Product => !!p)
  const seen = new Set<string>()
  return list.filter(p => seen.has(p.id) ? false : (seen.add(p.id), true))
}
