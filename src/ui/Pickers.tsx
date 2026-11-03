import { useMemo, useState } from 'react'
import { Product, displayName, isStylecraft, categoryLabel } from '../data/product'
import { Icon } from './icons'
import { ProductImage } from './Common'
import { t } from './i18n'

/** Searchable product list used in bottom sheets ("which product is this?"). Put it inside <BottomSheet>. */
export function ProductPickerList({ title, subtitle, products, onPick }: {
  title: string; subtitle?: string | null; products: Product[]; onPick: (p: Product) => void
}) {
  const [query, setQuery] = useState('')
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products
      .filter(p => q === '' || displayName(p).toLowerCase().includes(q) || (p.model?.toLowerCase().includes(q) ?? false))
      .sort((a, b) => (Number(!isStylecraft(a)) - Number(!isStylecraft(b))) || a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name))
  }, [products, query])
  return (
    <div className="col" style={{ height: '85vh', padding: '0 16px' }}>
      <div style={{ fontSize: 18, fontWeight: 900 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: 'gray', padding: '6px 0' }}>{subtitle}</div>}
      <div className="field" style={{ margin: '8px 0' }}>
        <span className="lead-icon"><Icon name="search" /></span>
        <input className="input with-icon" value={query} onChange={e => setQuery(e.target.value)} placeholder={t('Search name or model')} />
      </div>
      <div className="scroll">
        {list.map(p => (
          <div key={p.id} className="row" style={{ padding: '8px 0', cursor: 'pointer' }} onClick={() => onPick(p)}>
            <div className="photo-box" style={{ width: 48, height: 48, padding: 3, flex: '0 0 auto' }}><ProductImage product={p} /></div>
            <div style={{ width: 12 }} />
            <div className="grow">
              <div className="ellipsis" style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
              <div className="ellipsis" style={{ color: 'gray', fontSize: 12 }}>{p.brand} · {p.model ?? categoryLabel(p.category)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
