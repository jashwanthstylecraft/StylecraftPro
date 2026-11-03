import { CATEGORIES, Category } from '../data/product'

export type AnalyzerMode = 'CLIPPER' | 'DRYER'

/**
 * Screens of the app (sealed interface Screen in MainProApp.kt). The app keeps a simple back stack of these.
 * `kind` is the discriminant; optional fields have the same defaults as the Kotlin data classes.
 */
export type Screen =
  | { kind: 'Home' }
  | { kind: 'Catalog'; category: Category; pickForId?: string | null }
  | { kind: 'Detail'; productId: string }
  | { kind: 'Compare'; firstId: string; secondId: string }
  | { kind: 'Scanner' }
  | { kind: 'SpeedTool'; mode?: AnalyzerMode | null; productId?: string | null }
  | { kind: 'Favorites' }
  | { kind: 'Show' }
  | { kind: 'Settings' }
  /** Accessories grid; [forProductId] shows only what fits that product. */
  | { kind: 'Accessories'; forProductId?: string | null }
  | { kind: 'AccessoryDetail'; accessoryId: string }
  | { kind: 'Search'; initial?: string }
  | { kind: 'Leads' }
  /** New lead ([leadId] null) or edit; [productId] pre-selects the product being shown. */
  | { kind: 'LeadForm'; leadId?: string | null; productId?: string | null }
  | { kind: 'Families' }
  | { kind: 'Benchmark'; category?: Category | null; ids?: string[] }
  | { kind: 'Family'; key: string }
  | { kind: 'ComboDetail'; comboId: string }

export const HOME: Screen = { kind: 'Home' }

// ---- URL hash <-> Screen (so refresh and deep links work) -------------------------------------------------

const e = encodeURIComponent
const q = (pairs: [string, string | null | undefined][]) => {
  const s = pairs.filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${e(v as string)}`).join('&')
  return s ? '?' + s : ''
}

export function screenToHash(s: Screen): string {
  switch (s.kind) {
    case 'Home': return '#/home'
    case 'Catalog': return '#/catalog' + q([['category', s.category], ['pickForId', s.pickForId]])
    case 'Detail': return '#/detail' + q([['id', s.productId]])
    case 'Compare': return '#/compare' + q([['a', s.firstId], ['b', s.secondId]])
    case 'Scanner': return '#/scanner'
    case 'SpeedTool': return '#/speed' + q([['mode', s.mode], ['productId', s.productId]])
    case 'Favorites': return '#/favorites'
    case 'Show': return '#/show'
    case 'Settings': return '#/settings'
    case 'Accessories': return '#/accessories' + q([['forProductId', s.forProductId]])
    case 'AccessoryDetail': return '#/accessory' + q([['id', s.accessoryId]])
    case 'Search': return '#/search' + q([['q', s.initial]])
    case 'Leads': return '#/leads'
    case 'LeadForm': return '#/lead' + q([['id', s.leadId], ['productId', s.productId]])
    case 'Families': return '#/families'
    case 'Benchmark': return '#/benchmark' + q([['category', s.category], ['ids', s.ids && s.ids.length ? s.ids.join(',') : null]])
    case 'Family': return '#/family' + q([['key', s.key]])
    case 'ComboDetail': return '#/combo' + q([['id', s.comboId]])
  }
}

export function hashToScreen(hash: string): Screen | null {
  const h = hash.replace(/^#/, '')
  if (!h || h === '/') return null
  const [path, query = ''] = h.split('?')
  const p = new URLSearchParams(query)
  const g = (k: string) => p.get(k)
  const cat = (v: string | null) => (v && (CATEGORIES as string[]).includes(v) ? (v as Category) : null)
  switch (path.replace(/^\//, '')) {
    case 'home': return HOME
    case 'catalog': { const c = cat(g('category')); return c ? { kind: 'Catalog', category: c, pickForId: g('pickForId') } : null }
    case 'detail': return g('id') ? { kind: 'Detail', productId: g('id')! } : null
    case 'compare': return g('a') && g('b') ? { kind: 'Compare', firstId: g('a')!, secondId: g('b')! } : null
    case 'scanner': return { kind: 'Scanner' }
    case 'speed': { const m = g('mode'); return { kind: 'SpeedTool', mode: m === 'CLIPPER' || m === 'DRYER' ? m : null, productId: g('productId') } }
    case 'favorites': return { kind: 'Favorites' }
    case 'show': return { kind: 'Show' }
    case 'settings': return { kind: 'Settings' }
    case 'accessories': return { kind: 'Accessories', forProductId: g('forProductId') }
    case 'accessory': return g('id') ? { kind: 'AccessoryDetail', accessoryId: g('id')! } : null
    case 'search': return { kind: 'Search', initial: g('q') ?? '' }
    case 'leads': return { kind: 'Leads' }
    case 'lead': return { kind: 'LeadForm', leadId: g('id'), productId: g('productId') }
    case 'families': return { kind: 'Families' }
    case 'benchmark': return { kind: 'Benchmark', category: cat(g('category')), ids: g('ids') ? g('ids')!.split(',').filter(Boolean) : [] }
    case 'family': return g('key') ? { kind: 'Family', key: g('key')! } : null
    case 'combo': return g('id') ? { kind: 'ComboDetail', comboId: g('id')! } : null
    default: return null
  }
}
