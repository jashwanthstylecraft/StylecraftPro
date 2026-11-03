import { CSSProperties, ReactNode, useEffect, useState } from 'react'
import { Category, Product, hasMotor } from '../data/product'
import { assetUrl } from '../data/repository'
import { t } from './i18n'
import { Icon } from './icons'

/** Brand colors (ui/Common.kt `Brand`). Same values as the CSS variables. */
export const Brand = {
  Cyan: '#00E5FF',
  Red: '#FF1744',
  Lime: '#CCFF00',
  Card: '#161616',
  CardBorder: 'rgba(255,255,255,0.10)',
  PhotoBackground: '#F2F2F2',
  Muted: '#9E9E9E',
}

// ---------------------------------------------------------------- images

/** Stylecraft's own line drawings (img/cat_*.png). */
export function categoryIconUrl(c: Category): string {
  const f: Record<Category, string> = {
    CLIPPER: 'cat_clipper', TRIMMER: 'cat_trimmer', SHAVER: 'cat_shaver', DRYER: 'cat_dryer', STRAIGHTENER: 'cat_straightener', CURLING_IRON: 'cat_curling',
  }
  return assetUrl(`img/${f[c]}.png`)
}

/** Category line drawing tinted like Compose's Icon(tint = ...). */
export function CategoryIcon({ category, size = 24, color = '#fff', style }: { category: Category; size?: number; color?: string; style?: CSSProperties }) {
  const url = categoryIconUrl(category)
  return (
    <span aria-hidden style={{
      display: 'inline-block', width: size, height: size, flex: '0 0 auto', backgroundColor: color,
      WebkitMaskImage: `url(${url})`, maskImage: `url(${url})`, WebkitMaskSize: 'contain', maskSize: 'contain',
      WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat', WebkitMaskPosition: 'center', maskPosition: 'center', ...style,
    }} />
  )
}

/** Images bundled in public/img (Android res/drawable). Add a file there and its name here to use it by name. */
const KNOWN_IMAGES = new Set([
  'bgapp', 'dcmotor', 'vmotor', 'logo', 'instinct_clipper_black', 'instinct_clipper_blue', 'instinct_clipper_red',
  'instinct_metal_white', 'rebel2_0_clipper_blue',
])

/** URL of a bundled image by its file name (e.g. "instinct_clipper_red"), or null when there is none. */
export function drawableUrl(name: string | null | undefined): string | null {
  if (!name || !name.trim()) return null
  return KNOWN_IMAGES.has(name) ? assetUrl(`img/${name}.${name === "logo" ? "png" : "webp"}`) : null
}

/** Model codes as resource names: "SC617B / SC617M" -> ["sc617b", "sc617m"]. */
export function modelResourceNames(p: Product): string[] {
  return (p.model ?? '').split(/[/,]/).map(s => s.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')).filter(s => s !== '' && /[a-z]/.test(s[0]))
}

/**
 * Photos bundled in the app for this product. Photos named after the model code win:
 * img/sc607m.png, sc607m_2.png ... sc607m_6.png (extra angles / colors). Register new names in KNOWN_IMAGES.
 */
export function localImageUrls(p: Product): string[] {
  const byModel = modelResourceNames(p).flatMap(base => [base, ...[2, 3, 4, 5, 6].map(i => `${base}_${i}`)]).map(drawableUrl).filter((u): u is string => !!u)
  const fromCatalog = p.localImages.map(drawableUrl).filter((u): u is string => !!u)
  return [...new Set([...byModel, ...fromCatalog])]
}

/** Which motor animation a product gets. */
export type MotorFamily = 'VECTOR' | 'DC' | 'NONE'

const DC_ANIMATION_CLIPPERS = /rebel|\bace\b|prot[eé]g[eé]|boosted|absolute alpha/
const isDcMotor = (m: string) => /\bdc\b/.test(m) || m.includes('torque') || m.includes('c4rbn') || m.includes('carbon') || m.includes('rotary') ||
  m.includes('supercharged') || m.includes('super charged')

/**
 * Stylecraft and Gamma+ clippers, trimmers and shavers:
 *  - IN2 / Vector motors use the Instinct vector-motor animation
 *  - DC-motor clippers Rebel, Rebel 2.0, Ace, Protégé, Boosted / Boosted Up and Absolute Alpha use the Rebel 2.0 animation
 * Brushless, magnetic, battery and dryers get no motor animation. Competitors never do.
 */
export function motorFamily(p: Product): MotorFamily {
  if (!hasMotor(p.category) || p.category === 'DRYER') return 'NONE'
  const brand = p.brand.toLowerCase()
  if (brand !== 'stylecraft' && brand !== 'gamma+') return 'NONE'
  const m = p.motorType?.toLowerCase()
  if (!m) return 'NONE'
  if (m.includes('brushless') || m.includes('magnetic') || m.includes('battery')) return 'NONE'
  if (m.includes('in2') || m.includes('vector')) return 'VECTOR'
  if (isDcMotor(m) && p.category === 'CLIPPER' && DC_ANIMATION_CLIPPERS.test(p.name.toLowerCase())) return 'DC'
  return 'NONE'
}

/** Motor picture for the animated motor section (vmotor = IN2, dcmotor = Rebel 2.0; <model>_motor wins). */
export function motorImageUrl(p: Product): string | null {
  const fam = motorFamily(p)
  if (fam === 'NONE') return null
  for (const n of modelResourceNames(p)) { const u = drawableUrl(`${n}_motor`); if (u) return u }
  return drawableUrl(fam === 'VECTOR' ? 'vmotor' : 'dcmotor')
}

/**
 * Product photo: uses a photo bundled in the app when there is one, otherwise loads the
 * online photo, otherwise shows the category icon.
 */
export function ProductImage({ product, variantIndex = 0, fit = 'contain', style, className }: {
  product: Product; variantIndex?: number; fit?: 'contain' | 'cover'; style?: CSSProperties; className?: string
}) {
  const local = localImageUrls(product)
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => { setFailed(false); setLoaded(false) }, [product.id])
  const box: CSSProperties = { width: '100%', height: '100%', position: 'relative', ...style }
  if (local.length > 0) {
    const i = ((variantIndex % local.length) + local.length) % local.length
    return <img className={className} src={local[i]} alt={product.name} style={{ ...box, objectFit: fit }} />
  }
  if (product.imageUrl && !failed) {
    return (
      <div className={className} style={{ ...box, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {!loaded && <div className="spinner" style={{ position: 'absolute' }} />}
        <img src={product.imageUrl} alt={product.name} loading="lazy" referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)} onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: fit, opacity: loaded ? 1 : 0 }} />
      </div>
    )
  }
  return <NoPhoto product={product} style={box} />
}

/** Shown instead of an empty space when a product has no photo (or it failed to load). */
export function NoPhoto({ product, style }: { product: Product; style?: CSSProperties }) {
  return (
    <div className="col center" style={{ ...style, textAlign: 'center' }}>
      <CategoryIcon category={product.category} size={56} color="#8A8A8A" />
      <div style={{ height: 6 }} />
      <div className="ellipsis" style={{ color: '#6E6E6E', fontSize: 12, fontWeight: 700, maxWidth: '100%' }}>{product.model?.split(' /')[0] ?? product.brand}</div>
      <div style={{ color: '#9E9E9E', fontSize: 10 }}>{t('Photo coming soon')}</div>
    </div>
  )
}

// ---------------------------------------------------------------- chrome

export function ScreenHeader({ title, subtitle, onBack, actions }: { title: string; subtitle?: string | null; onBack: (() => void) | null; actions?: ReactNode }) {
  return (
    <div className="header">
      {onBack ? (
        <button className="icon-btn" onClick={onBack} aria-label="Back"><Icon name="arrowBack" /></button>
      ) : <div className="header-spacer" />}
      <div className="grow">
        <h1 className="header-title ellipsis">{title}</h1>
        {subtitle != null && <div className="header-sub">{subtitle}</div>}
      </div>
      {actions}
    </div>
  )
}

export function Pill({ text, color = Brand.Cyan }: { text: string; color?: string }) {
  return <span className="pill" style={{ ['--c' as string]: color }}>{text}</span>
}

export function Spinner({ size = 22, color }: { size?: number; color?: string }) {
  return <div className="spinner" style={{ width: size, height: size, color }} />
}

/** Material-like outlined text field with a floating label. `icon` / `trailing` are optional adornments. */
export function Field({ label, value, onChange, type = 'text', icon, trailing, multiline, onEnter, autoComplete, inputMode, placeholder, disabled }: {
  label?: string; value: string; onChange: (v: string) => void; type?: string; icon?: ReactNode; trailing?: ReactNode; multiline?: boolean
  onEnter?: () => void; autoComplete?: string; inputMode?: 'text' | 'numeric' | 'tel' | 'email' | 'url' | 'decimal'; placeholder?: string; disabled?: boolean
}) {
  const common = {
    className: 'input' + (icon ? ' with-icon' : '') + (trailing ? ' with-trail' : ''),
    value, placeholder, disabled, autoComplete, inputMode,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
  }
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {icon && <span className="lead-icon">{icon}</span>}
      {multiline
        ? <textarea {...common} />
        : <input {...common} type={type} onKeyDown={e => { if (e.key === 'Enter') onEnter?.() }} />}
      {trailing && <span className="trail">{trailing}</span>}
    </div>
  )
}

/** Bottom sheet (ModalBottomSheet). Clicking the dark area closes it. */
export function BottomSheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  )
}

/** Centered dialog (AlertDialog). */
export function Dialog({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="backdrop center-dialog" onClick={onClose}>
      <div className="dialog" onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------- toasts / platform helpers

type ToastFn = (message: string) => void
let toastListener: ToastFn | null = null
/** Shows a short message at the bottom of the screen (Android Toast). Needs <ToastHost/> mounted (App does). */
export function showToast(message: string) { toastListener?.(message) }

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    let timer: number | undefined
    toastListener = m => { setMsg(m); window.clearTimeout(timer); timer = window.setTimeout(() => setMsg(null), 3000) }
    return () => { toastListener = null; window.clearTimeout(timer) }
  }, [])
  return msg ? <div className="toast" role="status">{msg}</div> : null
}

/** Opens a link in a new tab. */
export function openUrl(url: string | null | undefined) {
  if (!url || !url.trim()) return
  window.open(url, '_blank', 'noopener,noreferrer')
}

/** Short buzz (Android only in practice; iOS Safari ignores it). */
export function vibrateShort() {
  try { navigator.vibrate?.(60) } catch { /* ignore */ }
}
