import { Store, ls, idb, useStore } from './store'
import { Product, displayName } from './product'
import { csvQuote, fmtDateTime, uuid } from './format'

export const LeadStatus = {
  NEW: 'New',
  EMAILED: 'Emailed',
  MEETING: 'Meeting scheduled',
  WON: 'Won',
  LOST: 'Lost',
  all: ['New', 'Emailed', 'Meeting scheduled', 'Won', 'Lost'],
}

/** A barber / shop that showed interest during a visit or at a show. */
export interface Lead {
  id: string
  name: string
  shop: string | null
  phone: string | null
  email: string | null
  city: string | null
  event: string | null
  /** Product ids from the catalog the barber liked. */
  productIds: string[]
  wantsVisit: boolean
  notes: string | null
  title: string | null
  website: string | null
  /** Event badge / registration number. */
  badgeId: string | null
  /** How it was captured: Badge, Business card, QR or Manual. */
  source: string | null
  /** New, Emailed, Meeting scheduled, Won, Lost. */
  status: string
  /** When the next follow-up (call / Google Meet) is planned. */
  followUpAt: number | null
  /** Last time the rep emailed or scheduled something. */
  lastContactAt: number | null
  timestamp: number
  /** True once it was sent to the team Google Sheet. */
  sent: boolean
  /** Last-modified time of the profile photo when it was last uploaded to the sheet (0 = never). */
  photoSyncedAt: number
}

/** New lead with the same defaults as the Kotlin data class. */
export function newLead(partial: Partial<Lead> & { name: string }): Lead {
  return {
    id: uuid(), shop: null, phone: null, email: null, city: null, event: null, productIds: [], wantsVisit: false, notes: null,
    title: null, website: null, badgeId: null, source: null, status: LeadStatus.NEW, followUpAt: null, lastContactAt: null,
    timestamp: Date.now(), sent: false, photoSyncedAt: 0, ...partial,
  }
}

export function leadToJson(l: Lead): Record<string, unknown> {
  return {
    id: l.id, name: l.name, shop: l.shop ?? '', phone: l.phone ?? '', email: l.email ?? '', city: l.city ?? '', event: l.event ?? '',
    productIds: l.productIds, wantsVisit: l.wantsVisit, notes: l.notes ?? '', timestamp: l.timestamp, sent: l.sent,
    title: l.title ?? '', website: l.website ?? '', badgeId: l.badgeId ?? '', source: l.source ?? '',
    status: l.status, followUpAt: l.followUpAt ?? 0, lastContactAt: l.lastContactAt ?? 0, photoSyncedAt: l.photoSyncedAt,
  }
}

export function leadFromJson(o: Record<string, unknown>): Lead {
  const s = (k: string) => { const v = String(o[k] ?? '').trim(); return v ? v : null }
  const n = (k: string) => { const v = Number(o[k] ?? 0); return v > 0 ? v : null }
  return {
    id: s('id') ?? uuid(), name: s('name') ?? '', shop: s('shop'), phone: s('phone'), email: s('email'), city: s('city'), event: s('event'),
    productIds: Array.isArray(o.productIds) ? (o.productIds as unknown[]).map(String) : [], wantsVisit: Boolean(o.wantsVisit),
    notes: s('notes'), title: s('title'), website: s('website'), badgeId: s('badgeId'), source: s('source'),
    status: s('status') ?? LeadStatus.NEW, followUpAt: n('followUpAt'), lastContactAt: n('lastContactAt'),
    timestamp: Number(o.timestamp ?? Date.now()), sent: Boolean(o.sent), photoSyncedAt: Number(o.photoSyncedAt ?? 0),
  }
}

const KEY = 'leads'
let syncing = false
function load(): Lead[] {
  try { const a = JSON.parse(ls.get(KEY) ?? '[]'); return Array.isArray(a) ? a.map(leadFromJson) : [] } catch { return [] }
}

interface PhotoRec { blob: Blob; modified: number }
const photoKey = (id: string) => 'lead_photo:' + id

function persist() { ls.set(KEY, JSON.stringify(LeadStore.all.get().map(leadToJson))) }

/** Reads an image blob, crops it to a centered square and scales it. */
async function squareJpeg(blob: Blob, side: number, quality: number): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(blob)
    const s = Math.min(bmp.width, bmp.height)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = side
    canvas.getContext('2d')!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, side, side)
    return await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', quality))
  } catch { return null }
}

const blobToBase64 = (b: Blob) => new Promise<string>((resolve, reject) => {
  const fr = new FileReader()
  fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '')
  fr.onerror = () => reject(fr.error)
  fr.readAsDataURL(b)
})

/** Leads saved in this browser (localStorage); profile photos live in IndexedDB. */
export const LeadStore = {
  all: new Store<Lead[]>(load()),

  save(lead: Lead) { LeadStore.all.set([...LeadStore.all.get().filter(l => l.id !== lead.id), lead]); persist() },
  remove(lead: Lead) { LeadStore.all.set(LeadStore.all.get().filter(l => l.id !== lead.id)); persist(); void idb.remove(photoKey(lead.id)) },
  findById(id: string): Lead | undefined { return LeadStore.all.get().find(l => l.id === id) },

  /** Saves a profile photo (any image blob) as a 640 px JPEG. */
  async savePhoto(id: string, image: Blob): Promise<void> {
    const small = await squareJpeg(image, 640, 0.85)
    if (small) await idb.set(photoKey(id), { blob: small, modified: Date.now() } satisfies PhotoRec)
  },
  /** Object URL of the photo (revoke when done) or null. */
  async photoUrl(id: string): Promise<string | null> {
    const r = await idb.get<PhotoRec>(photoKey(id))
    return r ? URL.createObjectURL(r.blob) : null
  },
  async hasPhoto(id: string): Promise<boolean> { return !!(await idb.get<PhotoRec>(photoKey(id))) },

  async markSent(ids: Collection): Promise<void> {
    const set = new Set(ids)
    const next: Lead[] = []
    for (const l of LeadStore.all.get()) {
      if (!set.has(l.id)) { next.push(l); continue }
      const r = await idb.get<PhotoRec>(photoKey(l.id))
      next.push({ ...l, sent: true, photoSyncedAt: r?.modified ?? l.photoSyncedAt })
    }
    LeadStore.all.set(next); persist()
  },

  /**
   * Sends leads that were captured offline (or failed to send) to the team sheet. Silent: nothing is shown on failure,
   * the leads stay unsent and are tried again next time. Returns how many were sent.
   */
  async syncPending(products: Product[], send: (leads: Lead[], products: Product[]) => Promise<{ kind: string }>): Promise<number> {
    if (syncing || (typeof navigator !== 'undefined' && navigator.onLine === false)) return 0
    const pending = LeadStore.all.get().filter(l => !l.sent)
    if (!pending.length) return 0
    syncing = true
    try {
      const r = await send(pending, products)
      if (r.kind !== 'ok') return 0
      await LeadStore.markSent(pending.map(l => l.id))
      return pending.length
    } catch { return 0 } finally { syncing = false }
  },

  /** A small JPEG (base64, 160 px) of the profile photo for the sheet, only if it changed since the last upload. */
  async photoForUpload(lead: Lead): Promise<string | null> {
    const r = await idb.get<PhotoRec>(photoKey(lead.id))
    if (!r || r.modified === lead.photoSyncedAt) return null
    const small = await squareJpeg(r.blob, 160, 0.8)
    return small ? blobToBase64(small) : null
  },

  /** Spreadsheet-friendly export (opens in Excel / Google Sheets). */
  toCsv(products: Product[]): string {
    const byId = new Map(products.map(p => [p.id, p]))
    let sb = 'Date,Name,Title,Shop,Phone,Email,Website,City,Event,Badge #,Captured by,Interested in,Wants visit/demo,Notes,Status,Follow-up,Last contact\n'
    ;[...LeadStore.all.get()].sort((a, b) => a.timestamp - b.timestamp).forEach(l => {
      sb += [
        fmtDateTime(l.timestamp), csvQuote(l.name), csvQuote(l.title), csvQuote(l.shop), csvQuote(l.phone), csvQuote(l.email),
        csvQuote(l.website), csvQuote(l.city), csvQuote(l.event), csvQuote(l.badgeId), csvQuote(l.source),
        csvQuote(l.productIds.map(id => byId.get(id)).filter((p): p is Product => !!p).map(displayName).join('; ')),
        l.wantsVisit ? 'Yes' : 'No', csvQuote(l.notes), csvQuote(l.status),
        l.followUpAt ? fmtDateTime(l.followUpAt) : '', l.lastContactAt ? fmtDateTime(l.lastContactAt) : '',
      ].join(',') + '\n'
    })
    return sb
  },
}
type Collection = Iterable<string>

export const useLeads = () => useStore(LeadStore.all)
