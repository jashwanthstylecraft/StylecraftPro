// Port of FamiliesScreen.kt (FamiliesScreen, FamilyScreen, MiniProductCard, ComboImage, ComboCard, ComboDetailScreen, FamilyAndCombosStrip)
import { CSSProperties, useEffect, useMemo, useState } from 'react'
import { Product, categoryLabel, categoryPlural } from '../data/product'
import { Combo, ComboRepository, Families, Family, comboIsStylecraft, familyKey, familyTitle, useCombos } from '../data/combo'
import { useProducts } from '../data/repository'
import { money } from '../data/format'
import { Brand, CategoryIcon, Pill, ProductImage, ScreenHeader, Spinner, openUrl } from '../ui/Common'
import { staggerStyle } from '../ui/Motion'
import { t, tr } from '../ui/i18n'
import { GIcon } from './groupCIcons'
import './groupC.css'
import './families.css'

const FamilyAccent = '#FF6D00'
const usd0 = (v: number) => '$' + Math.round(v).toLocaleString('en-US')

function SectionTitle({ text, color }: { text: string; color: string }) {
  return <div className="c-label" style={{ color, padding: '18px 0 10px 20px' }}>{text}</div>
}

/** Group a list by category, keeping the order the categories first appear in. */
function groupByCategory(list: Product[]): [Product['category'], Product[]][] {
  const m = new Map<Product['category'], Product[]>()
  for (const p of list) { const g = m.get(p.category); if (g) g.push(p); else m.set(p.category, [p]) }
  return [...m.entries()]
}

export interface FamiliesScreenProps {
  onBack: () => void
  onOpenFamily: (f: Family) => void
  onOpenCombo: (c: Combo) => void
}

/** All product families and boxed combos of Stylecraft and Gamma+. */
export function FamiliesScreen({ onBack, onOpenFamily, onOpenCombo }: FamiliesScreenProps) {
  const products = useProducts()
  const combos = useCombos()
  const families = useMemo(() => Families.all(products), [products])

  return (
    <div className="screen">
      <div className="scroll" style={{ paddingBottom: 40 }}>
        <ScreenHeader title={t('FAMILIES & COMBOS')} subtitle={`${families.length} ` + t('families') + ` · ${combos.length} ` + t('combos')} onBack={onBack} />
        {combos.length > 0 && (
          <>
            <SectionTitle text={t('COMBOS & SETS')} color={Brand.Lime} />
            <div className="c-hrow">
              {combos.map(c => <ComboCard key={c.id} combo={c} style={{ width: 170 }} onClick={() => onOpenCombo(c)} />)}
            </div>
          </>
        )}
        <SectionTitle text={t('PRODUCT FAMILIES')} color={FamilyAccent} />
        {families.map((f, i) => (
          <FamilyRow key={familyKey(f)} family={f} style={staggerStyle(i % 10, 45)} onClick={() => onOpenFamily(f)} />
        ))}
      </div>
    </div>
  )
}

function FamilyRow({ family: f, style, onClick }: { family: Family; style: CSSProperties; onClick: () => void }) {
  const own = f.brand.toLowerCase() === 'stylecraft'
  const cats = groupByCategory(f.members)
  return (
    <div className="fam-row stagger bounce" style={style} onClick={onClick}>
      {/* up to 3 member photos, overlapping */}
      <div style={{ position: 'relative', width: 92, height: 56, flex: '0 0 auto' }}>
        {f.members.slice(0, 3).map((p, i) => (
          <div key={p.id} className="fam-thumb" style={{ left: i * 18 }}><ProductImage product={p} /></div>
        ))}
      </div>
      <div style={{ width: 12, flex: '0 0 auto' }} />
      <div className="grow">
        <div style={{ color: own ? Brand.Red : Brand.Cyan, fontSize: 10, fontWeight: 900, letterSpacing: 1 }}>{f.brand.toUpperCase()}</div>
        <div style={{ color: '#fff', fontSize: 17, fontWeight: 900 }}>{f.name.toUpperCase()}</div>
        <div className="ellipsis" style={{ color: Brand.Muted, fontSize: 12 }}>
          {cats.map(([c, l]) => `${l.length} ` + tr(l.length > 1 ? categoryPlural(c) : categoryLabel(c)).toLowerCase()).join(' · ')}
        </div>
      </div>
      <div className="row" style={{ gap: 2 }}>
        {cats.map(([c]) => <CategoryIcon key={c} category={c} size={18} color={FamilyAccent} />)}
      </div>
      <GIcon name="chevronRight" color="gray" />
    </div>
  )
}

/** Every product of one family, grouped by category. `familyKey` is the Kotlin `key` ("Brand|Family"). */
export function FamilyScreen({ familyKey: key, onBack, onOpenProduct, onOpenCombo }: {
  familyKey: string; onBack: () => void; onOpenProduct: (p: Product) => void; onOpenCombo: (c: Combo) => void
}) {
  const products = useProducts()
  const combos = useCombos()
  const family = useMemo(() => Families.byKey(key, products), [key, products])
  // Catalog not loaded yet: wait instead of leaving. Loaded but unknown family: go back (Kotlin LaunchedEffect).
  useEffect(() => { if (!family && products.length > 0) onBack() }, [family, products.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const familyCombos = useMemo(
    () => (family ? combos.filter(c => c.items.some(id => family.members.some(m => m.id === id))) : []), [family, combos])
  if (!family) return null
  const total = family.members.map(p => p.priceUsd).filter((v): v is number => v != null)

  return (
    <div className="screen">
      <div className="scroll">
        <ScreenHeader title={family.name.toUpperCase() + ' ' + t('FAMILY')} subtitle={family.brand.toUpperCase() + ` · ${family.members.length} ` + t('products')} onBack={onBack} />
        {groupByCategory(family.members).map(([cat, list]) => (
          <div key={cat}>
            <div className="row" style={{ padding: '14px 0 8px 20px' }}>
              <CategoryIcon category={cat} size={20} color={FamilyAccent} />
              <div style={{ width: 8 }} />
              <div className="c-label" style={{ color: FamilyAccent }}>{t(categoryPlural(cat)).toUpperCase()}</div>
            </div>
            <div className="c-hrow">
              {list.map((p, i) => (
                <MiniProductCard key={p.id} product={p} className="stagger" style={{ width: 150, ...staggerStyle(i, 50) }} onClick={() => onOpenProduct(p)} />
              ))}
            </div>
          </div>
        ))}
        {familyCombos.length > 0 && (
          <>
            <SectionTitle text={t('SOLD AS A COMBO')} color={Brand.Lime} />
            <div className="c-hrow">
              {familyCombos.map(c => <ComboCard key={c.id} combo={c} style={{ width: 170 }} onClick={() => onOpenCombo(c)} />)}
            </div>
          </>
        )}
        {total.length === family.members.length && total.length > 0 && (
          <div style={{ color: Brand.Muted, fontSize: 12, padding: 20 }}>
            {t('Whole family at list price') + ': ' + money(total.reduce((a, b) => a + b, 0))}
          </div>
        )}
        <div style={{ height: 30 }} />
      </div>
    </div>
  )
}

/** Small product card used in families, combos and the product page. */
export function MiniProductCard({ product: p, highlight = false, onClick, style, className }: {
  product: Product; highlight?: boolean; onClick: () => void; style?: CSSProperties; className?: string
}) {
  return (
    <div className={'mini-card bounce' + (className ? ' ' + className : '')} onClick={onClick}
      style={{ ...style, borderColor: highlight ? FamilyAccent : Brand.CardBorder }}>
      <div className="mini-photo">
        <ProductImage product={p} />
        {p.priceUsd != null && <span className="mini-price">{usd0(p.priceUsd)}</span>}
      </div>
      <div style={{ padding: 8 }}>
        <div style={{ color: FamilyAccent, fontSize: 9, fontWeight: 900, letterSpacing: 1 }}>{t(categoryLabel(p.category)).toUpperCase()}</div>
        <div className="clamp-2" style={{ color: '#fff', fontSize: 13, fontWeight: 700, lineHeight: '16px' }}>{p.name}</div>
      </div>
    </div>
  )
}

export function ComboImage({ combo: c, style }: { combo: Combo; style?: CSSProperties }) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => { setFailed(false); setLoaded(false) }, [c.id, c.imageUrl])
  const box: CSSProperties = { width: '100%', height: '100%', position: 'relative', ...style }
  if (!c.imageUrl?.trim() || failed) {
    return <div className="center" style={box}><GIcon name="inventory" size={48} color="#8A8A8A" /></div>
  }
  return (
    <div style={{ ...box, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {!loaded && <div style={{ position: 'absolute' }}><Spinner size={20} /></div>}
      <img src={c.imageUrl} alt={c.name} loading="lazy" referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)} onError={() => setFailed(true)}
        style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: loaded ? 1 : 0 }} />
    </div>
  )
}

export function ComboCard({ combo: c, onClick, style, className }: { combo: Combo; onClick: () => void; style?: CSSProperties; className?: string }) {
  return (
    <div className={'combo-card bounce' + (className ? ' ' + className : '')} onClick={onClick} style={style}>
      <div className="mini-photo" style={{ aspectRatio: 1.1 }}>
        <ComboImage combo={c} />
        <span className="combo-tag">{t('COMBO')}</span>
        {c.priceUsd != null && <span className="mini-price">{usd0(c.salePriceUsd ?? c.priceUsd)}</span>}
      </div>
      <div style={{ padding: 8 }}>
        <div style={{ color: comboIsStylecraft(c) ? Brand.Red : Brand.Cyan, fontSize: 9, fontWeight: 900, letterSpacing: 1 }}>{c.brand.toUpperCase()}</div>
        <div className="clamp-2" style={{ color: '#fff', fontSize: 13, fontWeight: 700, lineHeight: '16px' }}>{c.name}</div>
      </div>
    </div>
  )
}

const TOOL_WORDS = /clipper|trimmer|shaver|dryer/i

/** One combo: what's in the box, price vs buying separately, where to buy. */
export function ComboDetailScreen({ id, onBack, onOpenProduct }: { id: string; onBack: () => void; onOpenProduct: (p: Product) => void }) {
  const products = useProducts()
  const combos = useCombos()
  const combo = useMemo(() => ComboRepository.findById(id), [id, combos])
  useEffect(() => { if (!combo && combos.length > 0) onBack() }, [combo, combos.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const inBox = useMemo(
    () => (combo ? combo.items.map(pid => products.find(p => p.id === pid)).filter((p): p is Product => !!p) : []), [combo, products])
  if (!combo) return null

  // "Buy separately" only when every tool in the box is a catalog product with a price
  const separate = inBox.map(p => p.priceUsd).filter((v): v is number => v != null)
  const allToolsKnown = inBox.length >= 2 && separate.length === inBox.length && !combo.extraItems.some(e => TOOL_WORDS.test(e))
  const price = combo.salePriceUsd ?? combo.priceUsd

  return (
    <div className="screen">
      <div className="scroll">
        <ScreenHeader title={combo.name.toUpperCase()} subtitle={combo.brand.toUpperCase() + ' · ' + t('COMBO')} onBack={onBack} />
        <div className="stagger acc-hero" style={staggerStyle(0, 70, 40)}>
          <ComboImage combo={combo} />
        </div>
        <div className="row" style={{ padding: '12px 16px', gap: 8, flexWrap: 'wrap' }}>
          {combo.model && <Pill text={combo.model} color={Brand.Cyan} />}
          <Pill text={combo.brand.toUpperCase()} color={Brand.Red} />
          {price != null && <Pill text={money(price)} color={Brand.Lime} />}
        </div>
        {allToolsKnown && price != null && (() => {
          const sum = separate.reduce((a, b) => a + b, 0)
          return (
            <div className="combo-save">
              <div className="row" style={{ padding: 16, alignItems: 'center' }}>
                <div className="grow">
                  <div style={{ color: Brand.Muted, fontSize: 12 }}>{t('Bought separately')}</div>
                  <div style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>{money(sum)}</div>
                </div>
                <div className="grow">
                  <div style={{ color: Brand.Muted, fontSize: 12 }}>{t('As a combo')}</div>
                  <div style={{ color: Brand.Lime, fontSize: 18, fontWeight: 900 }}>{money(price)}</div>
                </div>
              </div>
              {sum > price && <div style={{ color: Brand.Lime, fontWeight: 900, fontSize: 14, padding: '0 16px 14px' }}>{t('Saves') + ' ' + money(sum - price)}</div>}
            </div>
          )
        })()}
        <div className="c-label" style={{ color: Brand.Lime, padding: '22px 20px 8px' }}>{t('IN THE BOX')}</div>
        {combo.contents && <div style={{ color: '#D3D3D3', fontSize: 13, padding: '4px 20px' }}>{combo.contents}</div>}
        {inBox.length > 0 && (
          <div className="c-hrow" style={{ padding: '8px 16px' }}>
            {inBox.map(p => <MiniProductCard key={p.id} product={p} style={{ width: 150 }} onClick={() => onOpenProduct(p)} />)}
          </div>
        )}
        {combo.extraItems.map((e, i) => (
          <div key={i} className="row" style={{ padding: '3px 20px', alignItems: 'flex-start' }}>
            <span style={{ color: Brand.Lime, fontWeight: 900 }}>+</span>
            <span style={{ width: 8, flex: '0 0 auto' }} />
            <span style={{ color: '#D3D3D3', fontSize: 14 }}>{e}</span>
          </div>
        ))}
        {combo.features.length > 0 && (
          <>
            <div className="c-label" style={{ color: Brand.Cyan, padding: '22px 20px 8px' }}>{t('KEY FEATURES')}</div>
            {combo.features.map((f, i) => (
              <div key={i} className="row" style={{ padding: '3px 20px', alignItems: 'flex-start' }}>
                <span style={{ color: Brand.Red, fontWeight: 900 }}>•</span>
                <span style={{ width: 8, flex: '0 0 auto' }} />
                <span style={{ color: '#D3D3D3', fontSize: 14 }}>{f}</span>
              </div>
            ))}
          </>
        )}
        {combo.buyUrl && (
          <div style={{ padding: 16 }}>
            <button className="btn btn-outline btn-block" style={{ height: 50, letterSpacing: 0 }} onClick={() => openUrl(combo.buyUrl)}>
              <GIcon name="openInNew" size={18} color="#fff" />
              <span style={{ fontWeight: 700, fontSize: 13 }}>{t('BUY DIRECT FROM STYLECRAFT')}</span>
            </button>
          </div>
        )}
        <div style={{ height: 40 }} />
      </div>
    </div>
  )
}

/** On a product page: the rest of its family, and combos that include it. */
export function FamilyAndCombosStrip({ product, onOpenProduct, onOpenFamily, onOpenCombo }: {
  product: Product; onOpenProduct: (p: Product) => void; onOpenFamily: (f: Family) => void; onOpenCombo: (c: Combo) => void
}) {
  const products = useProducts()
  const combos = useCombos()
  const family = useMemo(() => Families.of(product, products), [product, products])
  const inCombos = useMemo(() => combos.filter(c => c.items.includes(product.id)), [product, combos])
  return (
    <>
      {family && (
        <>
          <div className="row" style={{ padding: '24px 8px 0 20px' }}>
            <div className="c-label grow ellipsis" style={{ color: FamilyAccent }}>{t('COMPLETE THE FAMILY') + ' · ' + family.name.toUpperCase()}</div>
            <button className="btn btn-text" style={{ color: '#fff', fontSize: 12 }} onClick={() => onOpenFamily(family)}>{t('See all')}</button>
          </div>
          <div className="c-hrow" style={{ gap: 10 }}>
            {family.members.map(p => (
              <MiniProductCard key={p.id} product={p} highlight={p.id === product.id} style={{ width: 130 }}
                onClick={() => { if (p.id !== product.id) onOpenProduct(p) }} />
            ))}
          </div>
        </>
      )}
      {inCombos.length > 0 && (
        <>
          <div className="c-label" style={{ color: Brand.Lime, padding: '22px 20px 8px' }}>{t('ALSO SOLD AS A COMBO')}</div>
          <div className="c-hrow" style={{ gap: 10 }}>
            {inCombos.map(c => <ComboCard key={c.id} combo={c} style={{ width: 150 }} onClick={() => onOpenCombo(c)} />)}
          </div>
        </>
      )}
    </>
  )
}

export { familyTitle }
