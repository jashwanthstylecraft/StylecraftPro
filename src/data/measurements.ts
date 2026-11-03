import { Store, ls, useStore } from './store'
import { Product } from './product'
import { speedClaim, checkClaim, claimIsRange } from './specs'
import { csvQuote, fmtDateTime } from './format'

/** One saved speed reading. */
export interface Measurement {
  productId: string
  rpm: number
  /** "CLIPPER" or "DRYER" (or "ANALYZER" for the power analyzer) */
  mode: string
  timestamp: number
  note?: string | null
  watts?: number | null
  amps?: number | null
  volts?: number | null
}

const KEY = 'measurements'

function load(): Measurement[] {
  try {
    const a = JSON.parse(ls.get(KEY) ?? '[]')
    return Array.isArray(a) ? a.map((o: Record<string, unknown>) => ({
      productId: String(o.productId), rpm: Number(o.rpm ?? 0), mode: String(o.mode ?? 'CLIPPER'), timestamp: Number(o.timestamp ?? 0),
      note: o.note == null ? null : String(o.note),
      watts: o.watts == null ? null : Number(o.watts), amps: o.amps == null ? null : Number(o.amps), volts: o.volts == null ? null : Number(o.volts),
    })) : []
  } catch { return [] }
}

/** Saved measurements, kept in localStorage. */
export const MeasurementStore = {
  all: new Store<Measurement[]>(load()),
  add(m: Measurement) { MeasurementStore.all.set([...MeasurementStore.all.get(), m]); save() },
  remove(m: Measurement) { MeasurementStore.all.set(MeasurementStore.all.get().filter(x => x !== m)); save() },
  forProduct(id: string): Measurement[] {
    return MeasurementStore.all.get().filter(m => m.productId === id).sort((a, b) => b.timestamp - a.timestamp)
  },
  /** All measurements as a spreadsheet-friendly CSV (for sharing / Excel). */
  toCsv(products: Product[]): string {
    const byId = new Map(products.map(p => [p.id, p]))
    let sb = 'Date,Brand,Product,Model,Mode,Measured RPM,Claimed RPM,Difference %,Volts,Amps,Watts,Note\n'
    ;[...MeasurementStore.all.get()].sort((a, b) => a.timestamp - b.timestamp).forEach(m => {
      const p = byId.get(m.productId)
      const claim = p ? speedClaim(p) : null
      const diff = claim && m.rpm > 0 ? checkClaim(claim, m.rpm).diffPct.toFixed(1) : ''
      sb += [
        fmtDateTime(m.timestamp), csvQuote(p?.brand), csvQuote(p?.name ?? m.productId), csvQuote(p?.model), m.mode,
        m.rpm > 0 ? String(m.rpm) : '', claim ? (claimIsRange(claim) ? `${claim.low}-${claim.high}` : String(claim.low)) : '', diff,
        m.volts ?? '', m.amps ?? '', m.watts ?? '', csvQuote(m.note),
      ].join(',') + '\n'
    })
    return sb
  },
}
function save() { ls.set(KEY, JSON.stringify(MeasurementStore.all.get())) }

export const useMeasurements = () => useStore(MeasurementStore.all)
