import { Store, useStore } from './store'
import { J, Product, jStr, jDbl, jList, categoryOrdinal } from './product'
import { assetUrl } from './repository'

/** A boxed set sold as one item (e.g. clipper + trimmer). */
export interface Combo {
  id: string
  brand: string
  name: string
  model: string | null
  /** Catalog product ids in the box. */
  items: string[]
  /** Other things in the box (tools not in the catalog, cases, guards...). */
  extraItems: string[]
  contents: string | null
  priceUsd: number | null
  salePriceUsd: number | null
  buyUrl: string | null
  imageUrl: string | null
  upc: string[]
  features: string[]
}

export const comboIsStylecraft = (c: Combo) => c.brand.toLowerCase() === 'stylecraft'

export function comboFromJson(o: J): Combo | null {
  const id = jStr(o, 'id'); if (!id) return null
  const name = jStr(o, 'name'); if (!name) return null
  return {
    id, brand: jStr(o, 'brand') ?? 'Stylecraft', name, model: jStr(o, 'model'),
    items: jList(o, 'items'), extraItems: jList(o, 'extraItems'), contents: jStr(o, 'contents'),
    priceUsd: jDbl(o, 'priceUsd'), salePriceUsd: jDbl(o, 'salePriceUsd'), buyUrl: jStr(o, 'buyUrl'), imageUrl: jStr(o, 'imageUrl'),
    upc: jList(o, 'upc').map(x => x.replace(/\D/g, '')).filter(Boolean), features: jList(o, 'features'),
  }
}

const normUpc = (c: string) => c.replace(/\D/g, '').replace(/^0+/, '')

/** Combos built into the app (data/combos.json). */
export const ComboRepository = {
  items: new Store<Combo[]>([]),
  _initPromise: null as Promise<void> | null,
  init(): Promise<void> {
    if (ComboRepository._initPromise) return ComboRepository._initPromise
    ComboRepository._initPromise = (async () => {
      try {
        const o = await (await fetch(assetUrl('data/combos.json'))).json() as { combos: unknown[] }
        ComboRepository.items.set(o.combos.map(c => { try { return comboFromJson(c as J) } catch { return null } }).filter((c): c is Combo => !!c))
      } catch { ComboRepository.items.set([]) }
    })()
    return ComboRepository._initPromise
  },
  findById(id: string): Combo | undefined { return ComboRepository.items.get().find(c => c.id === id) },
  containing(productId: string): Combo[] { return ComboRepository.items.get().filter(c => c.items.includes(productId)) },
  byUpc(codes: Set<string>): Combo | undefined { return ComboRepository.items.get().find(c => c.upc.some(u => codes.has(normUpc(u)))) },
}
export const useCombos = () => useStore(ComboRepository.items)

/** A product line: same brand + same family name (e.g. Stylecraft Instinct). */
export interface Family { brand: string; name: string; members: Product[] }
export const familyKey = (f: Family) => `${f.brand}|${f.name}`
export const familyTitle = (f: Family) => `${f.brand} ${f.name}`

const byCatThenName = (a: Product, b: Product) => (categoryOrdinal(a.category) - categoryOrdinal(b.category)) || a.name.localeCompare(b.name)

export const Families = {
  all(products: Product[]): Family[] {
    const groups = new Map<string, Family>()
    for (const p of products) {
      if (!p.family) continue
      const k = `${p.brand}|${p.family}`
      const g = groups.get(k) ?? { brand: p.brand, name: p.family, members: [] }
      g.members.push(p); groups.set(k, g)
    }
    const catCount = (f: Family) => new Set(f.members.map(m => m.category)).size
    return [...groups.values()].filter(f => f.members.length > 1)
      .map(f => ({ ...f, members: [...f.members].sort(byCatThenName) }))
      .sort((a, b) =>
        (Number(a.brand.toLowerCase() !== 'stylecraft') - Number(b.brand.toLowerCase() !== 'stylecraft')) ||
        (catCount(b) - catCount(a)) || a.name.localeCompare(b.name))
  },
  of(product: Product, products: Product[]): Family | null {
    const fam = product.family; if (!fam) return null
    const members = products.filter(p => p.brand === product.brand && p.family === fam)
    return members.length > 1 ? { brand: product.brand, name: fam, members: [...members].sort(byCatThenName) } : null
  },
  byKey(key: string, products: Product[]): Family | undefined { return Families.all(products).find(f => familyKey(f) === key) },
}
