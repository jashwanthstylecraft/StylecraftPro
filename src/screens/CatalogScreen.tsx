import { useMemo, useState } from 'react'
import './catalog.css'
import { Category, Product, categoryPlural, displayName, isStylecraft } from '../data/product'
import { ProductRepository, useProducts } from '../data/repository'
import { AppPrefs } from '../data/prefs'
import { useStore } from '../data/store'
import { Brand, Field, ProductImage, ScreenHeader, Spinner, showToast } from '../ui/Common'
import { Icon } from '../ui/icons'
import { staggerStyle } from '../ui/Motion'
import { t, tr, useLang } from '../ui/i18n'

const ALL_BRANDS = 'All'

export interface CatalogScreenProps {
  category: Category
  /** When set, the rep is choosing a competitor to compare with this product. */
  pickFor: Product | null | undefined
  onBack: () => void
  onProductClick: (p: Product) => void
}

/** Plain code-unit string order, like Kotlin's compareBy on String. */
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * Grid of every product in one category. When `pickFor` is set the screen is in
 * "choose a product to compare with" mode and that product is hidden from the grid.
 */
export function CatalogScreen({ category, pickFor, onBack, onProductClick }: CatalogScreenProps) {
  useLang()
  const all = useProducts()
  const favorites = useStore(AppPrefs.favorites)
  const [brandFilter, setBrandFilter] = useState(ALL_BRANDS)
  const [query, setQuery] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const inCategory = useMemo(
    () => all.filter(p => p.category === category && p.id !== pickFor?.id)
      .sort((a, b) => (Number(!isStylecraft(a)) - Number(!isStylecraft(b))) || cmp(a.brand, b.brand) || cmp(a.name, b.name)),
    [all, category, pickFor],
  )
  const brands = useMemo(() => [ALL_BRANDS, ...new Set(inCategory.map(p => p.brand))], [inCategory])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return inCategory.filter(p =>
      (brandFilter === ALL_BRANDS || p.brand === brandFilter) &&
      (q === '' || p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || (p.model?.toLowerCase().includes(q) ?? false)))
  }, [inCategory, brandFilter, query])

  const refresh = async () => {
    setRefreshing(true)
    const r = await ProductRepository.refresh()
    const msg = r.kind === 'updated' ? tr('Catalog updated') + `: ${r.count} ` + tr('products')
      : r.kind === 'notConfigured' ? tr('No online catalog link yet. Add it in Settings.')
        : tr("Couldn't update") + `: ${r.reason}`
    setRefreshing(false)
    showToast(msg)
  }

  return (
    <div className="screen">
      <ScreenHeader
        title={pickFor ? t('COMPARE WITH…') : t(categoryPlural(category)).toUpperCase()}
        subtitle={pickFor ? `vs ${displayName(pickFor).toUpperCase()}` : `${inCategory.length} ` + t('MODELS')}
        onBack={onBack}
        actions={
          <button className="icon-btn" disabled={refreshing} onClick={() => void refresh()} aria-label="Update catalog">
            {refreshing ? <Spinner size={20} color={Brand.Cyan} /> : <Icon name="refresh" />}
          </button>
        }
      />

      <div className="cat-field">
        <Field value={query} onChange={setQuery} placeholder={t('Search name or model')} icon={<Icon name="search" />}
          trailing={query !== '' ? <button className="icon-btn" onClick={() => setQuery('')} aria-label="Clear"><Icon name="close" /></button> : undefined} />
      </div>

      <div className="cat-chips">
        {brands.map(b => (
          <button key={b} className={'cat-chip' + (brandFilter === b ? ' on' : '')}
            style={brandFilter === b ? { background: b === 'Stylecraft' ? Brand.Red : Brand.Cyan } : undefined}
            onClick={() => setBrandFilter(b)}>{b}</button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="cat-empty">{t('No models match')}</div>
      ) : (
        <div className="scroll">
          <div className="cat-grid">
            {shown.map((p, i) => (
              <div key={p.id} className="stagger" style={staggerStyle(i % 10, 55)}>
                <ProductGridCard product={p} favorite={favorites.includes(p.id)} onClick={() => onProductClick(p)} />
              </div>
            ))}
            <div className="cat-foot">
              {t('Competitor specs come from brand websites and retailers. "Not listed" means the brand doesn\'t publish it.')}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ProductGridCard({ product, favorite, onClick }: { product: Product; favorite: boolean; onClick: () => void }) {
  const own = isStylecraft(product)
  return (
    <button className={'cat-card bounce' + (own ? ' own' : '')} onClick={onClick}>
      <div className="cat-photo">
        <div className="fit"><ProductImage product={product} /></div>
        {favorite && <Icon name="star" className="cat-star" />}
        {product.priceUsd != null && (
          <div className="cat-price">${product.priceUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
        )}
      </div>
      <div className="cat-info">
        <div className="cat-brand" style={{ color: own ? Brand.Red : Brand.Cyan }}>{product.brand.toUpperCase()}</div>
        <div className="cat-name">{product.name}</div>
        {product.model != null && <div className="cat-model">{product.model}</div>}
      </div>
    </button>
  )
}
