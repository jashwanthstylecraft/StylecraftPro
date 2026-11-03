import { CSSProperties, ReactNode, useMemo } from 'react'

const CYAN = '#00E5FF', RED = '#FF1744'

/** Two quarter-circle arcs rotating around the center (RotatingScannerRing). Size it with style/width. */
export function RotatingScannerRing({ size = 200, style }: { size?: number; style?: CSSProperties }) {
  const r = size / 2 - 1
  const c = size / 2
  const arc = (a0: number) => {
    const rad = (d: number) => (d * Math.PI) / 180
    const x0 = c + r * Math.cos(rad(a0)), y0 = c + r * Math.sin(rad(a0))
    const x1 = c + r * Math.cos(rad(a0 + 90)), y1 = c + r * Math.sin(rad(a0 + 90))
    return `M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}`
  }
  return (
    <svg className="scanner-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={style} aria-hidden>
      <path d={arc(0)} fill="none" stroke={CYAN} strokeOpacity={0.3} strokeWidth={2} />
      <path d={arc(180)} fill="none" stroke={CYAN} strokeOpacity={0.3} strokeWidth={2} />
    </svg>
  )
}

/** HUD label with a value, optional sub value and a decorative angled line (DataCallout). */
export function DataCallout({ label, value, subValue, alignRight = false, style }: {
  label: string; value: string; subValue?: string | null; alignRight?: boolean; style?: CSSProperties
}) {
  const d = alignRight ? 'M100 0 L80 15 L0 15' : 'M0 0 L20 15 L100 15'
  return (
    <div className="hud-callout col" style={{ alignItems: alignRight ? 'flex-end' : 'flex-start', ...style }}>
      <div style={{ color: CYAN, fontSize: 12, fontWeight: 900, letterSpacing: 1 }}>{label}</div>
      {value !== '' && <div style={{ color: '#fff', fontSize: 18, fontWeight: 800 }}>{value}</div>}
      {subValue != null && <div style={{ color: 'gray', fontSize: 9, fontWeight: 700, textAlign: alignRight ? 'right' : 'left' }}>{subValue}</div>}
      <svg width={100} height={20} viewBox="0 0 100 20" aria-hidden>
        <path d={d} fill="none" stroke={CYAN} strokeOpacity={0.5} strokeWidth={1} />
      </svg>
    </div>
  )
}

function HexIcon({ children }: { children: ReactNode }) {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (i * 60 * Math.PI) / 180
    return `${18 + 18 * Math.cos(a)},${18 + 18 * Math.sin(a)}`
  }).join(' ')
  return (
    <div style={{ position: 'relative', width: 36, height: 36, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
      <svg width={36} height={36} viewBox="0 0 36 36" style={{ position: 'absolute', inset: 0 }} aria-hidden>
        <polygon points={pts} fill="none" stroke={RED} strokeWidth={1} />
      </svg>
      <div style={{ width: 16, height: 16, display: 'flex' }}>{children}</div>
    </div>
  )
}

/** Hexagon icon + label/value (HexIconItem). Pass an <Icon/> (or any 16px element) as `icon`. */
export function HexIconItem({ label, value, icon, alignRight = false, style }: {
  label: string; value: string; icon: ReactNode; alignRight?: boolean; style?: CSSProperties
}) {
  const text = (
    <div className="col" style={{ alignItems: alignRight ? 'flex-end' : 'flex-start', minWidth: 0 }}>
      <div style={{ color: RED, fontSize: 11, fontWeight: 900, letterSpacing: 0.5, textAlign: alignRight ? 'right' : 'left' }}>{label.toUpperCase()}</div>
      <div className="ellipsis" style={{ color: '#fff', fontSize: 14, fontWeight: 700, textAlign: alignRight ? 'right' : 'left' }}>{value}</div>
    </div>
  )
  return (
    <div className="row" style={{ padding: '4px 0', width: 140, justifyContent: alignRight ? 'flex-end' : 'flex-start', gap: 6, ...style }}>
      {alignRight ? <>{text}<HexIcon>{icon}</HexIcon></> : <><HexIcon>{icon}</HexIcon>{text}</>}
    </div>
  )
}

/** 15 small dots drifting outward from the center and fading (EnergyParticleSystem). Put inside a position:relative box. */
export function EnergyParticleSystem({ style }: { style?: CSSProperties }) {
  const particles = useMemo(() => Array.from({ length: 15 }, () => ({
    angle: Math.random() * 360, duration: 1500 + Math.random() * 2500,
  })), [])
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', ...style }} aria-hidden>
      {particles.map((p, i) => {
        const rad = (p.angle * Math.PI) / 180
        return <span key={i} className="particle" style={{
          ['--x0' as string]: `${20 * Math.cos(rad)}px`, ['--y0' as string]: `${20 * Math.sin(rad)}px`,
          ['--x1' as string]: `${180 * Math.cos(rad)}px`, ['--y1' as string]: `${180 * Math.sin(rad)}px`,
          ['--d' as string]: `${p.duration}ms`,
        }} />
      })}
    </div>
  )
}
