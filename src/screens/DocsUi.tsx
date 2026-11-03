import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import { Product } from '../data/product'
import { CertMarks, DocInfo, DocsRepository, certIsEmpty, docExtension, useCerts, useDocs } from '../data/docs'
import { usePref } from '../data/prefs'
import { Brand, Spinner, showToast } from '../ui/Common'
import { Icon } from '../ui/icons'
import { shareFile } from '../ui/share'
import { t, tr } from '../ui/i18n'
import { DIcon } from './detailIcons'
import './docs.css'

const CertGreen = '#00E676'
const BatteryBlue = '#40C4FF'

const isOwnBrand = (p: Product) => p.brand.toLowerCase() === 'stylecraft' || p.brand.toLowerCase() === 'gamma+'

interface CardProps { product: Product; className?: string; style?: CSSProperties }

/**
 * Certification badges: what the product is certified for and where that lets it be sold.
 * Solid badge = certificate on file; outlined "tested" badge = test report only (certificate not on file yet).
 */
export function CertificationsCard({ product, className, style }: CardProps) {
  const all = useCerts()
  const region = usePref('region')
  const mine = useMemo(() => CertMarks.marksForRegion(region), [region])
  if (!isOwnBrand(product)) return null
  const certs = all[product.id] ?? { certified: [], tested: [] }
  const empty = certIsEmpty(certs)
  const ok = [...certs.certified, ...certs.tested].some(m => mine.has(m))
  return (
    <div className={className} style={{ padding: '20px 16px 0', ...style }}>
      <div className="card" style={{ borderRadius: 18, borderColor: CertGreen + '73', padding: 16 }}>
        <div className="row" style={{ gap: 6 }}>
          <DIcon name="verified" size={18} color={CertGreen} />
          <div className="section-title" style={{ ['--c' as string]: CertGreen }}>{t('CERTIFICATIONS')}</div>
        </div>
        <div style={{ height: 10 }} />
        {empty ? (
          <div className="muted" style={{ fontSize: 13 }}>{t('No certificates on file yet. Ask engineering before quoting certifications.')}</div>
        ) : (
          <>
            <div className="row wrap" style={{ gap: 8 }}>
              {certs.certified.map(m => <CertBadge key={'c' + m} mark={m} certified highlight={mine.has(m)} />)}
              {certs.tested.map(m => <CertBadge key={'t' + m} mark={m} certified={false} highlight={mine.has(m)} />)}
            </div>
            {certs.tested.length > 0 && (
              <div className="muted" style={{ fontSize: 11, paddingTop: 8 }}>{t('Outlined = tested, certificate not on file yet.')}</div>
            )}
            {region.trim() !== '' && mine.size > 0 && (
              <div style={{ paddingTop: 6, fontSize: 12, fontWeight: 700, color: ok ? CertGreen : '#FFAB40' }}>
                {ok ? t('Starred marks apply to your region') + ' (' + region + ')' : t('No certification on file for your region') + ' (' + region + ')'}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function CertBadge({ mark, certified, highlight }: { mark: string; certified: boolean; highlight: boolean }) {
  const info = CertMarks.info(mark)
  const color = info.group === 'BATTERY' ? BatteryBlue : CertGreen
  const sub = [info.market || null, !certified ? tr('tested') : null].filter(Boolean).join(' · ')
  return (
    <div style={{
      border: `${highlight ? 2 : 1}px solid ${color}${certified ? '' : '99'}`, borderRadius: 10, padding: '6px 10px',
      background: certified ? color + '29' : 'transparent',
    }}>
      <div style={{ color: '#fff', fontSize: 14, fontWeight: 900 }}>{(highlight ? '★ ' : '') + mark}</div>
      {sub && <div style={{ color, fontSize: 10, fontWeight: 700 }}>{sub}</div>}
    </div>
  )
}

const TYPE_ORDER = ['IB', 'TDS', 'Certificate', 'Test report', 'SDS', 'Other', 'Inspection']
const typeRank = (type: string) => { const i = TYPE_ORDER.indexOf(type); return i < 0 ? 99 : i }
function typeLabel(type: string): string {
  switch (type) {
    case 'IB': return 'Instruction booklets (IB)'
    case 'TDS': return 'Technical data sheets (TDS)'
    case 'Certificate': return 'Certificates'
    case 'Test report': return 'Test reports'
    case 'SDS': return 'Battery safety data sheets (SDS)'
    case 'Inspection': return 'Inspection reports'
    default: return 'Other documents'
  }
}

interface Viewing { doc: DocInfo; blob: Blob; url: string; fileName: string }

/** IB, TDS, battery SDS, certificates and test reports for this product. Tap to open; share icon only where allowed. */
export function DocumentsCard({ product, className, style }: CardProps) {
  const all = useDocs()
  const docs = useMemo(() => all.filter(d => d.products.includes(product.id)), [all, product.id])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [viewing, setViewing] = useState<Viewing | null>(null)
  const viewingRef = useRef<Viewing | null>(null)
  viewingRef.current = viewing
  useEffect(() => () => { if (viewingRef.current) URL.revokeObjectURL(viewingRef.current.url) }, [])

  const groups = useMemo(() => {
    const m = new Map<string, DocInfo[]>()
    docs.forEach(d => { m.set(d.type, [...(m.get(d.type) ?? []), d]) })
    return [...m.entries()].sort((a, b) => typeRank(a[0]) - typeRank(b[0]))
  }, [docs])

  if (!isOwnBrand(product)) return null

  const open = async (doc: DocInfo, share: boolean) => {
    if (busyId != null) return
    setBusyId(doc.id)
    try {
      const r = await DocsRepository.fetch(doc)
      if (!r.ok) { showToast(tr("Couldn't open") + ': ' + tr(r.reason)); return }
      const name = r.fileName || doc.fileName || doc.title
      if (share) {
        const file = new File([r.blob], name, { type: r.mime })
        const out = await shareFile(file, doc.title)
        if (out === 'downloaded') showToast(tr('Saved to your downloads'))
      } else if (docExtension(doc) === 'pdf' || r.mime === 'application/pdf') {
        const typed = r.blob.type === 'application/pdf' ? r.blob : new Blob([r.blob], { type: 'application/pdf' })
        setViewing({ doc, blob: typed, url: URL.createObjectURL(typed), fileName: name })
      } else {
        // Word / Excel / image: let the browser open or download it (Android: "open with another app")
        const url = URL.createObjectURL(r.blob)
        const w = window.open(url, '_blank')
        if (!w) {
          const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
        }
        setTimeout(() => URL.revokeObjectURL(url), 60000)
      }
    } finally {
      setBusyId(null)
    }
  }

  const close = () => { if (viewing) URL.revokeObjectURL(viewing.url); setViewing(null) }

  return (
    <div className={className} style={{ padding: '20px 16px 0', ...style }}>
      <div className="card" style={{ borderRadius: 18, padding: 16 }}>
        <div className="row" style={{ gap: 6 }}>
          <DIcon name="description" size={18} color={Brand.Cyan} />
          <div className="section-title grow">{t('DOCUMENTS')}</div>
          <button className="icon-btn" style={{ width: 32, height: 32 }} aria-label={t('Refresh')} onClick={async () => {
            setRefreshing(true)
            await DocsRepository.refresh()
            setRefreshing(false)
          }}>
            {refreshing ? <Spinner size={16} color={Brand.Cyan} /> : <Icon name="refresh" size={18} color={Brand.Muted} />}
          </button>
        </div>
        {docs.length === 0 && <div className="muted" style={{ fontSize: 13, paddingTop: 6 }}>{t('No documents for this product yet.')}</div>}
        {groups.map(([type, list]) => (
          <div key={type}>
            <div className="muted" style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, padding: '12px 0 4px' }}>{t(typeLabel(type)).toUpperCase()}</div>
            {list.map(d => {
              const sub = [d.marks.join(', '), d.issuer, d.date.slice(0, 10), d.language, docExtension(d).toUpperCase()].filter(s => s.trim() !== '').join(' · ')
              return (
                <div key={d.id} className="row doc-row" onClick={() => open(d, false)}>
                  <div className="grow">
                    <div className="doc-title">{d.title}</div>
                    {sub && <div className="muted ellipsis" style={{ fontSize: 11 }}>{sub}</div>}
                  </div>
                  {busyId === d.id ? <Spinner size={22} color={Brand.Cyan} />
                    : d.share ? (
                      <button className="icon-btn" aria-label={t('Send to customer')} onClick={e => { e.stopPropagation(); open(d, true) }}>
                        <Icon name="share" color={Brand.Lime} />
                      </button>
                    ) : <span style={{ padding: 12, display: 'inline-flex' }} title={t('View only')}><Icon name="lock" size={18} color={Brand.Muted} /></span>}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      {viewing && (
        <PdfViewer title={viewing.doc.title} url={viewing.url} canShare={viewing.doc.share} onClose={close}
          onShare={async () => {
            const out = await shareFile(new File([viewing.blob], viewing.fileName, { type: 'application/pdf' }), viewing.doc.title)
            if (out === 'downloaded') showToast(tr('Saved to your downloads'))
          }} />
      )}
    </div>
  )
}

/** In-app PDF reader: the browser's own PDF viewer in a full-screen layer (zoom / scroll / pages built in). */
function PdfViewer({ title, url, canShare, onShare, onClose }: { title: string; url: string; canShare: boolean; onShare: () => void; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="pdf-viewer">
      <div className="row" style={{ padding: 8 }}>
        <button className="icon-btn" aria-label={t('Close')} onClick={onClose}><Icon name="close" /></button>
        <div className="grow ellipsis" style={{ fontWeight: 700 }}>{title}</div>
        <a className="icon-btn" href={url} target="_blank" rel="noopener noreferrer" aria-label={tr('Open in new tab')}><Icon name="openInNew" /></a>
        {canShare && <button className="icon-btn" aria-label={t('Send to customer')} onClick={onShare}><Icon name="share" color={Brand.Lime} /></button>}
      </div>
      <object className="grow" data={url} type="application/pdf" style={{ width: '100%', background: '#fff', border: 0 }}>
        <div className="col center" style={{ height: '100%', padding: 24, background: '#000', gap: 12 }}>
          <div style={{ color: '#fff', textAlign: 'center' }}>{tr("This browser can't show PDFs inside the page.")}</div>
          <a className="btn btn-cyan" href={url} target="_blank" rel="noopener noreferrer">{tr('OPEN PDF')}</a>
        </div>
      </object>
    </div>
  )
}
