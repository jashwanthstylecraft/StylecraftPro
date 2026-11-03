import { CSSProperties, useEffect, useRef, useState } from 'react'
import { useAnimatedNumber } from './Motion'

/** Measures an element so canvas-like SVG drawing can use real pixel sizes (like Compose's Canvas size). */
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current; if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

type Stop = [number, [number, number, number]]
const CYAN: [number, number, number] = [0x00, 0xe5, 0xff]
const LIME: [number, number, number] = [0xcc, 0xff, 0x00]
const RED: [number, number, number] = [0xff, 0x17, 0x44]

/** Compose Brush.sweepGradient color at a fraction (0..1) of a full turn. */
function sweepColor(stops: Stop[], f: number): string {
  let color = stops[0][1]
  if (f <= stops[0][0]) color = stops[0][1]
  else if (f >= stops[stops.length - 1][0]) color = stops[stops.length - 1][1]
  else {
    for (let i = 0; i < stops.length - 1; i++) {
      const [f0, c0] = stops[i], [f1, c1] = stops[i + 1]
      if (f >= f0 && f <= f1) {
        const k = (f - f0) / (f1 - f0)
        color = [0, 1, 2].map(j => Math.round(c0[j] + (c1[j] - c0[j]) * k)) as [number, number, number]
        break
      }
    }
  }
  return `rgb(${color[0]},${color[1]},${color[2]})`
}

const rad = (d: number) => (d * Math.PI) / 180
function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const x0 = cx + r * Math.cos(rad(a0)), y0 = cy + r * Math.sin(rad(a0))
  const x1 = cx + r * Math.cos(rad(a1)), y1 = cy + r * Math.sin(rad(a1))
  return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`
}

/** Arc from 135 deg sweeping [sweep] deg, drawn in small segments colored by a sweep gradient. */
function GradientArc({ cx, cy, r, sweep, stroke, stops }: { cx: number; cy: number; r: number; sweep: number; stroke: number; stops: Stop[] }) {
  if (sweep <= 0) return null
  const step = 3
  const segs: JSX.Element[] = []
  for (let a = 0; a < sweep; a += step) {
    const a1 = Math.min(a + step + 0.6, sweep)
    const mid = (135 + (a + a1) / 2) % 360
    segs.push(<path key={a} d={arcPath(cx, cy, r, 135 + a, 135 + a1)} fill="none" strokeWidth={stroke} stroke={sweepColor(stops, mid / 360)} />)
  }
  const capAt = (a: number) => {
    const ang = rad(135 + a), col = sweepColor(stops, ((135 + a) % 360) / 360)
    return <circle cx={cx + r * Math.cos(ang)} cy={cy + r * Math.sin(ang)} r={stroke / 2} fill={col} />
  }
  return <g>{segs}{capAt(0)}{capAt(sweep)}</g>
}

function Ticks({ cx, cy, r, count, stepDeg, inner, outer, width, opacity }: {
  cx: number; cy: number; r: number; count: number; stepDeg: number; inner: number; outer: number; width: number; opacity: number
}) {
  return <>{Array.from({ length: count }, (_, i) => {
    const a = rad(135 + i * stepDeg)
    return <line key={i} x1={cx + (r - inner) * Math.cos(a)} y1={cy + (r - inner) * Math.sin(a)} x2={cx + (r - outer) * Math.cos(a)} y2={cy + (r - outer) * Math.sin(a)}
      stroke="#fff" strokeOpacity={opacity} strokeWidth={width} />
  })}</>
}

/** Speed Analyzer gauge, 0..120,000 RPM (UltraGauge.kt). Give it a size via style / className. */
export function UltraGauge({ rpm, maxRpm = 120000, style }: { rpm: number; maxRpm?: number; style?: CSSProperties }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>()
  const animated = useAnimatedNumber(rpm, 300)
  const r = Math.min(w, h) / 2.2, cx = w / 2, cy = h / 2
  const sweep = Math.min(Math.max((animated / maxRpm) * 270, 0), 270)
  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}>
      <svg width={w} height={h} style={{ position: 'absolute', inset: 0 }} aria-hidden>
        {w > 0 && <>
          <path d={arcPath(cx, cy, r, 135, 405 - 0.01)} fill="none" stroke="#000" strokeOpacity={0.5} strokeWidth={30} strokeLinecap="round" />
          <GradientArc cx={cx} cy={cy} r={r} sweep={sweep} stroke={30} stops={[[0, CYAN], [0.3, LIME], [0.8, RED]]} />
          {/* Major ticks: inner = r-50 .. outer = r-10 */}
          {Array.from({ length: 13 }, (_, i) => {
            const a = rad(135 + i * 22.5)
            return <line key={i} x1={cx + (r - 50) * Math.cos(a)} y1={cy + (r - 50) * Math.sin(a)} x2={cx + (r - 10) * Math.cos(a)} y2={cy + (r - 10) * Math.sin(a)}
              stroke="#fff" strokeOpacity={0.4} strokeWidth={3} />
          })}
        </>}
      </svg>
      <div className="col" style={{ alignItems: 'center', position: 'relative' }}>
        <div style={{ fontSize: 48, fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>{rpm.toLocaleString('en-US')}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'gray' }}>RPM</div>
      </div>
    </div>
  )
}

/** Gauge for clippers, 0..15,000 RPM (ImpactGauge.kt). */
export function ImpactGauge({ rpm, maxRpm = 15000, style }: { rpm: number; maxRpm?: number; style?: CSSProperties }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>()
  const animated = useAnimatedNumber(rpm, 300)
  const r = Math.min(w, h) / 2.2, cx = w / 2, cy = h / 2
  const sweep = Math.min(Math.max((animated / maxRpm) * 270, 0), 270)
  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}>
      <svg width={w} height={h} style={{ position: 'absolute', inset: 0 }} aria-hidden>
        {w > 0 && <>
          <path d={arcPath(cx, cy, r, 135, 405 - 0.01)} fill="none" stroke="#1A1A1A" strokeWidth={40} strokeLinecap="round" />
          <GradientArc cx={cx} cy={cy} r={r} sweep={sweep} stroke={40} stops={[[0, CYAN], [0.5, LIME], [1, RED]]} />
          <Ticks cx={cx} cy={cy} r={r} count={11} stepDeg={27} inner={60} outer={20} width={4} opacity={0.5} />
        </>}
      </svg>
      <div className="col" style={{ alignItems: 'center', position: 'relative' }}>
        <div style={{ fontSize: 56, fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>{rpm}</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'gray' }}>RPM</div>
      </div>
    </div>
  )
}
