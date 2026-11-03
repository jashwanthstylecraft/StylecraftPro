import { useEffect, useMemo, useRef, useState } from 'react'
import './catalog.css'
import './search.css'
import { Category, Product, categoryLabel, categoryPlural, isIron, isStylecraft } from '../data/product'
import { Accessory, AccessoryType, accessoryIsOwnBrand, accessoryIsStylecraft, accessoryTypeLabel, accessoryTypePlural, useAccessories } from '../data/accessory'
import { useProducts } from '../data/repository'
import { Brand, Field, Pill, ProductImage, ScreenHeader, Spinner } from '../ui/Common'
import { Icon } from '../ui/icons'
import { AccessoryCard } from './AccessoriesScreen'
import { staggerStyle } from '../ui/Motion'
import { t, useLang } from '../ui/i18n'

const AccessoryAccent = '#B388FF'

// ---------------------------------------------------------------- SmartSearch

/**
 * Understands everyday searches across products and accessories, e.g.
 * "cordless clipper under $150", "usb-c trimmer", "wahl blade", "brushless", "andis shaver".
 */
export interface SmartQuery {
  categories: Set<Category>
  accessoryTypes: Set<AccessoryType>
  brands: Set<string>
  maxPrice: number | null
  minPrice: number | null
  cordless: boolean | null
  usbC: boolean
  motorWords: string[]
  words: string[]
  /** Human-readable list of what was understood, shown as chips. */
  understood: string[]
}

const onlyAccessories = (q: SmartQuery) => q.accessoryTypes.size > 0 && q.categories.size === 0
const onlyProducts = (q: SmartQuery) => q.categories.size > 0 && q.accessoryTypes.size === 0

const CATEGORY_WORDS: [Category, string[]][] = [
  ['CLIPPER', ['clipper', 'clippers', 'maquina', 'máquina', 'maquinas', 'máquinas', 'cortadora']],
  ['TRIMMER', ['trimmer', 'trimmers', 'trimer', 'patillera', 'perfiladora', 'liner', 'outliner']],
  ['SHAVER', ['shaver', 'shavers', 'foil', 'afeitadora', 'rasuradora']],
  ['DRYER', ['dryer', 'dryers', 'secador', 'secadora', 'blowdryer']],
  ['STRAIGHTENER', ['straightener', 'straighteners', 'flatiron', 'flatirons', 'plancha', 'planchas', 'alisadora', 'alisadoras']],
  ['CURLING_IRON', ['curling', 'curler', 'curlers', 'wand', 'wands', 'marcel', 'rizador', 'rizadores', 'rizadora', 'tenaza', 'tenazas']],
]
const ACCESSORY_WORDS: [AccessoryType, string[]][] = [
  ['BLADE', ['blade', 'blades', 'cuchilla', 'cuchillas', 'cutter', 'cutters', 'foils', 'head']],
  ['GUARD', ['guard', 'guards', 'comb', 'combs', 'guía', 'guia', 'guias', 'guías', 'peine', 'peines']],
  ['CAPE', ['cape', 'capes', 'capa', 'capas']],
  ['OTHER', ['charger', 'base', 'dock', 'oil', 'aceite', 'spray', 'case', 'estuche']],
]
const MOTOR_VOCABULARY = ['brushless', 'magnetic', 'rotary', 'vector', 'in2', 'pivot', 'dc', 'torque', 'c4rbn', 'carbon', 'digital']
const FILLERS = new Set(['a', 'the', 'for', 'with', 'and', 'de', 'con', 'para', 'y', 'el', 'la', 'los', 'las', 'una', 'un', 'me', 'show', 'find', 'busca', 'muestra'])

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Literal replace of every occurrence (Kotlin String.replace). */
const replaceAllLiteral = (text: string, find: string, by: string) => text.split(find).join(by)

export function parseSmartQuery(raw: string, brandsKnown: Iterable<string>): SmartQuery {
  let text = raw.toLowerCase().trim()
  const understood: string[] = []
  let maxPrice: number | null = null
  let minPrice: number | null = null

  const maxM = /(?:under|below|less than|max|menos de|<)\s*\$?\s*(\d+(?:\.\d+)?)/.exec(text)
  if (maxM) { maxPrice = parseFloat(maxM[1]); understood.push(`≤ $${maxM[1]}`); text = replaceAllLiteral(text, maxM[0], ' ') }
  const minM = /(?:over|above|more than|min|más de|mas de|>)\s*\$?\s*(\d+(?:\.\d+)?)/.exec(text)
  if (minM) { minPrice = parseFloat(minM[1]); understood.push(`≥ $${minM[1]}`); text = replaceAllLiteral(text, minM[0], ' ') }

  let usbC = false
  const usbM = /usb[ -]?c|type[ -]?c|tipo[ -]?c/.exec(text)
  if (usbM) { usbC = true; understood.push('USB-C'); text = replaceAllLiteral(text, usbM[0], ' ') }

  let cordless: boolean | null = null
  if (/\bcordless\b|\binal[aá]mbric[ao]s?\b|\bbattery\b|\bbater[ií]a\b/.test(text)) { cordless = true; understood.push('Cordless') }
  else if (/\bcorded\b|\bcon cable\b/.test(text)) { cordless = false; understood.push('Corded') }
  text = text.replace(/\bcordless\b|\binal[aá]mbric[ao]s?\b|\bbattery\b|\bbater[ií]a\b|\bcorded\b|\bcon cable\b/g, ' ')

  const brands = new Set<string>()
  for (const b of brandsKnown) {
    const key = b.toLowerCase().trim().replace(/ professional$/, '')
    if (key === '') continue
    const variants = [...new Set([key, key.replace(/\+/g, ' plus'), key.replace(/\+/g, 'plus'), key.replace(/babylisspro/g, 'babyliss')])]
    // escape: brand names come from the online sheet and may contain . + ( ) etc.
    const pattern = (v: string) => new RegExp('(?<![\\p{L}\\p{N}])' + escapeRegex(v) + '(?![\\p{L}\\p{N}])', 'gu')
    const hit = variants.find(v => pattern(v).test(text))
    if (hit !== undefined) {
      brands.add(b); understood.push(b); text = text.replace(pattern(hit), ' ')
    }
  }

  // two-word product names become one token so "flat iron" and "curling iron" don't split up
  text = text.replace(/\bflat[ -]?irons?\b/g, ' flatiron ').replace(/\bcurling (irons?|wands?)\b/g, ' curling ').replace(/\bplanchas? de pelo\b/g, ' plancha ')
  const tokens = text.split(/[^\p{L}\p{N}.$-]+/u).filter(s => s.trim() !== '')
  const categories = new Set<Category>()
  const accTypes = new Set<AccessoryType>()
  const motor: string[] = []
  const words: string[] = []
  for (const tk of tokens) {
    const cat = CATEGORY_WORDS.find(([, ws]) => ws.includes(tk))?.[0]
    const acc = ACCESSORY_WORDS.find(([, ws]) => ws.includes(tk))?.[0]
    if (cat) { categories.add(cat); understood.push(categoryPlural(cat)) }
    else if (acc) { accTypes.add(acc); understood.push(accessoryTypePlural(acc)) }
    else if (MOTOR_VOCABULARY.includes(tk)) { motor.push(tk); understood.push(tk.charAt(0).toUpperCase() + tk.slice(1)) }
    else if (FILLERS.has(tk)) { /* ignore */ }
    else words.push(tk)
  }
  return { categories, accessoryTypes: accTypes, brands, maxPrice, minPrice, cordless, usbC, motorWords: motor, words, understood: [...new Set(understood)] }
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const has = (s: string | null | undefined, sub: string) => s != null && s.toLowerCase().includes(sub.toLowerCase())

function productText(p: Product): string {
  return [p.name, p.brand, p.model, p.motorType, p.chargingPort, p.guards, p.ions].filter((x): x is string => x != null)
    .concat(p.features).concat(p.upc).join(' ').toLowerCase()
}

export function searchProducts(q: SmartQuery, all: Product[]): Product[] {
  if (onlyAccessories(q)) return []
  return all.filter(p =>
    (q.categories.size === 0 || q.categories.has(p.category)) &&
    (q.brands.size === 0 || q.brands.has(p.brand)) &&
    (q.maxPrice == null || (p.priceUsd != null && p.priceUsd <= q.maxPrice)) &&
    (q.minPrice == null || (p.priceUsd != null && p.priceUsd >= q.minPrice)) &&
    (!q.usbC || has(p.chargingPort, 'usb-c') || has(p.chargingPort, 'usb c')) &&
    (q.cordless === true
      ? p.category !== 'DRYER' && (p.chargingPort != null
        ? p.chargingPort.toLowerCase() !== 'corded' && (!isIron(p.category) || p.chargingPort.toLowerCase().includes('cordless') || p.chargingPort.toLowerCase().includes('usb'))
        : !isIron(p.category))
      : q.cordless === false
        ? p.category === 'DRYER' || has(p.chargingPort, 'corded') || (isIron(p.category) && p.chargingPort == null)
        : true) &&
    q.motorWords.every(w => has(p.motorType, w) || p.features.some(f => has(f, w))) &&
    q.words.every(w => productText(p).includes(w)),
  ).sort((a, b) =>
    (Number(!isStylecraft(a)) - Number(!isStylecraft(b))) || (Number(a.brand !== 'Gamma+') - Number(b.brand !== 'Gamma+')) ||
    cmp(a.brand, b.brand) || cmp(a.name, b.name))
}

export function searchAccessories(q: SmartQuery, all: Accessory[]): Accessory[] {
  if (onlyProducts(q) || q.cordless != null || q.usbC || q.motorWords.length > 0) return []
  return all.filter(a =>
    (q.accessoryTypes.size === 0 || q.accessoryTypes.has(a.type)) &&
    (q.brands.size === 0 || q.brands.has(a.brand)) &&
    (q.maxPrice == null || (a.priceUsd != null && a.priceUsd <= q.maxPrice)) &&
    (q.minPrice == null || (a.priceUsd != null && a.priceUsd >= q.minPrice)) &&
    q.words.every(w => [a.name, a.brand, a.model, a.material, a.size, a.fitsText].filter((x): x is string => x != null).join(' ').toLowerCase().includes(w)),
  ).sort((a, b) =>
    (Number(!accessoryIsStylecraft(a)) - Number(!accessoryIsStylecraft(b))) || (Number(!accessoryIsOwnBrand(a)) - Number(!accessoryIsOwnBrand(b))) ||
    cmp(a.brand, b.brand) || cmp(a.name, b.name))
}

// ---------------------------------------------------------------- screen

const EXAMPLES = ['cordless clipper under $200', 'usb-c trimmer', 'brushless', 'wahl blade', 'andis shaver', 'dryer under $100', 'magnetic guards']

/** One search box for every product and accessory. */
export function SearchScreen({ initial, onBack, onOpenProduct, onOpenAccessory }: {
  initial: string
  onBack: () => void
  onOpenProduct: (p: Product) => void
  onOpenAccessory: (a: Accessory) => void
}) {
  useLang()
  const products = useProducts()
  const accessories = useAccessories()
  const [query, setQuery] = useState(initial)
  const brands = useMemo(() => [...new Set([...products.map(p => p.brand), ...accessories.map(a => a.brand)])], [products, accessories])
  const parsed = useMemo(() => parseSmartQuery(query, brands), [query, brands])
  const pResults = useMemo(() => (query.trim() === '' ? [] : searchProducts(parsed, products)), [parsed, products, query])
  const aResults = useMemo(() => (query.trim() === '' ? [] : searchAccessories(parsed, accessories)), [parsed, accessories, query])
  const fieldRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (initial.trim() === '') fieldRef.current?.querySelector('input')?.focus() }, [initial])
  const blank = query.trim() === ''

  return (
    <div className="screen">
      <ScreenHeader title={t('SEARCH')} subtitle={blank ? t('PRODUCTS & ACCESSORIES') : `${pResults.length + aResults.length} ` + t('RESULTS')} onBack={onBack} />
      <div className="srch-field" ref={fieldRef}>
        <Field value={query} onChange={setQuery} placeholder={t('Try: cordless clipper under $200')} icon={<Icon name="search" />}
          trailing={query !== '' ? <button className="icon-btn" onClick={() => setQuery('')} aria-label="Clear"><Icon name="close" /></button> : undefined} />
      </div>

      {/* What the search understood */}
      {parsed.understood.length > 0 && (
        <div className="srch-chips">
          {parsed.understood.map(u => <Pill key={u} text={t(u)} color={Brand.Lime} />)}
        </div>
      )}

      {blank ? (
        <div className="scroll">
          <div className="srch-try">{t('TRY')}</div>
          {EXAMPLES.map((ex, i) => (
            <div key={ex} className="stagger" style={staggerStyle(i, 40)}>
              <button className="srch-example" onClick={() => setQuery(ex)}>{`⌕  ${ex}`}</button>
            </div>
          ))}
        </div>
      ) : pResults.length === 0 && aResults.length === 0 ? (
        <div className="srch-empty">{t('Nothing matches. Try fewer words.')}</div>
      ) : (
        <div className="scroll">
          <div className="srch-grid">
            {pResults.length > 0 && (
              <>
                <div className="srch-head" style={{ color: Brand.Cyan }}>{t('PRODUCTS') + ` (${pResults.length})`}</div>
                {pResults.map((p, i) => (
                  <div key={'p_' + p.id} className="stagger" style={staggerStyle(i % 10, 45)}>
                    <SearchProductCard p={p} onClick={() => onOpenProduct(p)} />
                  </div>
                ))}
              </>
            )}
            {aResults.length > 0 && (
              <>
                <div className="srch-head" style={{ color: AccessoryAccent, paddingTop: 8 }}>{t('ACCESSORIES') + ` (${aResults.length})`}</div>
                {aResults.map((a, i) => (
                  <div key={'a_' + a.id} className="stagger" style={staggerStyle(i % 10, 45)}>
                    <AccessoryCard item={a} onClick={() => onOpenAccessory(a)} />
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SearchProductCard({ p, onClick }: { p: Product; onClick: () => void }) {
  const line = [p.motorType, p.chargingPort].filter(Boolean).join(' · ')
  return (
    <button className="srch-card bounce" onClick={onClick}>
      <div className="cat-photo">
        <div className="fit"><ProductImage product={p} /></div>
        {p.priceUsd != null && <div className="cat-price">${p.priceUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>}
      </div>
      <div className="cat-info">
        <div className="cat-brand" style={{ color: isStylecraft(p) ? Brand.Red : Brand.Cyan }}>{p.brand.toUpperCase() + ' · ' + t(categoryLabel(p.category)).toUpperCase()}</div>
        <div className="cat-name">{p.name}</div>
        {line !== '' && <div className="srch-line">{line}</div>}
      </div>
    </button>
  )
}

// Local copy of the accessory card (AccessoriesScreen.tsx belongs to another screen group).
