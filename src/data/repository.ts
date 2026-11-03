import { Store, ls, useStore } from './store'
import { Product, parseCatalog, stripBom } from './product'
import { AppPrefs, CatalogConfig } from './prefs'

const CACHE_KEY = 'products_cache'
const ASSET_URL = 'data/products.json'

/** Relative to the page so the app works from any folder / sub-path. */
export const assetUrl = (path: string) => new URL(path, document.baseURI).toString()

export type RefreshResult =
  | { kind: 'updated'; count: number }
  | { kind: 'notConfigured' }
  | { kind: 'failed'; reason: string }

export const CORS_HINT =
  "The browser blocked the download (Google Sheets must be shared as 'Anyone with the link' and published to the web, or host the catalog as a JSON file that allows cross-origin access)."

/**
 * Downloads a spreadsheet / JSON link from the browser. Tries the direct download link first; for Google Sheets
 * it falls back to the "gviz" CSV endpoint, which allows cross-origin reads of public sheets.
 */
export async function fetchRemoteText(raw: string, timeoutMs = 12000): Promise<string> {
  const direct = AppPrefs.downloadUrl(raw)
  const candidates = [direct]
  const gviz = AppPrefs.gvizUrl(raw)
  if (gviz && !candidates.includes(gviz) && direct.includes('docs.google.com/spreadsheets')) candidates.push(gviz)
  let lastError: unknown = null
  for (const url of candidates) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' })
      if (!res.ok) throw new Error(`Server returned ${res.status}`)
      return await res.text()
    } catch (e) {
      lastError = e
    } finally {
      clearTimeout(timer)
    }
  }
  if (lastError instanceof TypeError) throw new Error(CORS_HINT)
  throw lastError instanceof Error ? lastError : new Error('No connection')
}

export const ProductRepository = {
  products: new Store<Product[]>([]),
  /** True once the built-in or cached catalog has been loaded. */
  ready: new Store<boolean>(false),
  _initPromise: null as Promise<void> | null,

  /** Loads the last downloaded catalog, or the built-in one. */
  init(): Promise<void> {
    if (ProductRepository._initPromise) return ProductRepository._initPromise
    ProductRepository._initPromise = (async () => {
      let list: Product[] = []
      const cached = ls.get(CACHE_KEY)
      if (cached) { try { list = parseCatalog(cached) } catch { list = [] } }
      if (list.length === 0) {
        try { list = parseCatalog(await (await fetch(assetUrl(ASSET_URL))).text()) } catch { list = [] }
      }
      ProductRepository.products.set(list)
      ProductRepository.ready.set(true)
    })()
    return ProductRepository._initPromise
  },

  /** Downloads the online catalog and replaces the current list if it is valid. */
  async refresh(): Promise<RefreshResult> {
    // The link typed in Settings wins; the constant is the built-in default.
    const raw = (AppPrefs.catalogUrl.get() || CatalogConfig.REMOTE_CATALOG_URL).trim()
    if (!raw) return { kind: 'notConfigured' }
    try {
      const body = await fetchRemoteText(raw)
      const parsed = parseCatalog(stripBom(body))
      if (parsed.length === 0) return { kind: 'failed', reason: 'Online catalog is empty or invalid' }
      ls.set(CACHE_KEY, body)
      ProductRepository.products.set(parsed)
      return { kind: 'updated', count: parsed.length }
    } catch (e) {
      return { kind: 'failed', reason: e instanceof Error ? e.message : 'No connection' }
    }
  },

  findById(id: string): Product | undefined { return ProductRepository.products.get().find(p => p.id.toLowerCase() === id.toLowerCase()) },
  byCategory(category: Product['category']): Product[] { return ProductRepository.products.get().filter(p => p.category === category) },
}

export const useProducts = () => useStore(ProductRepository.products)
export const useCatalogReady = () => useStore(ProductRepository.ready)
