import { useEffect, useMemo, useState } from 'react'
import { Product, isStylecraft, categoryPlural } from '../data/product'
import { NOT_PUBLISHED, SpecRow, compareRows, winnerOf } from '../data/specs'
import { talkingPoints } from '../data/talking'
import { usePref } from '../data/prefs'
import { Brand, ProductImage, ScreenHeader, Spinner, showToast } from '../ui/Common'
import { Icon } from '../ui/icons'
import { staggerStyle } from '../ui/Motion'
import { renderComparison, shareFile, shareLink } from '../ui/share'
import { t } from '../ui/i18n'
import { DIcon } from './detailIcons'
import './compare.css'

export interface CompareScreenProps {
  p1: Product
  p2: Product
  onBack: () => void
  onChangeSecond: () => void
}

const LeftColor = Brand.Cyan
const RightColor = Brand.Red

export function CompareScreen({ p1, p2, onBack, onChangeSecond }: CompareScreenProps) {
  const [rows1, rows2] = useMemo(() => compareRows(p1, p2), [p1, p2])

  // Who wins each comparable spec (only when both brands publish the number)
  let wins1 = 0, wins2 = 0
  rows1.forEach((a, i) => { const w = winnerOf(a, rows2[i]); if (w === 1) wins1++; else if (w === 2) wins2++ })

  const spanish = usePref('language') === 'es'
  // Talking points are written from Stylecraft's side when one of the two is a Stylecraft product.
  const ours = !isStylecraft(p1) && isStylecraft(p2) ? p2 : p1
  const theirs = ours === p1 ? p2 : p1
  const points = useMemo(() => talkingPoints(ours, theirs, spanish), [p1.id, p2.id, spanish])  // eslint-disable-line react-hooks/exhaustive-deps
  const [sharing, setSharing] = useState(false)
  const pointsTitle = t('Why %s wins').replace('%s', ours.name)
  const shareTitle = t('Comparison')

  const shareImage = async () => {
    setSharing(true)
    try {
      const file = await renderComparison(p1, p2, points, {
        title: `${p1.name}  vs  ${p2.name}`, subtitle: t('Published specs only'), notListed: t('Not listed'), pointsTitle,
      })
      await shareFile(file, shareTitle)
    } catch { /* ignored, like runCatching */ }
    setSharing(false)
  }

  const shareText = async () => {
    const text = pointsTitle + '\n' + points.map(p => `✓ ${p}`).join('\n')
    const out = await shareLink(shareTitle, text)
    if (out === 'downloaded') showToast(t('Copied to clipboard'))
  }

  const summary = wins1 > wins2 ? `${p1.name} leads ${wins1}–${wins2} on published specs`
    : wins2 > wins1 ? `${p2.name} leads ${wins2}–${wins1} on published specs`
    : `Tied ${wins1}–${wins2} on published specs`

  const shown = rows1.map((a, i) => [a, rows2[i]] as const).filter(([a, b]) => a.text != null || b.text != null)

  return (
    <div className="screen" style={{ position: 'relative' }}>
      <MovingGridBackground />
      <div className="scroll" style={{ position: 'relative' }}>
        <ScreenHeader title={t('COMPARISON')} subtitle={t(categoryPlural(p1.category)).toUpperCase()} onBack={onBack}
          actions={
            <button className="icon-btn" disabled={sharing} onClick={shareImage} aria-label={t('Share')}>
              {sharing ? <Spinner size={20} color={Brand.Cyan} /> : <Icon name="share" />}
            </button>
          } />

        <div className="row" style={{ padding: '0 12px' }}>
          <CompareHero p={p1} color={LeftColor} />
          <div className="vs-badge">{t('VS')}</div>
          <CompareHero p={p2} color={RightColor} />
        </div>

        {wins1 + wins2 > 0 && (
          <div style={{ color: '#fff', fontSize: 13, fontWeight: 700, textAlign: 'center', padding: 16 }}>{summary}</div>
        )}

        {points.length > 0 && (
          <div className="stagger" style={{ ...staggerStyle(1), padding: '0 12px 12px' }}>
            <div style={{ background: 'rgba(255,23,68,0.10)', border: '1px solid rgba(255,23,68,0.5)', borderRadius: 20, padding: 16 }}>
              <div style={{ color: Brand.Red, fontSize: 13, fontWeight: 900, letterSpacing: 1 }}>{pointsTitle.toUpperCase()}</div>
              <div style={{ height: 8 }} />
              {points.map((line, i) => (
                <div key={i} className="row stagger" style={{ ...staggerStyle(2 + i, 60, 8), padding: '3px 0', alignItems: 'flex-start' }}>
                  <span style={{ color: Brand.Lime, fontWeight: 900 }}>✓</span>
                  <span style={{ width: 8, flex: '0 0 auto' }} />
                  <span style={{ color: '#fff', fontSize: 14 }}>{line}</span>
                </div>
              ))}
              <div style={{ height: 10 }} />
              <button className="btn btn-text" style={{ color: Brand.Cyan, fontWeight: 700, letterSpacing: 0 }} onClick={shareText}>{t('SHARE AS TEXT')}</button>
            </div>
          </div>
        )}

        <div style={{ margin: '0 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '8px 14px' }}>
          {shown.map(([a, b]) => <CompareRow key={a.label} a={a} b={b} />)}
        </div>

        <div style={{ color: '#444', fontSize: 11, padding: 16 }}>
          {t("Bars compare the two products against each other. Specs a brand doesn't publish aren't scored.")}
        </div>

        <div className="row" style={{ padding: '0 12px', gap: 12 }}>
          <button className="btn btn-outline grow" style={{ height: 52, borderRadius: 12, fontWeight: 700, letterSpacing: 0 }} onClick={onChangeSecond}>{t('CHANGE PRODUCT')}</button>
          <button className="btn grow" style={{ height: 52, borderRadius: 12, background: 'rgba(255,255,255,0.12)', color: '#fff' }} onClick={onBack}>{t('CLOSE')}</button>
        </div>
        <div style={{ height: 40 }} />
      </div>
    </div>
  )
}

function CompareHero({ p, color }: { p: Product; color: string }) {
  return (
    <div className="grow col" style={{ alignItems: 'center' }}>
      <div style={{ width: 130, height: 130, borderRadius: 20, background: Brand.PhotoBackground, border: `2px solid ${color}99`, padding: 10 }}>
        <ProductImage product={p} />
      </div>
      <div style={{ height: 8 }} />
      <div style={{ color, fontSize: 10, fontWeight: 900, letterSpacing: 1 }}>{p.brand.toUpperCase()}</div>
      <div className="clamp-2" style={{ color: '#fff', fontSize: 13, fontWeight: 700, textAlign: 'center' }}>{p.name}</div>
    </div>
  )
}

function CompareRow({ a, b }: { a: SpecRow; b: SpecRow }) {
  const w = winnerOf(a, b)
  const maxValue = Math.max(a.number ?? 0, b.number ?? 0)
  const showBars = a.number != null && b.number != null && maxValue > 0
  return (
    <div style={{ padding: '10px 0' }}>
      <div className="muted" style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1 }}>{a.label.toUpperCase()}</div>
      <div style={{ height: 6 }} />
      <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
        <CompareCell row={a} winning={w === 1} color={LeftColor} fraction={showBars ? a.number! / maxValue : null} />
        <CompareCell row={b} winning={w === 2} color={RightColor} fraction={showBars ? b.number! / maxValue : null} />
      </div>
    </div>
  )
}

function CompareCell({ row, winning, color, fraction }: { row: SpecRow; winning: boolean; color: string; fraction: number | null }) {
  const [started, setStarted] = useState(false)
  useEffect(() => { const id = requestAnimationFrame(() => setStarted(true)); return () => cancelAnimationFrame(id) }, [])
  const width = started && fraction != null ? Math.min(1, Math.max(0.03, fraction)) : 0
  return (
    <div className="grow col">
      <div className="row" style={{ gap: 4 }}>
        <span style={{
          color: row.text == null ? '#444' : winning ? '#fff' : '#D3D3D3', fontSize: 13, fontWeight: winning ? 900 : 500,
        }}>{row.text ?? NOT_PUBLISHED}</span>
        {winning && <DIcon name="electricBolt" size={14} color={color} />}
      </div>
      {fraction != null && (
        <>
          <div style={{ height: 4 }} />
          <div className="cmp-track">
            <div className="cmp-bar" style={{ width: `${width * 100}%`, background: `linear-gradient(90deg, ${color}66, ${color})` }} />
          </div>
        </>
      )}
    </div>
  )
}

/** Faint grid of lines drifting behind the screen (CompareScreen.kt MovingGridBackground). Place inside a position:relative box. */
export function MovingGridBackground() {
  return <div className="moving-grid" aria-hidden />
}
