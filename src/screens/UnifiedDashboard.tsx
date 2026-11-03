// Port of UnifiedDashboard.kt (Speed Analyzer). Engine: src/audio/engine.ts (UnifiedViewModel), DSP: src/audio/dsp.ts.
import { CSSProperties, ReactNode, useEffect, useState } from 'react'
import { Product, displayName, hasMotor } from '../data/product'
import { MeasurementStore } from '../data/measurements'
import { claimIsRange, claimText, checkClaim, speedClaim, verdictDiffText, NOT_PUBLISHED } from '../data/specs'
import { useProducts } from '../data/repository'
import { useStore } from '../data/store'
import { AnalyzerMode } from '../nav/screens'
import { analyzer, UnifiedState } from '../audio/engine'
import { ScreenHeader, BottomSheet, showToast } from '../ui/Common'
import { ProductPickerList } from '../ui/Pickers'
import { ImpactGauge, UltraGauge } from '../ui/Gauges'
import { ReadableWidth } from '../ui/adaptive'
import { t, useLang } from '../ui/i18n'
import { assetUrl } from '../data/repository'

export interface UnifiedDashboardProps {
  initialMode: AnalyzerMode | null | undefined
  product: Product | null | undefined
  onBack: () => void
}

const CYAN = '#00E5FF'
const LIME = '#CCFF00'
const RED = '#FF1744'

const card = (radius: number, alpha: number): CSSProperties => ({
  background: `rgba(0,0,0,${alpha})`, borderRadius: radius, width: '100%',
})

export function UnifiedDashboard({ initialMode, product, onBack }: UnifiedDashboardProps) {
  useLang()
  const state = useStore(analyzer.state)
  const allProducts = useProducts()
  const [target, setTarget] = useState<Product | null | undefined>(product)
  const [showPicker, setShowPicker] = useState(false)

  // remember(product?.id)
  useEffect(() => { setTarget(product) }, [product?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (initialMode && initialMode !== analyzer.state.get().mode) analyzer.setMode(initialMode)
  }, [initialMode])

  // Turn the microphone off when leaving this screen or when the tab goes to the background.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') analyzer.stop() }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide as EventListener)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide as EventListener)
      analyzer.stop()
    }
  }, [])

  const save = (p: Product) => {
    const rpm = analyzer.state.get().displayedValue
    if (rpm <= 0) return
    MeasurementStore.add({ productId: p.id, rpm, mode: analyzer.state.get().mode, timestamp: Date.now() })
    setTarget(p)
    showToast(`${t('Saved to')} ${p.name}: ${rpm} RPM`)
  }

  const gaugeStyle: CSSProperties = { width: '100%', height: 280 }
  const canSave = state.displayedValue > 0
  const choices = allProducts.filter(p => state.mode === 'DRYER' ? p.category === 'DRYER' : p.category !== 'DRYER' && hasMotor(p.category))

  return (
    <div className="screen" style={{ position: 'relative' }}>
      <img src={assetUrl('img/bgapp.webp')} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
      <div className="scroll" style={{ position: 'relative' }}>
        <ReadableWidth maxWidth={720}>
          <ScreenHeader title={t('SPEED ANALYZER')} subtitle={t('RPM VIA MICROPHONE')} onBack={onBack} />

          <div className="col" style={{ padding: '0 24px', alignItems: 'center' }}>
            {/* CLIPPER / DRYER segmented control */}
            <div style={{ display: 'flex', width: '100%', margin: '16px 0' }} role="tablist">
              <Segment selected={state.mode === 'CLIPPER'} first onClick={() => analyzer.setMode('CLIPPER')}>{t('CLIPPER / TRIMMER')}</Segment>
              <Segment selected={state.mode === 'DRYER'} onClick={() => analyzer.setMode('DRYER')}>{t('DRYER')}</Segment>
            </div>

            {state.mode === 'CLIPPER'
              ? <ImpactGauge rpm={state.displayedValue} style={gaugeStyle} />
              : <UltraGauge rpm={state.displayedValue} style={gaugeStyle} />}

            {/* Claimed vs measured for the product being tested */}
            {target && <TestingCard target={target} rpm={state.displayedValue} />}

            <div style={{ height: 16 }} />
            <button
              className="bounce"
              disabled={!canSave}
              onClick={() => { if (target) save(target); else setShowPicker(true) }}
              style={{
                width: '100%', height: 50, border: 'none', borderRadius: 14, fontWeight: 900, fontSize: 14, letterSpacing: 0.5,
                cursor: canSave ? 'pointer' : 'default',
                background: canSave ? LIME : 'rgba(255,255,255,0.08)', color: canSave ? '#000' : 'gray',
              }}
            >
              {target ? t('SAVE READING') : t('SAVE READING TO A PRODUCT')}
            </button>
            {target && (
              <button onClick={() => setShowPicker(true)} style={{ background: 'none', border: 'none', color: 'gray', fontSize: 12, padding: '10px 12px', cursor: 'pointer' }}>
                {t('Change product')}
              </button>
            )}

            <div style={{ height: 16 }} />

            {state.mode === 'DRYER' && (
              <>
                <BladeSelector selected={state.dryerBladeCount} onSelect={n => analyzer.setDryerBladeCount(n)} />
                <div style={{ height: 24 }} />
              </>
            )}

            <ProControls state={state} onToggle={() => analyzer.toggleMeasurement()} />

            <div style={{ height: 32 }} />
            <UnifiedInstructions mode={state.mode} />
            <div style={{ height: 48 }} />
          </div>
        </ReadableWidth>
      </div>

      {showPicker && (
        <BottomSheet onClose={() => setShowPicker(false)}>
          <ProductPickerList
            title={t('Which product are you measuring?')}
            subtitle={t("The reading is saved to that product's page.")}
            products={choices}
            onPick={p => {
              setShowPicker(false)
              setTarget(p)
              if (analyzer.state.get().displayedValue > 0) save(p)
            }}
          />
        </BottomSheet>
      )}
    </div>
  )
}

/** Material3 SingleChoiceSegmentedButton look (dark scheme). */
function Segment({ selected, first, onClick, children }: { selected: boolean; first?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      role="tab" aria-selected={selected} onClick={onClick}
      style={{
        flex: 1, height: 40, cursor: 'pointer', fontSize: 14, fontWeight: 500, letterSpacing: 0.1,
        border: '1px solid #938F99', borderLeftWidth: first ? 1 : 0,
        borderRadius: first ? '20px 0 0 20px' : '0 20px 20px 0',
        background: selected ? '#4A4458' : 'transparent', color: selected ? '#E8DEF8' : '#CAC4D0',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      }}
    >
      {selected && <span aria-hidden>✓</span>}{children}
    </button>
  )
}

function TestingCard({ target, rpm }: { target: Product; rpm: number }) {
  const claim = speedClaim(target)
  const verdict = claim && rpm > 0 ? checkClaim(claim, rpm) : null
  const claimLine = (claim && claimIsRange(claim) ? claimText(claim) : null) ?? target.rpmText ?? (claim ? claimText(claim) : null) ?? t(NOT_PUBLISHED)
  return (
    <div style={{ ...card(16, 0.6), marginTop: 8, padding: 14 }}>
      <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{t('TESTING') + ': ' + displayName(target)}</div>
      <div style={{ color: 'gray', fontSize: 13 }}>{t('Brand claims') + ': ' + claimLine}</div>
      {claim && verdict && (
        <div style={{ color: verdict.matches ? LIME : '#FFAB40', fontSize: 13, fontWeight: 700 }}>
          {t('Now') + `: ${rpm} RPM · ` + t(verdict.label) + (claimIsRange(claim) && verdict.diffPct === 0 ? '' : ` (${verdictDiffText(verdict)})`)}
        </div>
      )}
    </div>
  )
}

function ProControls({ state, onToggle }: { state: UnifiedState; onToggle: () => void }) {
  const lang = useLang()
  const healthColor: Record<string, string> = {
    'CLEAN SIGNAL': '#00FF00', 'GOOD SIGNAL': LIME, 'WEAK SIGNAL': '#FFFF00', 'TOO NOISY': '#FF8A65',
  }
  // Web-only hint: the browser, not the OS, asks for the microphone.
  const hint = state.status === 'MICROPHONE PERMISSION NEEDED'
    ? (lang === 'es' ? 'Permite el micrófono en la configuración del sitio de tu navegador y pulsa START otra vez.' : 'Allow microphone access in your browser\'s site settings, then press START again.')
    : state.status === 'MICROPHONE UNAVAILABLE'
      ? (lang === 'es' ? 'No se encontró micrófono, o la página necesita HTTPS.' : 'No microphone found, or the page needs HTTPS.')
      : null
  return (
    <div style={{ ...card(20, 0.6), padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {state.mode === 'CLIPPER' && state.isRunning ? (
        <>
          <div style={{ color: healthColor[state.clipperHealth] ?? '#fff', fontWeight: 700, fontSize: 18 }}>{t(state.clipperHealth)}</div>
          <div style={{ color: 'gray', fontSize: 13 }}>{t('Signal strength') + ': ' + t(state.clipperQuality)}</div>
        </>
      ) : (
        <div style={{ color: state.isRunning ? LIME : 'gray', fontWeight: 800, fontSize: 13 }}>{t(state.status)}</div>
      )}
      {hint && <div style={{ color: 'gray', fontSize: 12, textAlign: 'center', marginTop: 6 }}>{hint}</div>}

      <div style={{ height: 16 }} />
      <button
        className="bounce" onClick={onToggle}
        style={{ width: '100%', height: 56, border: 'none', borderRadius: 14, background: state.isRunning ? RED : CYAN, color: '#000', fontWeight: 700, fontSize: 14, letterSpacing: 0.5, cursor: 'pointer' }}
      >
        {state.isRunning ? 'STOP SENSOR' : 'START ANALYZER'}
      </button>
    </div>
  )
}

function UnifiedInstructions({ mode }: { mode: 'CLIPPER' | 'DRYER' }) {
  const rows = mode === 'CLIPPER'
    ? ["• Place the phone's mic near the clipper blade.", '• Avoid loud background voices or music.', "• The signal label shows how clean the sound is, not the clipper's condition."]
    : ['• Place the mic near the REAR intake filter.', '• Select the correct blade count (usually 13).', '• Very fast dryers (about 90,000+ RPM) may read low: the sound is too high-pitched for phone mics.']
  return (
    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 16, width: '100%', padding: 16 }}>
      <div style={{ color: CYAN, fontSize: 12, fontWeight: 700 }}>{t('PRO TIPS')}</div>
      <div style={{ height: 8 }} />
      {[...rows, '• Keep the phone steady for 2–3 seconds.'].map(r => (
        <div key={r} style={{ color: '#D3D3D3', fontSize: 13, padding: '2px 0' }}>{t(r)}</div>
      ))}
    </div>
  )
}

function BladeSelector({ selected, onSelect }: { selected: number; onSelect: (n: number) => void }) {
  return (
    <div className="col" style={{ alignItems: 'center', width: '100%' }}>
      <div style={{ color: 'gray', fontSize: 11, fontWeight: 700 }}>{t('SELECT FAN BLADES')}</div>
      <div style={{ display: 'flex', justifyContent: 'space-evenly', width: '100%', paddingTop: 8 }}>
        {[7, 9, 11, 13].map(count => {
          const on = selected === count
          return (
            <button
              key={count} onClick={() => onSelect(count)}
              style={{
                width: 60, height: 60, borderRadius: 12, cursor: 'pointer', fontSize: 18, fontWeight: 700,
                background: on ? 'rgba(0,229,255,0.2)' : 'rgba(0,0,0,0.4)', border: `2px solid ${on ? CYAN : '#444'}`, color: on ? '#fff' : 'gray',
              }}
            >{count}</button>
          )
        })}
      </div>
    </div>
  )
}
