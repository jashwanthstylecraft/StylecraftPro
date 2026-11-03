import { useEffect, useMemo, useState } from 'react'
import { CATEGORIES, Category, Product, categoryPlural } from '../data/product'
import { useProducts } from '../data/repository'
import { useMeasurements } from '../data/measurements'
import { Brand, BottomSheet, ProductImage, ScreenHeader, showToast } from '../ui/Common'
import { ProductPickerList } from '../ui/Pickers'
import { renderBenchmark, shareFile } from '../ui/share'
import { useIsTablet } from '../ui/adaptive'
import { Icon } from '../ui/icons'
import { t, tr } from '../ui/i18n'
import { DIcon } from './detailIcons'
import './benchmark.css'

export interface BenchmarkScreenProps {
  startCategory: Category | null | undefined
  startIds: string[]
  onBack: () => void
  onOpenProduct: (p: Product) => void
}

/** One thing that can be benchmarked, e.g. motor speed. [higherIsBetter] decides the sort order. */
export interface BenchMetric {
  key: string
  label: string
  unit: string
  higherIsBetter: boolean
  /** Brand claim. */
  claimed: (p: Product) => number | null
  /** Stylecraft's own measurement, when this metric can be measured (speed, noise, power). */
  measured?: (p: Product, local: Map<string, number>) => number | null
  format: (v: number) => string
}

const group0 = (v: number) => Math.round(v).toLocaleString('en-US')
function makeMetric(m: Omit<BenchMetric, 'format'>): BenchMetric {
  const format = (v: number) =>
    (m.unit === '$' ? '$' + group0(v) : m.unit === 'RPM' ? group0(v) : v % 1 === 0 ? group0(v) : v.toFixed(1)) +
    (m.unit === '$' || m.unit === '' ? '' : ' ' + m.unit)
  return { ...m, format }
}

const price = makeMetric({ key: 'price', label: 'Price', unit: '$', higherIsBetter: false, claimed: p => p.priceUsd })
const weight = makeMetric({ key: 'weight', label: 'Weight', unit: 'g', higherIsBetter: false, claimed: p => p.weightG })
const speed = makeMetric({
  key: 'rpm', label: 'Motor speed', unit: 'RPM', higherIsBetter: true, claimed: p => p.rpm,
  measured: (p, local) => p.measuredRpm ?? local.get(p.id) ?? null,
})
const noise = makeMetric({ key: 'noise', label: 'Noise', unit: 'dB', higherIsBetter: false, claimed: p => p.noiseDb, measured: p => p.measuredNoiseDb })
const power = makeMetric({ key: 'watts', label: 'Power', unit: 'W', higherIsBetter: true, claimed: p => p.wattage, measured: p => p.measuredWatts })

export const BenchMetrics = {
  forCategory(c: Category): BenchMetric[] {
    switch (c) {
      case 'CLIPPER': case 'TRIMMER': case 'SHAVER': return [
        speed,
        makeMetric({ key: 'runtime', label: 'Runtime', unit: 'min', higherIsBetter: true, claimed: p => p.runtimeMin }),
        makeMetric({ key: 'charge', label: 'Charge time', unit: 'min', higherIsBetter: false, claimed: p => p.chargeMin }),
        weight, noise, price,
      ]
      case 'DRYER': return [power, speed, makeMetric({ key: 'heat', label: 'Max heat', unit: '°C', higherIsBetter: true, claimed: p => p.maxHeatC }), weight, noise, price]
      default: return [
        makeMetric({ key: 'maxTemp', label: 'Max temperature', unit: '°F', higherIsBetter: true, claimed: p => p.maxTempF }),
        makeMetric({ key: 'heatUp', label: 'Heat-up time', unit: 's', higherIsBetter: false, claimed: p => p.heatUpSec }),
        makeMetric({ key: 'cord', label: 'Cord length', unit: 'ft', higherIsBetter: true, claimed: p => p.cordFt }),
        power, weight, price,
      ]
    }
  },
}

const isOwn = (p: Product) => ['stylecraft', 'gamma+'].includes(p.brand.toLowerCase())

/**
 * Benchmark up to 6 products of one category: vertical bars with each product's photo on top,
 * best first. Our products are red, competitors grey; "Not listed" when the brand doesn't publish it.
 */
export function BenchmarkScreen({ startCategory, startIds, onBack, onOpenProduct }: BenchmarkScreenProps) {
  const all = useProducts()
  const measurements = useMeasurements()
  const localRpm = useMemo(() => {
    const g = new Map<string, number[]>()
    measurements.filter(m => m.rpm > 0).forEach(m => g.set(m.productId, [...(g.get(m.productId) ?? []), m.rpm]))
    return new Map([...g].map(([id, l]) => [id, l.reduce((a, b) => a + b, 0) / l.length] as [string, number]))
  }, [measurements])

  const [category, setCategory] = useState<Category>(startCategory ?? 'CLIPPER')
  const metrics = useMemo(() => BenchMetrics.forCategory(category), [category])
  const [metricIndex, setMetricIndex] = useState(0)
  const metric = metrics[Math.min(Math.max(metricIndex, 0), metrics.length - 1)]
  const [useMeasured, setUseMeasured] = useState(false)
  const [picked, setPicked] = useState<string[]>(() => startIds.slice(0, 6))
  const [picking, setPicking] = useState(false)

  // Default lineup: our 3 most complete products + 3 competitors, when nothing was picked for this category
  useEffect(() => {
    if (all.length === 0) return  // catalog still loading: don't throw away the starting selection
    setPicked(prev => {
      const inCat = all.filter(p => p.category === category)
      if (prev.some(id => inCat.some(p => p.id === id))) return prev
      const m = BenchMetrics.forCategory(category)
      const score = (p: Product) => m.filter(x => x.claimed(p) != null).length
      const byScore = (a: Product, b: Product) => score(b) - score(a)
      const own = inCat.filter(isOwn).sort(byScore).slice(0, 3)
      const seen = new Set<string>()
      const others = inCat.filter(p => !isOwn(p)).sort(byScore).filter(p => !seen.has(p.brand) && !!seen.add(p.brand)).slice(0, 6 - own.length)
      return [...own, ...others].map(p => p.id)
    })
  }, [category, all])

  const products = picked.map(id => all.find(p => p.id === id)).filter((p): p is Product => !!p && p.category === category)
  const valueOf = (p: Product): number | null =>
    useMeasured && metric.measured ? metric.measured(p, localRpm) ?? metric.claimed(p) : metric.claimed(p)
  const rows: [Product, number | null][] = products.map(p => [p, valueOf(p)] as [Product, number | null])
    .sort((a, b) => (Number(a[1] == null) - Number(b[1] == null)) ||
      (a[1] == null || b[1] == null ? 0 : metric.higherIsBetter ? b[1] - a[1] : a[1] - b[1]))

  const share = async () => {
    try {
      const f = await renderBenchmark(rows, metric, tr(metric.label), tr(categoryPlural(category)), tr('Not listed'),
        useMeasured && metric.measured ? tr('Measured by Stylecraft') : tr('Brand claims'))
      await shareFile(f, tr('Benchmark'))
    } catch (e) { showToast(e instanceof Error && e.message ? e.message : 'Error') }
  }

  return (
    <div className="screen">
      <div className="scroll">
        <ScreenHeader title={t('BENCHMARK')} subtitle={t('Up to 6 products, same category')} onBack={onBack} />

        {/* Category */}
        <div className="chip-row">
          {CATEGORIES.map(c => (
            <button key={c} className={'chip' + (c === category ? ' selected-red' : '')}
              onClick={() => { if (c !== category) { setCategory(c); setPicked([]); setMetricIndex(0) } }}>
              {c === category && <Icon name="check" size={18} />}{t(categoryPlural(c))}
            </button>
          ))}
        </div>

        {/* Picked products */}
        <div className="row wrap" style={{ padding: '8px 16px', gap: 6 }}>
          {products.map(p => (
            <button key={p.id} className="chip selected" onClick={() => setPicked(l => l.filter(x => x !== p.id))}
              style={{ background: (isOwn(p) ? Brand.Red : '#808080') + '40' }}>
              <span className="ellipsis" style={{ maxWidth: 150 }}>{p.name}</span>
              <DIcon name="close" size={16} />
            </button>
          ))}
          {products.length < 6 && (
            <button className="chip" onClick={() => setPicking(true)}><DIcon name="add" size={16} />{t('ADD')}</button>
          )}
        </div>

        {/* Metric */}
        <div className="chip-row">
          {metrics.map((m, i) => (
            <button key={m.key} className={'chip' + (i === metricIndex ? ' selected-cyan' : '')} onClick={() => setMetricIndex(i)}>
              {i === metricIndex && <Icon name="check" size={18} />}{t(m.label)}
            </button>
          ))}
        </div>
        {metric.measured && (
          <label className="row" style={{ padding: '4px 16px', gap: 8, cursor: 'pointer' }}>
            <span className={'switch' + (useMeasured ? ' on' : '')} role="switch" aria-checked={useMeasured} tabIndex={0}
              onClick={e => { e.preventDefault(); setUseMeasured(v => !v) }}
              onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setUseMeasured(v => !v) } }}>
              <span className="thumb" />
            </span>
            <span style={{ color: '#fff', fontSize: 13 }}>
              {useMeasured ? t('Measured by Stylecraft (brand claim when not tested)') : t('Brand claims')}
            </span>
          </label>
        )}

        {/* Chart */}
        <div className="card" style={{ margin: 16, borderRadius: 18, padding: 16 }}>
          <div className="section-title" style={{ letterSpacing: 1 }}>
            {t(metric.label).toUpperCase() + '  ·  ' + (metric.higherIsBetter ? t('higher is better') : t('lower is better'))}
          </div>
          <div style={{ height: 12 }} />
          {rows.length === 0 ? <div className="muted">{t('Add products to compare.')}</div> : <BarChart rows={rows} metric={metric} onOpen={onOpenProduct} />}
        </div>

        <div style={{ padding: '0 16px' }}>
          <button className="btn btn-red btn-block" disabled={rows.length === 0} onClick={share} style={{ height: 52, borderRadius: 12 }}>
            <Icon name="share" color="#fff" />{t('SHARE AS IMAGE')}
          </button>
        </div>
        <div style={{ height: 40 }} />
      </div>

      {picking && (
        <BottomSheet onClose={() => setPicking(false)}>
          <ProductPickerList title={t('ADD TO BENCHMARK')} subtitle={`${products.length}/6`}
            products={all.filter(p => p.category === category && !picked.includes(p.id))}
            onPick={p => {
              const next = picked.length < 6 ? [...picked, p.id] : picked
              setPicked(next)
              if (next.length >= 6) setPicking(false)
            }} />
        </BottomSheet>
      )}
    </div>
  )
}

function BarChart({ rows, metric, onOpen }: { rows: [Product, number | null][]; metric: BenchMetric; onOpen: (p: Product) => void }) {
  const vals = rows.map(r => r[1]).filter((v): v is number => v != null)
  const max = vals.length && Math.max(...vals) > 0 ? Math.max(...vals) : 1
  // Taller bars on tablets, easy to show a customer across the table
  const chartH = useIsTablet() ? 340 : 220
  return (
    <div className="row" style={{ height: chartH + 150, gap: 6, alignItems: 'flex-end' }}>
      {rows.map(([p, v], i) => {
        const own = isOwn(p)
        const target = v == null ? 0.18 : Math.min(1, Math.max(0.06, v / max))
        return (
          <div key={p.id} className="grow col bounce bar-col" onClick={() => onOpen(p)} style={{ alignItems: 'center', justifyContent: 'flex-end' }}>
            <div style={{ color: v == null ? Brand.Muted : '#fff', fontSize: 11, fontWeight: 900, textAlign: 'center' }}>
              {v != null ? metric.format(v) : t('Not listed')}
            </div>
            <div style={{ height: 4 }} />
            {/* product photo sitting on top of its bar */}
            <div style={{
              width: 46, height: 46, borderRadius: '50%', background: Brand.PhotoBackground, padding: 4, flex: '0 0 auto',
              border: `2px solid ${own ? Brand.Red : '#808080'}`,
            }}><ProductImage product={p} /></div>
            <div style={{ height: 4 }} />
            <div className="bar" style={{
              width: '78%', height: chartH * target, transitionDelay: `${i * 70}ms`,
              ...(v == null
                ? { border: `1px solid ${Brand.Muted}`, borderBottom: 0 }
                : { background: own ? `linear-gradient(to bottom, #FF5252, ${Brand.Red})` : 'linear-gradient(to bottom, #9E9E9E, #616161)' }),
            }} />
            <div style={{ height: 6 }} />
            <div className="ellipsis" style={{ color: own ? Brand.Red : Brand.Muted, fontSize: 9, fontWeight: 900, maxWidth: '100%' }}>{p.brand}</div>
            <div className="bar-name">{p.name}</div>
          </div>
        )
      })}
    </div>
  )
}
