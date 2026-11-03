import { ReactNode, Suspense, lazy, useEffect, useRef, useState } from 'react'
import { NavProvider, useNav } from './nav/NavProvider'
import { Screen } from './nav/screens'
import { AppPrefs, useSignedIn } from './data/prefs'
import { useStore } from './data/store'
import { ProductRepository } from './data/repository'
import { AccessoryRepository } from './data/accessory'
import { ComboRepository } from './data/combo'
import { DocsRepository } from './data/docs'
import { TeamSync } from './data/teamsync'
import { LeadStore } from './data/leads'
import { useLang, t } from './ui/i18n'
import { ReadableWidth, useIsWide } from './ui/adaptive'
import { IntroOverlay } from './ui/Intro'
import { ToastHost } from './ui/Common'
import { LoginScreen, ChangePasswordScreen } from './screens/LoginScreen'
import { HomeScreen } from './screens/HomeScreen'
import { Category } from './data/product'

// Screens other than Home / Login load on demand, so the first download stays small.
const CatalogScreen = lazy(() => import('./screens/CatalogScreen').then(m => ({ default: m.CatalogScreen })))
const ProductDetailScreen = lazy(() => import('./screens/ProductDetailScreen').then(m => ({ default: m.ProductDetailScreen })))
const CompareScreen = lazy(() => import('./screens/CompareScreen').then(m => ({ default: m.CompareScreen })))
const ScannerScreen = lazy(() => import('./screens/ScannerScreen').then(m => ({ default: m.ScannerScreen })))
const UnifiedDashboard = lazy(() => import('./screens/UnifiedDashboard').then(m => ({ default: m.UnifiedDashboard })))
const FavoritesScreen = lazy(() => import('./screens/FavoritesScreen').then(m => ({ default: m.FavoritesScreen })))
const ShowModeScreen = lazy(() => import('./screens/FavoritesScreen').then(m => ({ default: m.ShowModeScreen })))
const SettingsScreen = lazy(() => import('./screens/SettingsScreen').then(m => ({ default: m.SettingsScreen })))
const AccessoriesScreen = lazy(() => import('./screens/AccessoriesScreen').then(m => ({ default: m.AccessoriesScreen })))
const AccessoryDetailScreen = lazy(() => import('./screens/AccessoriesScreen').then(m => ({ default: m.AccessoryDetailScreen })))
const SearchScreen = lazy(() => import('./screens/SearchScreen').then(m => ({ default: m.SearchScreen })))
const LeadsScreen = lazy(() => import('./screens/LeadsScreen').then(m => ({ default: m.LeadsScreen })))
const LeadsTwoPane = lazy(() => import('./screens/LeadsScreen').then(m => ({ default: m.LeadsTwoPane })))
const LeadFormScreen = lazy(() => import('./screens/LeadsScreen').then(m => ({ default: m.LeadFormScreen })))
const FamiliesScreen = lazy(() => import('./screens/FamiliesScreen').then(m => ({ default: m.FamiliesScreen })))
const FamilyScreen = lazy(() => import('./screens/FamiliesScreen').then(m => ({ default: m.FamilyScreen })))
const ComboDetailScreen = lazy(() => import('./screens/FamiliesScreen').then(m => ({ default: m.ComboDetailScreen })))
const BenchmarkScreen = lazy(() => import('./screens/BenchmarkScreen').then(m => ({ default: m.BenchmarkScreen })))


/** Shown (and immediately goes back) when the screen's product / accessory no longer exists. */
function Missing({ onBack }: { onBack: () => void }) {
  useEffect(() => { onBack() }, [onBack])
  return <div className="screen center" style={{ color: '#fff' }}>{t('Product not found')}</div>
}

/** Keeps the previous screen on top for the exit animation while the new one slides in. */
function ScreenHost({ screenKey, dir, children }: { screenKey: string; dir: 1 | -1; children: ReactNode }) {
  const prev = useRef<{ k: string; children: ReactNode } | null>(null)
  const [exit, setExit] = useState<{ k: string; children: ReactNode; dir: 1 | -1 } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (prev.current && prev.current.k !== screenKey) {
      setExit({ ...prev.current, dir })
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setExit(null), 300)
    }
    prev.current = { k: screenKey, children }
  })
  return (
    <div className="screen-host">
      {exit && <div key={'x' + exit.k} className={'screen-layer ' + (exit.dir === 1 ? 'exit-fwd' : 'exit-back')}>{exit.children}</div>}
      <div key={screenKey} className={'screen-layer ' + (dir === 1 ? 'enter-fwd' : 'enter-back')}>{children}</div>
    </div>
  )
}

function Screens() {
  const nav = useNav()
  const wide = useIsWide()
  const { current, push, pop, replaceTop } = nav
  const back = pop

  const render = (s: Screen): ReactNode => {
    switch (s.kind) {
      case 'Home':
        return <HomeScreen
          onOpenCategory={(c: Category) => push({ kind: 'Catalog', category: c })}
          onOpenScanner={() => push({ kind: 'Scanner' })}
          onOpenSpeedTool={() => push({ kind: 'SpeedTool' })}
          onOpenFavorites={() => push({ kind: 'Favorites' })}
          onOpenAccessories={() => push({ kind: 'Accessories' })}
          onOpenSearch={() => push({ kind: 'Search' })}
          onOpenLeads={() => push({ kind: 'Leads' })}
          onOpenFamilies={() => push({ kind: 'Families' })}
          onOpenBenchmark={() => push({ kind: 'Benchmark' })}
          onOpenSettings={() => push({ kind: 'Settings' })} />
      case 'Favorites':
        return <FavoritesScreen onBack={back} onOpen={p => push({ kind: 'Detail', productId: p.id })} onShow={() => push({ kind: 'Show' })} />
      case 'Show':
        return <ShowModeScreen onExit={back} />
      case 'Settings':
        return <ReadableWidth><SettingsScreen onBack={back} /></ReadableWidth>
      case 'Benchmark':
        return <ReadableWidth maxWidth={1000}>
          <BenchmarkScreen startCategory={s.category} startIds={s.ids ?? []} onBack={back} onOpenProduct={p => push({ kind: 'Detail', productId: p.id })} />
        </ReadableWidth>
      case 'Search':
        return <SearchScreen initial={s.initial ?? ''} onBack={back}
          onOpenProduct={p => push({ kind: 'Detail', productId: p.id })} onOpenAccessory={a => push({ kind: 'AccessoryDetail', accessoryId: a.id })} />
      case 'Leads':
        // Landscape tablet / desktop: list and lead side by side
        return wide
          ? <LeadsTwoPane onBack={back} />
          : <LeadsScreen onBack={back} onNew={() => push({ kind: 'LeadForm' })} onOpen={l => push({ kind: 'LeadForm', leadId: l.id })} />
      case 'Families':
        return <FamiliesScreen onBack={back} onOpenFamily={f => push({ kind: 'Family', key: `${f.brand}|${f.name}` })} onOpenCombo={c => push({ kind: 'ComboDetail', comboId: c.id })} />
      case 'Family':
        return <FamilyScreen familyKey={s.key} onBack={back} onOpenProduct={p => push({ kind: 'Detail', productId: p.id })} onOpenCombo={c => push({ kind: 'ComboDetail', comboId: c.id })} />
      case 'ComboDetail':
        return <ComboDetailScreen id={s.comboId} onBack={back} onOpenProduct={p => push({ kind: 'Detail', productId: p.id })} />
      case 'LeadForm':
        return <ReadableWidth><LeadFormScreen leadId={s.leadId} productId={s.productId} onDone={back} /></ReadableWidth>
      case 'Accessories':
        return <AccessoriesScreen forProduct={s.forProductId ? ProductRepository.findById(s.forProductId) : undefined}
          onBack={back} onOpen={a => push({ kind: 'AccessoryDetail', accessoryId: a.id })} />
      case 'AccessoryDetail': {
        const item = AccessoryRepository.findById(s.accessoryId)
        return item
          ? <AccessoryDetailScreen item={item} onBack={back} onOpenProduct={p => push({ kind: 'Detail', productId: p.id })} />
          : <Missing onBack={back} />
      }
      case 'Catalog': {
        const pickFor = s.pickForId ? ProductRepository.findById(s.pickForId) : undefined
        return <CatalogScreen category={s.category} pickFor={pickFor} onBack={back}
          onProductClick={p => pickFor ? replaceTop({ kind: 'Compare', firstId: pickFor.id, secondId: p.id }) : push({ kind: 'Detail', productId: p.id })} />
      }
      case 'Detail': {
        const product = ProductRepository.findById(s.productId)
        if (!product) return <Missing onBack={back} />
        return <ProductDetailScreen product={product} onBack={back}
          onCompare={() => push({ kind: 'Catalog', category: product.category, pickForId: product.id })}
          onMeasure={() => push({ kind: 'SpeedTool', mode: product.category === 'DRYER' ? 'DRYER' : 'CLIPPER', productId: product.id })}
          onOpenAccessory={a => push({ kind: 'AccessoryDetail', accessoryId: a.id })}
          onAllAccessories={() => push({ kind: 'Accessories', forProductId: product.id })}
          onAddLead={() => push({ kind: 'LeadForm', productId: product.id })}
          onOpenProduct={p => push({ kind: 'Detail', productId: p.id })}
          onOpenFamily={f => push({ kind: 'Family', key: `${f.brand}|${f.name}` })}
          onOpenCombo={c => push({ kind: 'ComboDetail', comboId: c.id })} />
      }
      case 'Compare': {
        const a = ProductRepository.findById(s.firstId)
        const b = ProductRepository.findById(s.secondId)
        if (!a || !b) return <Missing onBack={back} />
        return <ReadableWidth maxWidth={1000}>
          <CompareScreen p1={a} p2={b} onBack={back} onChangeSecond={() => replaceTop({ kind: 'Catalog', category: a.category, pickForId: a.id })} />
        </ReadableWidth>
      }
      case 'Scanner':
        return <ScannerScreen onBack={back}
          onProductFound={p => push({ kind: 'Detail', productId: p.id })}
          onAccessoryFound={a => push({ kind: 'AccessoryDetail', accessoryId: a.id })}
          onComboFound={c => push({ kind: 'ComboDetail', comboId: c.id })} />
      case 'SpeedTool':
        return <ReadableWidth maxWidth={720}>
          <UnifiedDashboard initialMode={s.mode} product={s.productId ? ProductRepository.findById(s.productId) : undefined} onBack={back} />
        </ReadableWidth>
    }
  }

  const key = nav.stack.length + ':' + JSON.stringify(current)
  return <ScreenHost screenKey={key} dir={nav.direction}><Suspense fallback={<div className="screen center"><div className="spinner" /></div>}>{render(current)}</Suspense></ScreenHost>
}

/** Everything that happens once per launch / sign-in (LaunchedEffects of MainProApp). */
function useBoot() {
  const nav = useNav()
  const signedIn = useSignedIn()
  const mustChange = useStore(AppPrefs.mustChangePassword)

  // Load the catalog, then check for an updated online catalog (silently ignored when offline / not set up).
  useEffect(() => {
    DocsRepository.init()
    void ComboRepository.init()
    void (async () => {
      await ProductRepository.init()
      await AccessoryRepository.init()
      await ProductRepository.refresh()
      await AccessoryRepository.refresh()
      // Prepare visual search in the background so the scanner is ready when opened.
      void import('./vision/VisualRecognizer').then(m => m.VisualRecognizer.prepare(ProductRepository.products.get()))
    })()
  }, [])

  // Ask the browser to keep saved leads and photos (it may otherwise clear site data when the phone is short on space).
  useEffect(() => { void navigator.storage?.persist?.().catch(() => undefined) }, [])

  // Leads captured offline are sent to the team sheet automatically once the phone is online again.
  useEffect(() => {
    if (!signedIn) return
    const sync = () => { void LeadStore.syncPending(ProductRepository.products.get(), TeamSync.sendLeads) }
    sync()
    window.addEventListener('online', sync)
    return () => window.removeEventListener('online', sync)
  }, [signedIn])

  // Online: make sure the account is still active (a disabled account is signed out). Offline: nothing changes.
  useEffect(() => {
    if (signedIn) {
      void TeamSync.checkSession()
      void DocsRepository.refresh()
    } else {
      nav.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn])

  return { signedIn, mustChange }
}

function Shell() {
  const { signedIn, mustChange } = useBoot()
  const [intro, setIntro] = useState<'show' | 'leaving' | 'gone'>('show')
  useEffect(() => {
    const a = window.setTimeout(() => setIntro('leaving'), 1700)
    const b = window.setTimeout(() => setIntro('gone'), 2200)
    return () => { window.clearTimeout(a); window.clearTimeout(b) }
  }, [])

  // Screens appear as the intro fades out, so their entrance animations are visible.
  const ready = intro !== 'show'
  return (
    <div className="app-root">
      {ready && (!signedIn ? <LoginScreen /> : mustChange ? <ChangePasswordScreen /> : <Screens />)}
      {intro !== 'gone' && <IntroOverlay leaving={intro === 'leaving'} />}
      <ToastHost />
    </div>
  )
}

export default function App() {
  useLang() // re-render everything when the language changes (t() reads the language directly)
  return <NavProvider><Shell /></NavProvider>
}
