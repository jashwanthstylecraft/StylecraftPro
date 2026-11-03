import { useMemo, useState } from 'react'
import { CompatibleAccessoriesRow } from './AccessoriesScreen'
import { Product, categoryLabel, hasMotor, isStylecraft } from '../data/product'
import { Accessory, AccessoryRepository, accessoryIsOwnBrand, accessoryIsStylecraft, accessoryTypeLabel, useAccessories } from '../data/accessory'
import { Combo, Family } from '../data/combo'
import { AppPrefs, usePref } from '../data/prefs'
import { MeasurementStore, useMeasurements } from '../data/measurements'
import { checkClaim, claimIsRange, claimText, measuredRows, specRows, speedClaim, verdictDiffText } from '../data/specs'
import { TeamSync } from '../data/teamsync'
import { money, nf } from '../data/format'
import { Brand, Pill, ProductImage, ScreenHeader, Spinner, localImageUrls, motorImageUrl, openUrl, showToast } from '../ui/Common'
import { DataCallout, EnergyParticleSystem, RotatingScannerRing } from '../ui/Blueprint'
import { staggerStyle } from '../ui/Motion'
import { useIsSplit } from '../ui/adaptive'
import { t, tr } from '../ui/i18n'
import { Icon } from '../ui/icons'
import { CertificationsCard, DocumentsCard } from './DocsUi'
import { FamilyAndCombosStrip } from './FamiliesScreen'
import { DIcon } from './detailIcons'
import './detail.css'

export interface ProductDetailScreenProps {
  product: Product
  onBack: () => void
  onCompare: () => void
  onMeasure: () => void
  onOpenAccessory: (a: Accessory) => void
  onAllAccessories: () => void
  onAddLead: () => void
  onOpenProduct: (p: Product) => void
  onOpenFamily: (f: Family) => void
  onOpenCombo: (c: Combo) => void
}

const AMBER = '#FFCC80'
const AccessoryAccent = '#B388FF'
const stagger = (i: number, stepMs = 70, risePx = 28) => ({ className: 'stagger', style: staggerStyle(i, stepMs, risePx) })

export function ProductDetailScreen(props: ProductDetailScreenProps) {
  const { product } = props
  const split = useIsSplit()
  const favorites = usePref('favorites')
  const isFavorite = favorites.includes(product.id)

  const star = (
    <button className="icon-btn" aria-label={t('Favorite')} onClick={() => AppPrefs.toggleFavorite(product.id)}
      style={{ color: isFavorite ? '#FFC400' : '#fff' }}>
      <span style={{ display: 'inline-flex', transform: isFavorite ? 'scale(1.2)' : 'scale(1)', transition: 'transform 420ms cubic-bezier(0.34, 1.9, 0.64, 1)' }}>
        <Icon name={isFavorite ? 'star' : 'starBorder'} />
      </span>
    </button>
  )
  const header = (
    <ScreenHeader title={product.name.toUpperCase()} subtitle={`${product.brand.toUpperCase()} · ${t(categoryLabel(product.category)).toUpperCase()}`}
      onBack={props.onBack} actions={star} />
  )

  // key = product id so every piece of local state (colors, "show unlisted", sources) resets when another product opens
  if (split) {
    // Tablets / desktop: photo, specs and actions on the left; certifications, documents, family and accessories on the right.
    return (
      <div className="screen" key={product.id}>
        {header}
        <div className="row detail-split" style={{ flex: '1 1 0', minHeight: 0, alignItems: 'stretch', gap: 4 }}>
          <div className="scroll grow">
            <Overview {...props} split />
            <Actions {...props} />
            <div style={{ height: 40 }} />
          </div>
          <div className="scroll grow">
            <SalesKit {...props} />
            <div style={{ height: 40 }} />
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="screen" key={product.id}>
      <div className="scroll">
        {header}
        <Overview {...props} split={false} />
        <SalesKit {...props} />
        <Actions {...props} />
        <div style={{ height: 40 }} />
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ overview: photo, pills, specs, features

function Overview({ product, split }: ProductDetailScreenProps & { split: boolean }) {
  const [variant, setVariant] = useState(0)
  const hasVariants = useMemo(() => localImageUrls(product).length > 1, [product])
  const [showMissing, setShowMissing] = useState(false)

  const allRows = specRows(product)
  const known = allRows.filter(r => r.text != null)
  const missing = allRows.filter(r => r.text == null)
  const rows = showMissing ? [...known, ...missing] : known

  return (
    <>
      {/* Hero photo */}
      <div {...stagger(0, 70, 40)} style={{ ...staggerStyle(0, 70, 40), padding: '0 16px' }}>
        <div className="detail-hero" onClick={() => { if (hasVariants) setVariant(v => v + 1) }}
          style={{ aspectRatio: split ? '1.35' : '1.1', cursor: hasVariants ? 'pointer' : 'default' }}>
          <div key={variant} className="fade-350" style={{ position: 'absolute', inset: 20 }}>
            <ProductImage product={product} variantIndex={variant} />
          </div>
          {hasVariants && <div style={{ position: 'absolute', bottom: 4, left: 0, right: 0, textAlign: 'center', color: '#A9A9A9', fontSize: 11 }}>{t('Tap for colors')}</div>}
        </div>
      </div>

      <div className="row" style={{ padding: '12px 16px', gap: 8, flexWrap: 'wrap' }}>
        {product.model != null && <Pill text={product.model} color={Brand.Cyan} />}
        {isStylecraft(product) ? <Pill text="STYLECRAFT" color={Brand.Red} /> : <Pill text={t('COMPETITOR')} color={Brand.Muted} />}
        {product.priceUsd != null && <Pill text={money(product.priceUsd)} color={Brand.Lime} />}
      </div>

      {/* Spec sheet: published specs first; missing ones are tucked away instead of leaving blanks */}
      <div {...stagger(2)} style={{ ...staggerStyle(2), padding: '0 16px' }}>
        <div className="card" style={{ borderRadius: 18, padding: '6px 0' }}>
          {rows.map((row, i) => (
            <div key={row.label}>
              <div className="row stagger" style={{ ...staggerStyle(3 + i, 45, 10), padding: '11px 16px', alignItems: 'center' }}>
                <div className="muted" style={{ fontSize: 14, flex: '0 0 42%' }}>{t(row.label)}</div>
                <div style={{
                  flex: '1 1 0', textAlign: 'right', fontSize: row.text != null ? 14 : 12, fontWeight: row.text != null ? 600 : 400,
                  color: row.text == null ? '#888' : row.estimated ? AMBER : '#fff',
                }}>
                  {row.text != null
                    ? (row.estimated ? row.text.replace(/ \(est\.\)$/, '') + ' (' + t('est.') + ')' : row.text)
                    : t('Not listed by') + ' ' + product.brand}
                </div>
              </div>
              {i < rows.length - 1 && <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '0 16px' }} />}
            </div>
          ))}
          {known.some(r => r.estimated) && (
            <div style={{ color: AMBER, opacity: 0.7, fontSize: 11, padding: '4px 16px' }}>
              {t("est. = taken from a sister model or another country's version; the brand doesn't list it for this exact model.")}
            </div>
          )}
          {missing.length > 0 && (
            <button className="btn btn-text" style={{ margin: '0 6px', fontSize: 12, textAlign: 'left', height: 'auto', padding: '8px 10px' }} onClick={() => setShowMissing(s => !s)}>
              {showMissing ? t('Hide unlisted specs')
                : `${missing.length} ` + t('not listed by') + ` ${product.brand}: ${missing.map(r => t(r.label).toLowerCase()).join(', ')}`}
            </button>
          )}
        </div>
      </div>

      {product.features.length > 0 && (
        <>
          <div className="section-title" style={{ padding: '24px 0 8px 20px', fontSize: 12 }}>{t('KEY FEATURES')}</div>
          {product.features.map((f, i) => (
            <div key={i} className="row" style={{ padding: '3px 20px', alignItems: 'flex-start' }}>
              <span style={{ color: Brand.Red, fontWeight: 900 }}>•</span>
              <span style={{ width: 8, flex: '0 0 auto' }} />
              <span style={{ color: '#D3D3D3', fontSize: 14 }}>{f}</span>
            </div>
          ))}
        </>
      )}
    </>
  )
}

// ------------------------------------------------------------------ sales kit: certs, tests, family, docs, accessories, readings

function SalesKit({ product, onOpenProduct, onOpenFamily, onOpenCombo, onOpenAccessory, onAllAccessories }: ProductDetailScreenProps) {
  const testRows = useMemo(() => measuredRows(product), [product])
  return (
    <>
      {/* What it's certified for (UL/ETL, NOM, CE, battery UN38.3...) - the first thing reps get asked */}
      <CertificationsCard product={product} {...stagger(4)} />

      {/* Stylecraft's own test results (from the catalog / Google Sheet), next to what the brand claims */}
      {testRows.length > 0 && (
        <div {...stagger(4)} style={{ ...staggerStyle(4), padding: '20px 16px 0' }}>
          <div className="card" style={{ borderRadius: 18, borderColor: 'rgba(204,255,0,0.5)', padding: 16 }}>
            <div className="section-title lime" style={{ ['--c' as string]: Brand.Lime }}>{t('MEASURED BY STYLECRAFT')}</div>
            {product.measuredDate && <div className="muted" style={{ fontSize: 11 }}>{t('Tested') + ' ' + product.measuredDate}</div>}
            <div style={{ height: 6 }} />
            {testRows.map(r => {
              const claimed = r.label === 'Measured speed' ? (product.rpmText ?? (product.rpm != null ? nf(product.rpm) + ' RPM' : null))
                : r.label === 'Measured noise' ? (product.noiseDb != null ? `${Math.trunc(product.noiseDb)} dB` : null)
                : (product.wattage != null ? (product.wattage % 1 === 0 ? `${product.wattage} W` : `${product.wattage} W`) : null)
              return (
                <div key={r.label} className="row" style={{ padding: '6px 0' }}>
                  <div className="muted grow" style={{ fontSize: 14 }}>{t(r.label)}</div>
                  <div className="col" style={{ alignItems: 'flex-end' }}>
                    <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{r.text ?? ''}</div>
                    <div style={{ color: 'gray', fontSize: 11 }}>{t('Brand claims') + ': ' + (claimed ?? t('Not listed'))}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <FamilyAndCombosStrip product={product} onOpenProduct={onOpenProduct} onOpenFamily={onOpenFamily} onOpenCombo={onOpenCombo} />

      {/* IB, TDS, battery SDS, certificates and test reports (Access column decides view / share) */}
      <DocumentsCard product={product} />

      <CompatibleAccessoriesRow product={product} onOpen={onOpenAccessory} onSeeAll={onAllAccessories} />

      <SpeedReadings product={product} />
    </>
  )
}

/** Speed readings saved from the Speed Analyzer, compared with what the brand claims. */
function SpeedReadings({ product }: { product: Product }) {
  const all = useMeasurements()
  const [sending, setSending] = useState(false)
  const measurements = useMemo(() => all.filter(m => m.productId === product.id && m.rpm > 0).sort((a, b) => b.timestamp - a.timestamp), [all, product.id])
  if (measurements.length === 0) return null
  const avg = Math.trunc(measurements.reduce((s, m) => s + m.rpm, 0) / measurements.length)
  const claim = speedClaim(product)
  const verdict = claim ? checkClaim(claim, avg) : null
  const fmtDate = (ts: number) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

  const send = async () => {
    if (!TeamSync.isConfigured) { showToast(tr('Add the Team Google Sheet link in Settings first')); return }
    setSending(true)
    const r = await TeamSync.sendMeasurement(product, avg)
    const msg = r.kind === 'ok' ? tr('Sent to catalog') + ': ' + r.message
      : r.kind === 'notConfigured' ? tr('Add the Team Google Sheet link in Settings first')
      : tr("Couldn't send") + ': ' + r.reason
    setSending(false)
    showToast(msg)
  }

  return (
    <div style={{ padding: '20px 16px 0' }}>
      <div className="card" style={{ borderRadius: 18, borderColor: 'rgba(204,255,0,0.4)', padding: 16 }}>
        <div className="section-title" style={{ ['--c' as string]: Brand.Lime }}>{t('MEASURED SPEED')}</div>
        <div style={{ height: 8 }} />
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="grow col">
            <div className="muted" style={{ fontSize: 12 }}>{t('Brand claims')}</div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: claim && claimIsRange(claim) ? 15 : 18 }}>{claim ? claimText(claim) : t('Not listed')}</div>
          </div>
          <div className="grow col">
            <div className="muted" style={{ fontSize: 12 }}>{t('Measured average') + ` (${measurements.length})`}</div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>{nf(avg) + ' RPM'}</div>
          </div>
        </div>
        {claim && verdict && (
          <div style={{ paddingTop: 6, fontWeight: 700, fontSize: 13, color: verdict.matches ? Brand.Lime : '#FFAB40' }}>
            {t(verdict.label) + (claimIsRange(claim) && verdict.diffPct === 0 ? ' (' + t('within') + ` ${claimText(claim)})` : ` (${verdictDiffText(verdict)})`)}
          </div>
        )}
        {/* Send the average to the team Google Sheet, so it shows as "Measured by Stylecraft" on every phone */}
        <button className="btn btn-outline btn-block" disabled={sending} onClick={send}
          style={{ marginTop: 10, borderColor: 'rgba(204,255,0,0.6)', borderRadius: 10, color: Brand.Lime, fontSize: 13 }}>
          {sending ? <Spinner size={16} color={Brand.Lime} /> : t('SEND TO CATALOG') + ' · ' + nf(avg) + ' RPM'}
        </button>
        <div style={{ height: 8 }} />
        {measurements.slice(0, 6).map((m, i) => (
          <div key={m.timestamp + '-' + i} className="row">
            <div className="grow" style={{ color: 'gray', fontSize: 12 }}>{fmtDate(m.timestamp)}</div>
            <div style={{ color: '#D3D3D3', fontSize: 13 }}>{nf(m.rpm) + ' RPM'}</div>
            <button className="icon-btn" style={{ width: 32, height: 32 }} aria-label={t('Delete')} onClick={() => MeasurementStore.remove(m)}>
              <DIcon name="close" size={16} color="#444" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ actions: motor animation, buttons, sources

function Actions({ product, onCompare, onMeasure, onAddLead }: ProductDetailScreenProps) {
  // Motor animation for Stylecraft / Gamma+ (IN2 vector motor, or the Rebel 2.0 animation for DC motors).
  // The numbers shown come from this product's own specs.
  const motorUrl = useMemo(() => motorImageUrl(product), [product])
  const link = product.buyUrl ?? product.websiteUrl ?? product.sourceUrl
  const allSources = useMemo(() => [...new Set([...(product.sourceUrl ? [product.sourceUrl] : []), ...product.sources])], [product])
  const [showSources, setShowSources] = useState(false)

  return (
    <>
      {motorUrl && (
        <div style={{ marginTop: 16, height: 260, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <EnergyParticleSystem />
          <RotatingScannerRing size={240} style={{ position: 'absolute' }} />
          <img src={motorUrl} alt="Motor" style={{ width: 150, height: 150, objectFit: 'contain', position: 'relative' }} />
          <DataCallout label={t('CORE POWER')} value={product.rpmText ?? (product.rpm != null ? `${product.rpm} RPM` : '')}
            style={{ position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)', alignItems: 'center' }} />
          {product.motorType != null && (
            <DataCallout label={t('MOTOR')} value="" subValue={product.motorType}
              style={{ position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)', alignItems: 'center' }} />
          )}
        </div>
      )}

      <div style={{ height: 20 }} />
      <div className="row stagger" style={{ ...staggerStyle(6), padding: '0 16px', gap: 12 }}>
        <button className="btn btn-red grow" style={{ height: 54, borderRadius: 12 }} onClick={onCompare}>
          <DIcon name="compareArrows" color="#fff" />{t('COMPARE')}
        </button>
        {hasMotor(product.category) && (
          <button className="btn btn-cyan grow" style={{ height: 54, borderRadius: 12 }} onClick={onMeasure}>
            <DIcon name="speed" color="#000" />{t('MEASURE')}
          </button>
        )}
      </div>

      {link != null && (
        <div style={{ padding: '12px 16px' }}>
          <button className="btn btn-outline btn-block" style={{ height: 50, borderRadius: 12, fontSize: 13, fontWeight: 700, letterSpacing: 0 }} onClick={() => openUrl(link)}>
            <Icon name="openInNew" size={18} color="#fff" />
            {isStylecraft(product) ? t('BUY DIRECT FROM STYLECRAFT')
              : product.buyUrl != null ? t('WHERE TO BUY') + (product.priceUsd != null ? ' · ' + money(product.priceUsd) : '')
              : t('VIEW ON BRAND SITE')}
          </button>
        </div>
      )}
      <div style={{ padding: '0 16px' }}>
        <button className="btn btn-outline btn-block" onClick={onAddLead}
          style={{ height: 50, borderRadius: 12, fontSize: 13, fontWeight: 700, letterSpacing: 0, color: '#69F0AE', borderColor: 'rgba(105,240,174,0.6)' }}>
          <DIcon name="personAdd" size={18} color="#69F0AE" />{t('SAVE A LEAD FOR THIS PRODUCT')}
        </button>
      </div>

      {/* Where the specs came from (brand page, manuals, retailers) */}
      {allSources.length > 0 && (
        <>
          <button className="btn btn-text" style={{ margin: '0 8px', fontSize: 12 }} onClick={() => setShowSources(s => !s)}>
            {(showSources ? t('Hide spec sources') : t('Spec sources')) + ` (${allSources.length})`}
          </button>
          {showSources && allSources.map(url => (
            <div key={url} className="ellipsis" onClick={() => openUrl(url)}
              style={{ color: Brand.Cyan, opacity: 0.8, fontSize: 11, padding: '5px 20px', cursor: 'pointer' }}>
              {url.replace(/^https:\/\//, '').replace(/^www\./, '').slice(0, 70)}
            </div>
          ))}
        </>
      )}
    </>
  )
}
