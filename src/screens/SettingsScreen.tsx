import { ReactNode, useEffect, useState } from 'react'
import './settings.css'
import { AppPrefs } from '../data/prefs'
import { ProductRepository, useProducts } from '../data/repository'
import { AccessoryRepository, useAccessories } from '../data/accessory'
import { MeasurementStore, useMeasurements } from '../data/measurements'
import { TeamSync } from '../data/teamsync'
import { useStore } from '../data/store'
import { Field, ScreenHeader, showToast } from '../ui/Common'
import { staggerStyle } from '../ui/Motion'
import { shareText } from '../ui/share'
import { t, tr, useLang } from '../ui/i18n'
import { useBackHandler } from '../nav/NavProvider'
import { ChangePasswordScreen } from './LoginScreen'

/** Same number the Android build showed ("Stylecraft Pro 3.2"). */
const APP_VERSION = '3.2'

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const lang = useLang()
  const [changingPassword, setChangingPassword] = useState(false)
  useBackHandler(changingPassword, () => setChangingPassword(false))

  const savedUrl = useStore(AppPrefs.catalogUrl)
  const savedAccUrl = useStore(AppPrefs.accessoriesUrl)
  const products = useProducts()
  const accessories = useAccessories()
  const measurements = useMeasurements()
  const user = useStore(AppPrefs.sessionUser)
  const region = useStore(AppPrefs.region)

  const [url, setUrl] = useState(savedUrl)
  useEffect(() => setUrl(savedUrl), [savedUrl])
  const [accUrl, setAccUrl] = useState(savedAccUrl)
  useEffect(() => setAccUrl(savedAccUrl), [savedAccUrl])
  const [scriptUrl, setScriptUrl] = useState(AppPrefs.teamScriptUrl.get())
  const [teamKey, setTeamKey] = useState(AppPrefs.teamKey.get())
  const [repName, setRepName] = useState(AppPrefs.repName.get())
  const [repEmail, setRepEmail] = useState(AppPrefs.repEmail.get())
  const [repPhone, setRepPhone] = useState(AppPrefs.repPhone.get())
  const [teamStatus, setTeamStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  if (changingPassword) return <ChangePasswordScreen onCancel={() => setChangingPassword(false)} />

  const saveCatalog = async () => {
    AppPrefs.setCatalogUrl(url)
    setBusy(true)
    const r = await ProductRepository.refresh()
    setStatus(r.kind === 'updated' ? tr('Catalog updated') + `: ${r.count} ` + tr('products')
      : r.kind === 'notConfigured' ? tr('No link saved - using the catalog built into the app')
        : tr("Couldn't update") + `: ${r.reason}. ` + tr("If it's a Google Sheet, check Share → General access → Anyone with the link."))
    setBusy(false)
  }

  const saveAccessories = async () => {
    AppPrefs.setAccessoriesUrl(accUrl)
    setBusy(true)
    const r = await AccessoryRepository.refresh()
    setStatus(r == null ? tr('No link saved - using the accessories built into the app')
      : r.ok ? tr('Accessories updated') + `: ${r.count} ` + tr('items')
        : tr("Couldn't update") + `: ${r.reason}`)
    setBusy(false)
  }

  const saveTeam = async () => {
    AppPrefs.setTeamSync(scriptUrl, teamKey, repName)
    AppPrefs.setRepContact(repEmail, repPhone)
    setBusy(true)
    const r = await TeamSync.ping()
    setTeamStatus(r.kind === 'ok' ? '✓ ' + r.message
      : r.kind === 'notConfigured' ? tr('Saved. No link yet - leads stay on this phone.')
        : tr("Couldn't connect") + ': ' + r.reason)
    setBusy(false)
  }

  const exportCsv = async () => {
    try {
      await shareText('stylecraft_measurements.csv', MeasurementStore.toCsv(products), 'text/csv', tr('Measurements'))
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error')
    }
  }

  return (
    <div className="screen">
      <ScreenHeader title={t('SETTINGS')} subtitle={null} onBack={onBack} />

      <div className="scroll">
        <Section title={t('LANGUAGE')} index={0}>
          <div className="set-row">
            <button className={'set-chip' + (lang === 'en' ? ' on' : '')} onClick={() => AppPrefs.setLanguage('en')}>English</button>
            <button className={'set-chip' + (lang === 'es' ? ' on' : '')} onClick={() => AppPrefs.setLanguage('es')}>Español</button>
          </div>
        </Section>

        <Section title={t('ONLINE CATALOG')} index={1}>
          <div className="set-note">
            {t('Paste the link of your Google Sheet (or a products.json file). The app downloads it when it starts, so spec changes reach every phone without reinstalling.')}
          </div>
          <div className="set-gap" />
          <Field value={url} onChange={setUrl} placeholder="https://docs.google.com/spreadsheets/d/…" inputMode="url" />
          <div className="set-gap" />
          <div className="set-row">
            <button className="btn btn-cyan set-btn" disabled={busy} onClick={() => void saveCatalog()}>
              {busy ? t('Updating…') : t('SAVE & UPDATE NOW')}
            </button>
            {savedUrl !== '' && (
              <button className="btn btn-outline set-btn" onClick={() => { setUrl(''); AppPrefs.setCatalogUrl(''); setStatus(tr('Link removed')) }}>
                {t('REMOVE')}
              </button>
            )}
          </div>
          {status != null && <div className="set-status">{status}</div>}
          <div className="set-count">{t('Products in the app') + `: ${products.length}`}</div>

          {/* Accessories: the "Accessories" tab of the same Google Sheet (open that tab, copy the link - it ends in #gid=...) */}
          <div style={{ height: 16 }} />
          <div className="set-white" style={{ fontSize: 14 }}>{t('Accessories tab link (optional)')}</div>
          <div className="set-note sm">{t('Open the Accessories tab in your Google Sheet and copy the link from the address bar (it ends in #gid=…).')}</div>
          <div className="set-gap6" />
          <Field value={accUrl} onChange={setAccUrl} placeholder="https://docs.google.com/spreadsheets/d/…#gid=…" inputMode="url" />
          <div style={{ height: 8 }} />
          <button className="btn btn-cyan set-btn" disabled={busy} onClick={() => void saveAccessories()}>{t('SAVE & UPDATE ACCESSORIES')}</button>
          <div className="set-count">{t('Accessories in the app') + `: ${accessories.length}`}</div>
        </Section>

        <Section title={t('ACCOUNT')} index={2}>
          <div className="set-white">{t('Signed in as') + ' ' + user}</div>
          <div className="muted" style={{ fontSize: 13 }}>{t('Region') + ': ' + (region.trim() === '' ? t('not set (ask your manager)') : region)}</div>
          <div className="set-gap" />
          <div className="set-row">
            <button className="btn btn-outline set-btn" onClick={() => setChangingPassword(true)}>{t('CHANGE PASSWORD')}</button>
            <button className="btn btn-outline set-btn set-signout" onClick={() => AppPrefs.clearSession()}>{t('SIGN OUT')}</button>
          </div>
        </Section>

        <Section title={t('YOU & TEAM GOOGLE SHEET')} index={2}>
          <div className="set-note">
            {t("Lets this phone send leads and measured speeds to your Google Sheet. Set up once with TEAM_SHEET_SCRIPT.gs (in the project's sheets folder).")}
          </div>
          <div className="set-gap" />
          <Field label={t('Script link (ends in /exec)')} value={scriptUrl} onChange={setScriptUrl} placeholder={t('Using the Stylecraft team sheet')} inputMode="url" />
          <div className="set-gap6" />
          <Field label={t('Team key')} value={teamKey} onChange={setTeamKey} />
          <div className="set-gap6" />
          <Field label={t('Your name (added to your leads)')} value={repName} onChange={setRepName} />
          <div className="set-gap6" />
          <Field label={t('Your email (signs follow-up emails)')} value={repEmail} onChange={setRepEmail} type="email" inputMode="email" />
          <div className="set-gap6" />
          <Field label={t('Your phone (signs follow-up emails)')} value={repPhone} onChange={setRepPhone} type="tel" inputMode="tel" />
          <div className="set-gap" />
          <button className="btn btn-cyan set-btn" disabled={busy} onClick={() => void saveTeam()}>{t('SAVE & TEST')}</button>
          {teamStatus != null && <div className="set-status">{teamStatus}</div>}
        </Section>

        <Section title={t('SAVED MEASUREMENTS')} index={3}>
          <div style={{ color: '#fff' }}>{`${measurements.length} ` + t('readings saved')}</div>
          <div style={{ height: 8 }} />
          <button className="btn btn-lime set-btn" disabled={measurements.length === 0} onClick={() => void exportCsv()}>{t('EXPORT TO EXCEL (CSV)')}</button>
        </Section>

        <Section title={t('ABOUT')} index={4}>
          <div className="set-white">{`Stylecraft Pro ${APP_VERSION}`}</div>
          <div className="set-note sm">{t('Competitor specs come from brand websites and retailers. Stylecraft specs come from the 2026 catalog.')}</div>
        </Section>
        <div style={{ height: 40 }} />
      </div>
    </div>
  )
}

function Section({ title, index, children }: { title: string; index: number; children: ReactNode }) {
  return (
    <div className="stagger" style={staggerStyle(index)}>
      <div className="set-section">
        <div className="set-title">{title}</div>
        {children}
      </div>
    </div>
  )
}
