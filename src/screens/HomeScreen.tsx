import { ReactNode } from 'react'
import './home.css'
import { CATEGORIES, Category, categoryPlural } from '../data/product'
import { useProducts } from '../data/repository'
import { useAccessories } from '../data/accessory'
import { useLeads } from '../data/leads'
import { assetUrl } from '../data/repository'
import { Brand, CategoryIcon } from '../ui/Common'
import { AnimatedGlowIcon, staggerStyle } from '../ui/Motion'
import { Icon } from '../ui/icons'
import { useIsTablet, useIsWide } from '../ui/adaptive'
import { t, useLang } from '../ui/i18n'

export interface HomeScreenProps {
  onOpenCategory: (c: Category) => void
  onOpenScanner: () => void
  onOpenSpeedTool: () => void
  onOpenFavorites: () => void
  onOpenAccessories: () => void
  onOpenSearch: () => void
  onOpenLeads: () => void
  onOpenFamilies: () => void
  onOpenBenchmark: () => void
  onOpenSettings: () => void
}

// Material icon paths that are not in ui/icons.tsx
const PATH_PERSON_ADD = 'M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'
const PATH_BAR_CHART = 'M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z'
const PATH_SPEED = 'M20.38 8.57l-1.23 1.85a8 8 0 0 1-.22 7.58H5.07A8 8 0 0 1 15.58 6.85l1.85-1.23A10 10 0 0 0 3.35 19a2 2 0 0 0 1.72 1h13.85a2 2 0 0 0 1.74-1 10 10 0 0 0-.27-10.44zm-9.79 6.84a2 2 0 0 0 2.83 0l5.66-8.49-8.49 5.66a2 2 0 0 0 0 2.83z'

function PathIcon({ d, size = 26, color }: { d: string; size?: number; color: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ fill: color, display: 'block' }}><path d={d} /></svg>
}

const hexA = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

const ACCENT: Record<Category, string> = {
  CLIPPER: Brand.Red, TRIMMER: Brand.Cyan, SHAVER: Brand.Lime, DRYER: '#FFAB40', STRAIGHTENER: '#FF4FA3', CURLING_IRON: '#B388FF',
}

/** Settings button + search + catalog tiles + tools, same order and styling as the Android home. */
export function HomeScreen(p: HomeScreenProps) {
  useLang()
  const leadCount = useLeads().length
  const products = useProducts()
  const accessories = useAccessories()
  const wide = useIsWide()
  const tablet = useIsTablet()
  // Catalog tiles per row: 2 on phones, 3 on tablets
  const tilesPerRow = tablet ? 3 : 2

  const header = (
    <>
      <div style={{ height: 24 }} />
      <div className="home-title stagger" style={staggerStyle(0, 70, 16)}>{t('STYLECRAFT PRO')}</div>
      <div className="home-tag stagger" style={staggerStyle(1, 70, 12)}>{t('FIELD SALES SUITE')}</div>
      <div className="home-scan" />

      {/* One search for every product and accessory */}
      <div style={{ height: 24 }} />
      <div className="stagger" style={staggerStyle(1, 70, 10)}>
        <button className="home-search home-outline bounce" onClick={p.onOpenSearch}
          style={{ ['--ga' as string]: hexA(Brand.Cyan, 0.6), ['--gb' as string]: hexA(Brand.Red, 0.4) }}>
          <Icon name="search" />
          <span>{t('Search: cordless clipper under $200…')}</span>
        </button>
      </div>
    </>
  )

  const catalog = (
    <>
      <div style={{ height: 24 }} />
      <div className="home-label">{t('PRODUCT CATALOG')}</div>
      <div className="home-tiles" style={{ gridTemplateColumns: `repeat(${tilesPerRow}, minmax(0, 1fr))` }}>
        {CATEGORIES.map((cat, i) => {
          const all = products.filter(x => x.category === cat)
          const brands = new Set(all.map(x => x.brand)).size
          return <CategoryTile key={cat} category={cat} count={all.length} brands={brands} index={2 + i} onClick={() => p.onOpenCategory(cat)} />
        })}
      </div>

      <HomeActionCard title={t('BARBER ACCESSORIES')} subtitle={t('Blades, guards, capes') + ` · ${accessories.length} ` + t('items')}
        icon={<Icon name="contentCut" size={26} color="#B388FF" />} color="#B388FF" index={6} onClick={p.onOpenAccessories} />
      <div style={{ height: 12 }} />
      <HomeActionCard title={t('FAMILIES & COMBOS')} subtitle={t('Product lines and boxed sets')}
        icon={<Icon name="inventory" size={26} color="#FF6D00" />} color="#FF6D00" index={6} onClick={p.onOpenFamilies} />
      <div style={{ height: 12 }} />
      <HomeActionCard title={t('BENCHMARK')} subtitle={t('Up to 6 products side by side, with a chart')}
        icon={<PathIcon d={PATH_BAR_CHART} color="#FFD740" />} color="#FFD740" index={6} onClick={p.onOpenBenchmark} />
    </>
  )

  const tools = (
    <>
      <div className="home-label">{t('TOOLS')}</div>
      <HomeActionCard title={t('PRODUCT SCANNER')} subtitle={t("Barcode, label or just the product's look")}
        icon={<Icon name="camera" size={26} color={Brand.Red} />} color={Brand.Red} index={7} onClick={p.onOpenScanner} />
      <div style={{ height: 12 }} />
      <HomeActionCard title={t('SPEED ANALYZER')} subtitle={t('Measure RPM with the microphone')}
        icon={<PathIcon d={PATH_SPEED} color={Brand.Cyan} />} color={Brand.Cyan} index={8} onClick={p.onOpenSpeedTool} />
      <div style={{ height: 12 }} />
      <HomeActionCard title={t('LEADS')} subtitle={t('Save barbers & shops after a demo') + (leadCount > 0 ? ` · ${leadCount}` : '')}
        icon={<PathIcon d={PATH_PERSON_ADD} color="#69F0AE" />} color="#69F0AE" index={9} onClick={p.onOpenLeads} />
      <div style={{ height: 12 }} />
      <HomeActionCard title={t('FAVORITES & SHOW MODE')} subtitle={t('Your picks, full-screen slideshow')}
        icon={<Icon name="star" size={26} color="#FFC400" />} color="#FFC400" index={10} onClick={p.onOpenFavorites} />
    </>
  )

  return (
    <div className="home">
      <img className="home-bg" src={assetUrl('img/bgapp.webp')} alt="" />
      {wide ? (
        // Landscape tablet / desktop: catalog on the left, tools on the right
        <div className="home-wide">
          <div className="home-col left">
            {header}{catalog}
            <div style={{ height: 40 }} />
          </div>
          <div className="home-col right">
            <div style={{ height: 72 }} />{/* clears the settings button */}
            {tools}
            <div style={{ height: 40 }} />
          </div>
        </div>
      ) : (
        // Phone (and tablet in portrait): one column
        <div className="home-scroll" style={{ padding: `24px ${tablet ? 32 : 20}px` }}>
          {header}{catalog}
          <div style={{ height: 28 }} />
          {tools}
          <div style={{ height: 40 }} />
        </div>
      )}

      {/* Drawn after the scrolling content so it sits on top and receives the tap */}
      <button className="home-settings" onClick={p.onOpenSettings} aria-label={t('Settings')}><Icon name="settings" /></button>
    </div>
  )
}

function CategoryTile({ category, count, brands, index, onClick }: { category: Category; count: number; brands: number; index: number; onClick: () => void }) {
  const accent = ACCENT[category]
  const plural = t(categoryPlural(category))
  return (
    <div className="stagger" style={staggerStyle(index)}>
      <button className="home-tile home-outline bounce" onClick={onClick} style={{ ['--ga' as string]: hexA(accent, 0.6) }}>
        <div className="ico" style={{ background: hexA(accent, 0.1) }}>
          <AnimatedGlowIcon tint={accent} size={60} iconSize={50} delayMs={150 + index * 90}>
            <CategoryIcon category={category} size={50} color={accent} />
          </AnimatedGlowIcon>
        </div>
        <div>
          <div className="name" style={{ fontSize: plural.length > 13 ? 14 : 17 }}>{plural.toUpperCase()}</div>
          <div className="count">{count} {t('models')} · {brands} {t('brands')}</div>
        </div>
      </button>
    </div>
  )
}

/** Big tappable card with an icon, a title and a subtitle (also used by other screens). */
export function HomeActionCard({ title, subtitle, icon, color, index = 0, onClick }: {
  title: string; subtitle: string; icon: ReactNode; color: string; index?: number; onClick: () => void
}) {
  return (
    <div className="stagger" style={staggerStyle(index)}>
      <button className="home-action home-outline bounce" onClick={onClick} style={{ ['--ga' as string]: hexA(color, 0.5) }}>
        <div className="ico" style={{ background: hexA(color, 0.1) }}>
          <AnimatedGlowIcon tint={color} size={48} iconSize={26} delayMs={150 + index * 90}>{icon}</AnimatedGlowIcon>
        </div>
        <div className="txt">
          <div className="ttl">{title}</div>
          <div className="sub">{subtitle}</div>
        </div>
        <Icon name="chevronRight" className="chev" />
      </button>
    </div>
  )
}
