// Port of AccessoriesScreen.kt (AccessoriesScreen, AccessoryImage, AccessoryCard, AccessoryDetailScreen, CompatibleAccessoriesRow)
import { CSSProperties, useEffect, useMemo, useState } from 'react'
import { Product, displayName, isStylecraft } from '../data/product'
import {
  ACCESSORY_TYPES, Accessory, AccessoryRepository, AccessoryType, accessoryIsOwnBrand, accessoryIsStylecraft,
  accessoryTypeLabel, accessoryTypePlural, useAccessories,
} from '../data/accessory'
import { useProducts } from '../data/repository'
import { money } from '../data/format'
import { Brand, Field, Pill, ProductImage, ScreenHeader, Spinner, openUrl } from '../ui/Common'
import { staggerStyle } from '../ui/Motion'
import { t } from '../ui/i18n'
import { GIcon } from './groupCIcons'
import './groupC.css'
import './accessories.css'

const AccessoryAccent = '#B388FF'
const ALL = 'All'

export function accessoryTypeIcon(type: AccessoryType) {
  return type === 'BLADE' ? 'contentCut' : type === 'GUARD' ? 'layers' : type === 'CAPE' ? 'checkroom' : 'inventory'
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const usd0 = (v: number) => '$' + Math.round(v).toLocaleString('en-US')

/** Grid of blades, guards, capes... When [forProduct] is set, only what fits that product. */
export interface AccessoriesScreenProps {
  forProduct: Product | null | undefined
  onBack: () => void
  onOpen: (a: Accessory) => void
}

export function AccessoriesScreen({ forProduct, onBack, onOpen }: AccessoriesScreenProps) {
  const all = useAccessories()
  const [typeFilter, setTypeFilter] = useState<string>(ALL)
  const [brandFilter, setBrandFilter] = useState<string>(ALL)
  const [query, setQuery] = useState('')

  const base = useMemo(() => {
    const list = forProduct ? all.filter(a => a.fits.includes(forProduct.id)) : [...all]
    return list.sort((a, b) =>
      (Number(!accessoryIsStylecraft(a)) - Number(!accessoryIsStylecraft(b))) ||
      (Number(!accessoryIsOwnBrand(a)) - Number(!accessoryIsOwnBrand(b))) ||
      cmp(a.brand, b.brand) || (ACCESSORY_TYPES.indexOf(a.type) - ACCESSORY_TYPES.indexOf(b.type)) || cmp(a.name, b.name))
  }, [all, forProduct])
  const types = useMemo(() => ACCESSORY_TYPES.filter(ty => base.some(a => a.type === ty)), [base])
  const brands = useMemo(() => [ALL, ...new Set(base.map(a => a.brand))], [base])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return base.filter(a =>
      (typeFilter === ALL || a.type === typeFilter) &&
      (brandFilter === ALL || a.brand === brandFilter) &&
      (q === '' || a.name.toLowerCase().includes(q) || a.brand.toLowerCase().includes(q) ||
        (a.model?.toLowerCase().includes(q) ?? false) || (a.fitsText?.toLowerCase().includes(q) ?? false)))
  }, [base, typeFilter, brandFilter, query])

  return (
    <div className="screen">
      <ScreenHeader
        title={forProduct ? t('FITS THIS PRODUCT') : t('BARBER ACCESSORIES')}
        subtitle={forProduct ? displayName(forProduct).toUpperCase() : `${base.length} ` + t('items').toUpperCase()}
        onBack={onBack} />

      <div className="acc-search" style={{ padding: '0 16px' }}>
        <Field value={query} onChange={setQuery} placeholder={t('Search blade, guard, model or clipper')}
          icon={<GIcon name="search" />}
          trailing={query !== '' ? <button className="icon-btn" aria-label="Clear" onClick={() => setQuery('')}><GIcon name="close" /></button> : undefined} />
      </div>

      {/* Type chips */}
      <div className="c-chips" style={{ padding: '12px 16px 0' }}>
        <button className={'c-chip' + (typeFilter === ALL ? ' sel' : '')} style={{ ['--chip' as string]: AccessoryAccent }} onClick={() => setTypeFilter(ALL)}>{t('All')}</button>
        {types.map(ty => (
          <button key={ty} className={'c-chip' + (typeFilter === ty ? ' sel' : '')} style={{ ['--chip' as string]: AccessoryAccent }} onClick={() => setTypeFilter(ty)}>
            <GIcon name={accessoryTypeIcon(ty)} size={16} />{t(accessoryTypePlural(ty))}
          </button>
        ))}
      </div>
      {/* Brand chips */}
      <div className="c-chips" style={{ padding: '8px 16px' }}>
        {brands.map(b => (
          <button key={b} className={'c-chip' + (brandFilter === b ? ' sel' : '')} style={{ ['--chip' as string]: b === 'Stylecraft' ? Brand.Red : Brand.Cyan }} onClick={() => setBrandFilter(b)}>
            {b === ALL ? t('All brands') : b}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="grow center" style={{ color: 'gray' }}>
          {forProduct ? t('No accessories linked to this product yet') : t('No accessories match')}
        </div>
      ) : (
        <div className="scroll">
          <div className="acc-grid">
            {shown.map((a, i) => (
              <AccessoryCard key={a.id} item={a} className="stagger" style={staggerStyle(i % 10, 55)} onClick={() => onOpen(a)} />
            ))}
            <div className="acc-note">{t("Compatibility comes from each brand's website and retailers. Check fit before ordering.")}</div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Photo of an accessory, or its type icon when there is no photo. */
export function AccessoryImage({ item, style }: { item: Accessory; style?: CSSProperties }) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => { setFailed(false); setLoaded(false) }, [item.id, item.imageUrl])
  const box: CSSProperties = { width: '100%', height: '100%', position: 'relative', ...style }
  if (!item.imageUrl?.trim() || failed) {
    return (
      <div className="col center" style={{ ...box, textAlign: 'center' }}>
        <GIcon name={accessoryTypeIcon(item.type)} size={48} color="#8A8A8A" />
        <div style={{ height: 4 }} />
        <div className="ellipsis" style={{ color: '#6E6E6E', fontSize: 11, fontWeight: 700, maxWidth: '100%' }}>{item.model ?? item.brand}</div>
        <div style={{ color: '#9E9E9E', fontSize: 10 }}>{t('Photo coming soon')}</div>
      </div>
    )
  }
  return (
    <div style={{ ...box, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {!loaded && <div style={{ position: 'absolute' }}><Spinner size={22} /></div>}
      <img src={item.imageUrl} alt={item.name} loading="lazy" referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)} onError={() => setFailed(true)}
        style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: loaded ? 1 : 0 }} />
    </div>
  )
}

export function AccessoryCard({ item, onClick, className, style }: { item: Accessory; onClick: () => void; className?: string; style?: CSSProperties }) {
  const own = accessoryIsOwnBrand(item)
  const accent = accessoryIsStylecraft(item) ? Brand.Red : own ? AccessoryAccent : Brand.CardBorder
  const label = accessoryIsStylecraft(item) ? Brand.Red : own ? AccessoryAccent : Brand.Cyan
  return (
    <div className={'acc-card bounce' + (className ? ' ' + className : '')} onClick={onClick}
      style={{ ...style, borderColor: own ? `color-mix(in srgb, ${accent} 60%, transparent)` : accent }}>
      <div className="acc-photo">
        <AccessoryImage item={item} />
        <span className="acc-type-badge"><GIcon name={accessoryTypeIcon(item.type)} size={14} color="#fff" /></span>
        {item.priceUsd != null && <span className="acc-price">{usd0(item.priceUsd)}</span>}
      </div>
      <div style={{ padding: 10 }}>
        <div className="ellipsis" style={{ color: label, fontSize: 10, fontWeight: 900, letterSpacing: 1 }}>
          {item.brand.toUpperCase() + ' · ' + t(accessoryTypeLabel(item.type)).toUpperCase()}
        </div>
        <div className="clamp-2" style={{ color: '#fff', fontSize: 14, fontWeight: 700, lineHeight: '17px' }}>{item.name}</div>
        {item.model != null && <div className="ellipsis" style={{ color: Brand.Muted, fontSize: 11 }}>{item.model}</div>}
      </div>
    </div>
  )
}

export interface AccessoryDetailScreenProps {
  item: Accessory
  onBack: () => void
  onOpenProduct: (p: Product) => void
}

export function AccessoryDetailScreen({ item, onBack, onOpenProduct }: AccessoryDetailScreenProps) {
  const products = useProducts()
  const fits = useMemo(() => item.fits.map(id => products.find(p => p.id === id)).filter((p): p is Product => !!p), [item, products])

  const rows = ([
    [t('Type'), t(accessoryTypeLabel(item.type))], [t('Model'), item.model], [t('Material'), item.material],
    [t('Size'), item.size], [t('Color'), item.color], [t('List price'), item.priceUsd != null ? money(item.priceUsd) : null],
  ] as [string, string | null][]).filter(r => r[1] != null) as [string, string][]

  const link = item.buyUrl ?? item.sourceUrl
  return (
    <div className="screen">
      <div className="scroll">
        <ScreenHeader title={item.name.toUpperCase()} subtitle={`${item.brand.toUpperCase()} · ${t(accessoryTypeLabel(item.type)).toUpperCase()}`} onBack={onBack} />

        <div className="stagger acc-hero" style={staggerStyle(0, 70, 40)}>
          <AccessoryImage item={item} />
        </div>

        <div className="row" style={{ padding: '12px 16px', gap: 8, flexWrap: 'wrap' }}>
          {item.model != null && <Pill text={item.model} color={Brand.Cyan} />}
          {accessoryIsOwnBrand(item) ? <Pill text={item.brand.toUpperCase()} color={Brand.Red} /> : <Pill text={t('COMPETITOR')} color={Brand.Muted} />}
          {item.priceUsd != null && <Pill text={money(item.priceUsd)} color={Brand.Lime} />}
        </div>

        {/* Specs */}
        <div className="stagger acc-specs" style={staggerStyle(2)}>
          {rows.map(([label, value], i) => (
            <div key={label}>
              <div className="stagger acc-spec-row" style={staggerStyle(3 + i, 45, 10)}>
                <div style={{ color: Brand.Muted, fontSize: 14, flex: '0 0 38%' }}>{label}</div>
                <div style={{ color: '#fff', fontSize: 14, fontWeight: 600, flex: '1 1 62%', textAlign: 'right' }}>{value}</div>
              </div>
              {i < rows.length - 1 && <hr className="divider" style={{ margin: '0 16px', background: 'rgba(255,255,255,0.06)' }} />}
            </div>
          ))}
        </div>

        {item.features.length > 0 && (
          <>
            <div className="c-label" style={{ color: Brand.Cyan, padding: '24px 20px 8px' }}>{t('KEY FEATURES')}</div>
            {item.features.map((f, i) => (
              <div key={i} className="row" style={{ padding: '3px 20px', alignItems: 'flex-start' }}>
                <span style={{ color: Brand.Red, fontWeight: 900 }}>•</span>
                <span style={{ width: 8, flex: '0 0 auto' }} />
                <span style={{ color: '#D3D3D3', fontSize: 14 }}>{f}</span>
              </div>
            ))}
          </>
        )}

        {/* Compatibility */}
        <div className="c-label" style={{ color: AccessoryAccent, padding: '24px 20px 6px' }}>{t('FITS')}</div>
        {item.fitsText != null && <div style={{ color: '#D3D3D3', fontSize: 13, padding: '4px 20px' }}>{item.fitsText}</div>}
        {fits.map((p, i) => (
          <div key={p.id} className="stagger bounce acc-fit-row" style={staggerStyle(4 + (i % 8), 40, 8)} onClick={() => onOpenProduct(p)}>
            <div className="photo-box" style={{ width: 52, height: 52, padding: 4, borderRadius: 10, flex: '0 0 auto' }}>
              <ProductImage product={p} />
            </div>
            <div style={{ width: 12 }} />
            <div className="grow">
              <div style={{ color: isStylecraft(p) ? Brand.Red : Brand.Cyan, fontSize: 10, fontWeight: 900 }}>{p.brand.toUpperCase()}</div>
              <div className="ellipsis" style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>{p.name}</div>
            </div>
            <GIcon name="chevronRight" color="gray" />
          </div>
        ))}
        {fits.length === 0 && item.fitsText == null && (
          <div style={{ color: 'gray', fontSize: 13, padding: '0 20px' }}>{t('Compatibility not listed by the brand')}</div>
        )}

        {link != null && (
          <div style={{ padding: '20px 16px' }}>
            <button className="btn btn-outline btn-block" style={{ height: 50, letterSpacing: 0 }} onClick={() => openUrl(link)}>
              <GIcon name="openInNew" size={18} color="#fff" />
              <span style={{ fontWeight: 700, fontSize: 13 }}>
                {accessoryIsOwnBrand(item) && item.buyUrl != null
                  ? t('BUY DIRECT FROM STYLECRAFT')
                  : t('WHERE TO BUY') + (item.priceUsd != null ? ' · ' + money(item.priceUsd) : '')}
              </span>
            </button>
          </div>
        )}
        <div style={{ height: 40 }} />
      </div>
    </div>
  )
}

/** Horizontal strip of accessories that fit a product (used on the product page). */
export function CompatibleAccessoriesRow({ product, onOpen, onSeeAll }: { product: Product; onOpen: (a: Accessory) => void; onSeeAll: () => void }) {
  const all = useAccessories()
  const list = useMemo(() => AccessoryRepository.forProduct(product.id), [all, product.id])
  if (list.length === 0) return null
  return (
    <>
      <div className="row" style={{ padding: '24px 8px 0 20px' }}>
        <div className="c-label grow" style={{ color: AccessoryAccent }}>{t('COMPATIBLE ACCESSORIES') + ` (${list.length})`}</div>
        <button className="btn btn-text" style={{ color: '#fff', fontSize: 12 }} onClick={onSeeAll}>{t('See all')}</button>
      </div>
      <div className="c-hrow" style={{ gap: 10 }}>
        {list.slice(0, 12).map(a => <AccessoryCard key={a.id} item={a} style={{ width: 150 }} onClick={() => onOpen(a)} />)}
      </div>
    </>
  )
}
