import { Store, ls, useStore } from './store'
import { J, jStr, jDbl, jList, csvRecords, stripBom } from './product'
import { AppPrefs, CatalogConfig } from './prefs'
import { assetUrl, fetchRemoteText } from './repository'

export type AccessoryType = 'BLADE' | 'GUARD' | 'CAPE' | 'OTHER'
export const ACCESSORY_TYPES: AccessoryType[] = ['BLADE', 'GUARD', 'CAPE', 'OTHER']
const TYPE_INFO: Record<AccessoryType, { label: string; plural: string }> = {
  BLADE: { label: 'Blade', plural: 'Blades' },
  GUARD: { label: 'Guard', plural: 'Guards' },
  CAPE: { label: 'Cape', plural: 'Capes' },
  OTHER: { label: 'Other', plural: 'Other' },
}
export const accessoryTypeLabel = (t: AccessoryType) => TYPE_INFO[t].label
export const accessoryTypePlural = (t: AccessoryType) => TYPE_INFO[t].plural

export function accessoryTypeFrom(value: string | null | undefined): AccessoryType | null {
  const v = value?.trim()
  if (!v) return null
  const hit = ACCESSORY_TYPES.find(t => t.toLowerCase() === v.toLowerCase() || TYPE_INFO[t].label.toLowerCase() === v.toLowerCase() || TYPE_INFO[t].plural.toLowerCase() === v.toLowerCase())
  if (hit) return hit
  switch (v.toLowerCase()) {
    case 'foil': case 'foils': case 'cutter': case 'cutters': case 'head': case 'foil head': return 'BLADE'
    case 'comb': case 'combs': case 'attachment': case 'attachments': case 'guide': case 'guides': return 'GUARD'
    default: return 'OTHER'
  }
}

/** A barber accessory (blade, guard, cape...) and the catalog products it fits. */
export interface Accessory {
  id: string
  brand: string
  name: string
  type: AccessoryType
  model: string | null
  material: string | null
  size: string | null
  color: string | null
  features: string[]
  /** Product ids from products.json this accessory fits. */
  fits: string[]
  /** Readable compatibility, e.g. "Fits Andis Master and Fade Master". */
  fitsText: string | null
  priceUsd: number | null
  buyUrl: string | null
  imageUrl: string | null
  upc: string[]
  sourceUrl: string | null
}

export const accessoryIsStylecraft = (a: Accessory) => a.brand.toLowerCase() === 'stylecraft'
export const accessoryIsOwnBrand = (a: Accessory) => accessoryIsStylecraft(a) || a.brand.toLowerCase() === 'gamma+'

const digits = (list: string[]) => list.map(x => x.replace(/\D/g, '')).filter(Boolean)

export function accessoryFromJson(o: J): Accessory | null {
  const id = jStr(o, 'id'); if (!id) return null
  const name = jStr(o, 'name'); if (!name) return null
  const upcRaw = Array.isArray(o.upc) ? (o.upc as unknown[]).map(x => String(x ?? '')) : (jStr(o, 'upc') ? [jStr(o, 'upc')!] : [])
  return {
    id, brand: jStr(o, 'brand') ?? 'Unknown', name, type: accessoryTypeFrom(jStr(o, 'type')) ?? 'OTHER',
    model: jStr(o, 'model'), material: jStr(o, 'material'), size: jStr(o, 'size'), color: jStr(o, 'color'),
    features: jList(o, 'features'), fits: jList(o, 'fits'), fitsText: jStr(o, 'fitsText'),
    priceUsd: jDbl(o, 'priceUsd'), buyUrl: jStr(o, 'buyUrl'), imageUrl: jStr(o, 'imageUrl'),
    upc: digits(upcRaw), sourceUrl: jStr(o, 'sourceUrl'),
  }
}

/** One row of the "Accessories" tab of the Google Sheet (lists separated by | ). */
export function accessoryFromRow(r: Record<string, string>): Accessory | null {
  const s = (k: string) => { const v = r[k]?.trim(); return v ? v : null }
  const list = (k: string) => s(k)?.split('|').map(x => x.trim()).filter(Boolean) ?? []
  const id = s('id'); if (!id) return null
  const name = s('name'); if (!name) return null
  const price = s('priceUsd')?.replace(/\$/g, '').replace(/,/g, '')
  const priceNum = price ? Number(price) : NaN
  return {
    id, brand: s('brand') ?? 'Unknown', name, type: accessoryTypeFrom(s('type')) ?? 'OTHER',
    model: s('model'), material: s('material'), size: s('size'), color: s('color'),
    features: list('features'), fits: list('fits'), fitsText: s('fitsText'),
    priceUsd: isNaN(priceNum) ? null : priceNum, buyUrl: s('buyUrl'), imageUrl: s('imageUrl'),
    upc: digits(list('upc')), sourceUrl: s('sourceUrl'),
  }
}

/** Accepts {"accessories":[...]}, a plain JSON array, or a CSV export of the Accessories tab. */
export function parseAccessories(text: string): Accessory[] {
  const t = stripBom(text)
  const safeJ = (o: unknown) => { try { return accessoryFromJson(o as J) } catch { return null } }
  let list: Accessory[]
  if (t.startsWith('[')) list = (JSON.parse(t) as unknown[]).map(safeJ).filter((a): a is Accessory => !!a)
  else if (t.startsWith('{')) list = ((JSON.parse(t) as { accessories: unknown[] }).accessories).map(safeJ).filter((a): a is Accessory => !!a)
  else list = csvRecords(t).map(r => { try { return accessoryFromRow(r) } catch { return null } }).filter((a): a is Accessory => !!a)
  const seen = new Set<string>()
  return list.filter(a => seen.has(a.id) ? false : (seen.add(a.id), true))
}

const CACHE_KEY = 'accessories_cache'
const normUpc = (c: string) => c.replace(/\D/g, '').replace(/^0+/, '')

/** Built-in accessories (data/accessories.json), optionally replaced by the online "Accessories" tab. */
export const AccessoryRepository = {
  items: new Store<Accessory[]>([]),
  _initPromise: null as Promise<void> | null,

  init(): Promise<void> {
    if (AccessoryRepository._initPromise) return AccessoryRepository._initPromise
    AccessoryRepository._initPromise = (async () => {
      let list: Accessory[] = []
      const cached = ls.get(CACHE_KEY)
      if (cached) { try { list = parseAccessories(cached) } catch { list = [] } }
      if (list.length === 0) {
        try { list = parseAccessories(await (await fetch(assetUrl('data/accessories.json'))).text()) } catch { list = [] }
      }
      AccessoryRepository.items.set(list)
    })()
    return AccessoryRepository._initPromise
  },

  /** Downloads the Accessories tab when a link is saved in Settings. Returns the count, or null when not set / failed. */
  async refresh(): Promise<{ ok: true; count: number } | { ok: false; reason: string } | null> {
    const raw = (AppPrefs.accessoriesUrl.get().trim() || CatalogConfig.REMOTE_ACCESSORIES_URL)
    if (!raw) return null
    try {
      const body = await fetchRemoteText(raw)
      const parsed = parseAccessories(body)
      if (parsed.length === 0) throw new Error('Accessories list is empty or invalid')
      ls.set(CACHE_KEY, body)
      AccessoryRepository.items.set(parsed)
      return { ok: true, count: parsed.length }
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : 'No connection' }
    }
  },

  findById(id: string): Accessory | undefined { return AccessoryRepository.items.get().find(a => a.id.toLowerCase() === id.toLowerCase()) },

  /** Accessories that fit a product (by product id), own brands first. */
  forProduct(productId: string): Accessory[] {
    const typeOrd = (t: AccessoryType) => ACCESSORY_TYPES.indexOf(t)
    return AccessoryRepository.items.get().filter(a => a.fits.includes(productId)).sort((a, b) =>
      (Number(!accessoryIsOwnBrand(a)) - Number(!accessoryIsOwnBrand(b))) || (typeOrd(a.type) - typeOrd(b.type)) || a.name.localeCompare(b.name))
  },

  byUpc(codes: Set<string>): Accessory | undefined {
    return AccessoryRepository.items.get().find(a => a.upc.some(u => codes.has(normUpc(u))))
  },
}

export const useAccessories = () => useStore(AccessoryRepository.items)
