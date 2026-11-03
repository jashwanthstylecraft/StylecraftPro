import { useEffect, useMemo, useRef, useState } from 'react'
import './favorites.css'
import { Product, isIron, isStylecraft } from '../data/product'
import { useProducts } from '../data/repository'
import { AppPrefs } from '../data/prefs'
import { specRows } from '../data/specs'
import { useStore } from '../data/store'
import { Brand, ProductImage, ScreenHeader } from '../ui/Common'
import { Icon } from '../ui/icons'
import { staggerStyle } from '../ui/Motion'
import { t, useLang } from '../ui/i18n'

const PATH_PLAY_ARROW = 'M8 5v14l11-7z'

export interface FavoritesScreenProps {
  onBack: () => void
  onOpen: (p: Product) => void
  onShow: () => void
}

/** Starred products + the button that starts Show Mode. */
export function FavoritesScreen({ onBack, onOpen, onShow }: FavoritesScreenProps) {
  useLang()
  const all = useProducts()
  const favIds = useStore(AppPrefs.favorites)
  const favorites = useMemo(() => all.filter(p => favIds.includes(p.id)), [all, favIds])

  return (
    <div className="screen">
      <ScreenHeader title={t('FAVORITES')} subtitle={`${favorites.length} ` + t('PRODUCTS')} onBack={onBack} />
      <div className="stagger" style={{ ...staggerStyle(0), flex: '0 0 auto' }}>
        <button className="btn btn-red fav-show-btn" onClick={onShow}>
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" style={{ fill: '#fff' }}><path d={PATH_PLAY_ARROW} /></svg>
          <span>{favorites.length === 0 ? t('START SHOW (STYLECRAFT LINEUP)') : t('START SHOW MODE')}</span>
        </button>
      </div>
      {favorites.length === 0 ? (
        <div className="fav-empty">
          <Icon name="starBorder" size={56} color="gray" />
          <div style={{ height: 12 }} />
          <div>{t('Tap the star on any product page to add it here.')}</div>
        </div>
      ) : (
        <div className="scroll">
          <div className="fav-grid">
            {favorites.map((p, i) => (
              <div key={p.id} className="stagger" style={staggerStyle(i % 10)}>
                <button className="fav-card bounce" onClick={() => onOpen(p)}>
                  <div className="fav-photo"><ProductImage product={p} /></div>
                  <div className="fav-info">
                    <div className="fav-brand" style={{ color: isStylecraft(p) ? Brand.Red : Brand.Cyan }}>{p.brand.toUpperCase()}</div>
                    <div className="fav-name">{p.name}</div>
                  </div>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Full-screen slideshow for trade shows and counters: big photo, name and key specs,
 * moves to the next product every 6 seconds. Tap to pause, swipe to move, X to exit.
 */
export function ShowModeScreen({ onExit }: { onExit: () => void }) {
  useLang()
  const all = useProducts()
  const favIds = useStore(AppPrefs.favorites)
  const items = useMemo(() => {
    const favs = all.filter(p => favIds.includes(p.id))
    return favs.length > 0 ? favs : all.filter(p => isStylecraft(p) && p.category !== 'DRYER' && !isIron(p.category))
  }, [all, favIds])

  const pagerRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(0) // fractional page position, like pager.currentPage + offset
  const [paused, setPaused] = useState(false)
  const page = Math.min(Math.max(Math.round(pos), 0), Math.max(items.length - 1, 0))
  const pageRef = useRef(0)
  pageRef.current = page

  useEffect(() => { if (items.length === 0) onExit() }, [items.length, onExit])

  // Escape closes, arrow keys move (desktop)
  const goTo = (i: number) => {
    const el = pagerRef.current
    if (!el || items.length === 0) return
    el.scrollTo({ left: ((i % items.length) + items.length) % items.length * el.clientWidth, behavior: 'smooth' })
  }
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit()
      else if (e.key === 'ArrowRight') goTo(pageRef.current + 1)
      else if (e.key === 'ArrowLeft') goTo(pageRef.current - 1)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  // Keep the screen awake while the show is running
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    let cancelled = false
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    nav.wakeLock?.request('screen').then(l => { if (cancelled) void l.release(); else lock = l }).catch(() => { /* not allowed */ })
    return () => { cancelled = true; void lock?.release().catch(() => { /* ignore */ }) }
  }, [])

  // Next product every 6 seconds while not paused
  useEffect(() => {
    if (paused || items.length === 0) return
    const id = window.setInterval(() => goTo(pageRef.current + 1), 6000)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, items.length])

  const raf = useRef(0)
  const onScroll = () => {
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => {
      const el = pagerRef.current
      if (el && el.clientWidth > 0) setPos(el.scrollLeft / el.clientWidth)
    })
  }

  if (items.length === 0) return null

  const start = Math.max(page - 5, 0)
  const dots = []
  for (let i = start; i < Math.min(items.length, start + 11); i++) dots.push(i)

  return (
    <div className="show">
      <div className="show-grid" />
      <div className="show-pager" ref={pagerRef} onScroll={onScroll}>
        {items.map((p, idx) => {
          const off = Math.min(Math.max(Math.abs(pos - idx), 0), 1)
          const accent = isStylecraft(p) ? Brand.Red : Brand.Cyan
          const specs = specRows(p).filter(r => r.text != null && r.label !== 'Model').slice(0, 5)
          return (
            <div key={p.id} className="show-page" onClick={() => setPaused(v => !v)}
              style={{ opacity: 1 - off * 0.7, transform: `scale(${1 - off * 0.12})` }}>
              <div className="show-inner">
                <div className="show-glowbox">
                  <div className="show-glow" style={{ background: `radial-gradient(circle closest-side, ${accent}, transparent)` }} />
                  <div className="show-photo"><ProductImage product={p} /></div>
                </div>
                <div className="show-brand" style={{ color: accent }}>{p.brand.toUpperCase()}</div>
                <div className="show-name">{p.name.toUpperCase()}</div>
                {p.model != null && <div className="show-model">{p.model}</div>}
                <div className="show-specs">
                  {specs.map(r => (
                    <div key={r.label} className="show-spec">
                      <div className="l">{t(r.label)}</div>
                      <div className="v">{r.text ?? ''}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Page dots */}
      <div className="show-dots">
        {dots.map(i => <div key={i} className={'show-dot' + (i === page ? ' on' : '')} style={{ width: i === page ? 10 : 6, height: i === page ? 10 : 6 }} />)}
      </div>
      {paused && <div className="show-paused">{t('PAUSED · tap to continue')}</div>}
      <button className="icon-btn show-close" onClick={onExit} aria-label={t('Close')}><Icon name="close" /></button>
    </div>
  )
}
