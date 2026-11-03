import { Store, ls, idb, useStore } from './store'
import { TeamSync, TeamResult } from './teamsync'

/** One technical document (IB, TDS, battery SDS, certificate, test report) from the "Documents" tab. */
export interface DocInfo {
  id: string
  products: string[]
  type: string
  title: string
  marks: string[]
  issuer: string
  date: string
  language: string
  /** True = the rep may send it to customers; false = view only. */
  share: boolean
  fileName: string
}

export const docExtension = (d: DocInfo) => {
  const i = d.fileName.lastIndexOf('.')
  const e = i >= 0 ? d.fileName.substring(i + 1).toLowerCase() : 'pdf'
  return e.length > 5 ? 'pdf' : e
}

/** Certification marks of a product: [certified] backed by a certificate, [tested] only by a test report so far. */
export interface CertInfo { certified: string[]; tested: string[] }
export const certIsEmpty = (c: CertInfo) => c.certified.length === 0 && c.tested.length === 0

/** What a certification mark means for a sales rep: where it lets the product be sold. */
export type MarkGroup = 'SAFETY' | 'ELECTRICAL' | 'BATTERY'
export interface Mark { market: string; group: MarkGroup }

const MARKS: Record<string, Mark> = {
  'ETL': { market: 'USA', group: 'SAFETY' }, 'cETL': { market: 'Canada', group: 'SAFETY' }, 'UL': { market: 'USA', group: 'SAFETY' },
  'CSA': { market: 'Canada', group: 'SAFETY' }, 'cTUVus': { market: 'USA + Canada', group: 'SAFETY' }, 'cSGSus': { market: 'USA + Canada', group: 'SAFETY' },
  'cMETus': { market: 'USA + Canada', group: 'SAFETY' }, 'NOM': { market: 'Mexico', group: 'SAFETY' }, 'CE': { market: 'Europe', group: 'SAFETY' },
  'UKCA': { market: 'United Kingdom', group: 'SAFETY' }, 'INMETRO': { market: 'Brazil', group: 'SAFETY' }, 'CB': { market: 'International (CB scheme)', group: 'SAFETY' },
  'FCC': { market: 'USA (radio / EMC)', group: 'ELECTRICAL' }, 'NRCan': { market: 'Canada (energy)', group: 'ELECTRICAL' },
  'RoHS': { market: 'Europe (materials)', group: 'ELECTRICAL' }, 'KC': { market: 'Korea', group: 'SAFETY' }, 'PSE': { market: 'Japan', group: 'SAFETY' },
  'RCM': { market: 'Australia / NZ', group: 'SAFETY' },
  'UN38.3': { market: 'Battery: safe to ship', group: 'BATTERY' }, 'IEC 62133': { market: 'Battery: safety standard', group: 'BATTERY' },
  'UL1642': { market: 'Battery cell: UL', group: 'BATTERY' },
}

export const CertMarks = {
  info(mark: string): Mark { return MARKS[mark] ?? { market: '', group: 'SAFETY' } },
  /** Regions a rep works in -> marks that matter there (used to highlight "valid in your region"). */
  marksForRegion(region: string): Set<string> {
    const r = region.toLowerCase()
    if (r.startsWith('usa')) return new Set(['ETL', 'UL', 'cTUVus', 'cSGSus', 'cMETus', 'FCC'])
    if (r.includes('canada')) return new Set(['cETL', 'CSA', 'cTUVus', 'cSGSus', 'cMETus', 'NRCan'])
    if (r.includes('mexico')) return new Set(['NOM'])
    if (r.includes('europe')) return new Set(['CE', 'RoHS', 'CB'])
    if (r.includes('south america')) return new Set(['INMETRO', 'CB'])
    if (r.includes('asia')) return new Set(['CB', 'KC', 'PSE'])
    if (r.includes('oceania')) return new Set(['RCM', 'CB'])
    return new Set()
  },
}

const INDEX_KEY = 'docs_index'

/** Java's String.hashCode as hex, so file names match the Android scheme. */
function javaHashHex(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(16)
}
const safeBase = (d: DocInfo) => d.id.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60) + '_' + javaHashHex(d.id)

export const mimeOf = (name: string): string => {
  switch (name.substring(name.lastIndexOf('.') + 1).toLowerCase()) {
    case 'pdf': return 'application/pdf'
    case 'doc': return 'application/msword'
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case 'xls': return 'application/vnd.ms-excel'
    case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    case 'jpg': case 'jpeg': return 'image/jpeg'
    case 'png': return 'image/png'
    default: return 'application/octet-stream'
  }
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export type DocFetch = { ok: true; blob: Blob; mime: string; fileName: string } | { ok: false; reason: string }

/**
 * Documents list (from the team script, cached in the browser so it works offline at shows) and the files
 * themselves, saved in IndexedDB once opened.
 */
export const DocsRepository = {
  docs: new Store<DocInfo[]>([]),
  certs: new Store<Record<string, CertInfo>>({}),

  init() {
    try { const s = ls.get(INDEX_KEY); if (s) DocsRepository.parse(JSON.parse(s)) } catch { /* ignore */ }
  },

  forProduct(id: string): DocInfo[] { return DocsRepository.docs.get().filter(d => d.products.includes(id)) },
  certsFor(id: string): CertInfo { return DocsRepository.certs.get()[id] ?? { certified: [], tested: [] } },

  /** Downloads the latest list. Offline: keeps the saved one. */
  async refresh(): Promise<TeamResult> {
    const [r, json] = await TeamSync.listDocs()
    if (r.kind === 'ok' && json && 'docs' in json) {
      DocsRepository.parse(json)
      ls.set(INDEX_KEY, JSON.stringify(json))
    }
    return r
  },

  parse(j: Record<string, unknown>) {
    const list = (a: unknown) => Array.isArray(a) ? a.map(x => String(x ?? '')).filter(s => s.trim() !== '') : []
    const arr = Array.isArray(j.docs) ? (j.docs as Record<string, unknown>[]) : []
    DocsRepository.docs.set(arr.filter(o => o && typeof o === 'object').map(o => ({
      id: String(o.id ?? ''), products: list(o.products), type: String(o.type ?? ''), title: String(o.title ?? ''), marks: list(o.marks),
      issuer: String(o.issuer ?? ''), date: String(o.date ?? ''), language: String(o.language ?? ''), share: o.share === true, fileName: String(o.fileName ?? ''),
    })))
    const c = (j.certs && typeof j.certs === 'object' ? j.certs : {}) as Record<string, { certified?: unknown; tested?: unknown }>
    DocsRepository.certs.set(Object.fromEntries(Object.keys(c).map(k => [k, { certified: list(c[k]?.certified), tested: list(c[k]?.tested) }])))
  },

  /** The saved copy in this browser, or undefined if it hasn't been downloaded yet. */
  async localCopy(doc: DocInfo): Promise<{ blob: Blob; fileName: string } | undefined> {
    return idb.get<{ blob: Blob; fileName: string }>('doc:' + safeBase(doc))
  },

  /** Returns the saved copy, or downloads it through the team script (which checks the Access column again). */
  async fetch(doc: DocInfo): Promise<DocFetch> {
    const local = await DocsRepository.localCopy(doc)
    if (local) return { ok: true, blob: local.blob, mime: local.blob.type || mimeOf(local.fileName), fileName: local.fileName }
    const [r, json] = await TeamSync.docFile(doc.id)
    if (r.kind !== 'ok' || !json) return { ok: false, reason: r.kind === 'failed' ? r.reason : 'Not available' }
    try {
      const fileName = String(json.fileName ?? '') || doc.fileName
      const mime = String(json.mimeType ?? '') || mimeOf(fileName)
      const blob = base64ToBlob(String(json.data ?? ''), mime)
      await idb.set('doc:' + safeBase(doc), { blob, fileName })
      return { ok: true, blob, mime, fileName }
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : "Couldn't save the file" }
    }
  },
}

export const useDocs = () => useStore(DocsRepository.docs)
export const useCerts = () => useStore(DocsRepository.certs)
