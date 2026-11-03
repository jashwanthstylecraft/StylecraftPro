import { AppPrefs, CatalogConfig } from './prefs'
import { Product, displayName } from './product'
import { Lead, LeadStore } from './leads'
import { fmtDate, fmtDateTime } from './format'

/**
 * Sends measurements and leads to the team Google Sheet through a small Google Apps Script
 * (see sheets/TEAM_SHEET_SCRIPT.gs). The script link and team key are set in Settings.
 *
 * Browser notes (see PORTING_NOTES.md): requests are POSTs with Content-Type text/plain so the browser sends
 * them as "simple" requests (no CORS preflight, which Apps Script cannot answer). The Apps Script answer is a
 * redirect to script.googleusercontent.com, which the browser follows and which allows cross-origin reads.
 */
export type TeamResult =
  | { kind: 'ok'; message: string }
  | { kind: 'notConfigured' }
  | { kind: 'failed'; reason: string }

export type TeamJson = Record<string, unknown>
interface Reply { result: TeamResult; json: TeamJson | null }

/** The link typed in Settings wins; otherwise the team link built into the app. */
const scriptUrl = () => AppPrefs.teamScriptUrl.get().trim() || CatalogConfig.TEAM_SCRIPT_URL

/** Requests whose answer we don't need to read: when the browser blocks the reply (CORS) we still deliver them. */
const FIRE_AND_FORGET = new Set(['measurement', 'leads'])

async function request(body: TeamJson, readTimeoutMs = 20000): Promise<Reply> {
  const url = scriptUrl()
  if (!url) return { result: { kind: 'notConfigured' }, json: null }
  const payload: TeamJson = { ...body, key: AppPrefs.teamKey.get() }
  // every request carries the signed-in rep, so the script can check the account is still active
  if (!('user' in payload)) payload.user = AppPrefs.sessionUser.get()
  if (!('token' in payload)) payload.token = AppPrefs.sessionToken.get()
  const text = JSON.stringify(payload)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), readTimeoutMs)
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: text, redirect: 'follow', signal: ctrl.signal })
    if (!res.ok) return { result: { kind: 'failed', reason: `Server returned ${res.status}` }, json: null }
    const raw = await res.text()
    let json: TeamJson | null = null
    try { json = JSON.parse(raw) as TeamJson } catch { json = null }
    let result: TeamResult
    if (!json) result = { kind: 'failed', reason: 'Unexpected answer. Check the script link (it must end in /exec).' }
    else if (json.ok === true) result = { kind: 'ok', message: String(json.message ?? 'Saved') }
    else result = { kind: 'failed', reason: String(json.error ?? 'Rejected') }
    // The script says the account was disabled or the session was replaced: sign out on this device.
    if (json?.signedOut === true) AppPrefs.clearSession()
    return { result, json }
  } catch (e) {
    if (e instanceof TypeError && FIRE_AND_FORGET.has(String(body.type))) {
      // Probably CORS blocking the reply. The write itself is a simple request, so deliver it blind (offline throws again).
      try {
        await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: text })
        return { result: { kind: 'ok', message: 'Sent (the browser did not allow reading the confirmation)' }, json: null }
      } catch { /* fall through */ }
    }
    const reason = e instanceof DOMException && e.name === 'AbortError' ? 'timeout' : e instanceof Error ? e.message : 'No connection'
    return { result: { kind: 'failed', reason: e instanceof TypeError ? 'No connection' : reason }, json: null }
  } finally {
    clearTimeout(timer)
  }
}

const post = async (body: TeamJson) => (await request(body)).result

export type LoginResult = { kind: 'ok'; mustChangePassword: boolean } | { kind: 'failed'; reason: string }

export const TeamSync = {
  get isConfigured() { return scriptUrl() !== '' },

  /** Signs a rep in with the user name and password from the "Users" tab. Needs internet the first time. */
  async login(user: string, password: string): Promise<LoginResult> {
    const r = await request({ type: 'login', user: user.trim(), token: '', password })
    const j = r.json
    if (r.result.kind === 'ok' && j && String(j.token ?? '') !== '') {
      const mustChange = j.mustChange === true
      AppPrefs.setSession(String(j.user ?? user.trim()), String(j.token), mustChange, String(j.name ?? ''), String(j.email ?? ''), String(j.phone ?? ''))
      AppPrefs.setRegion(String(j.region ?? ''))
      return { kind: 'ok', mustChangePassword: mustChange }
    }
    if (r.result.kind === 'failed') return { kind: 'failed', reason: r.result.reason }
    if (r.result.kind === 'notConfigured') return { kind: 'failed', reason: 'No team sheet link' }
    return { kind: 'failed', reason: 'Unexpected answer from the team sheet' }
  },

  /** Replaces the temporary password with the rep's own one. */
  async changePassword(current: string, newPassword: string): Promise<TeamResult> {
    const r = await post({ type: 'changePassword', password: current, newPassword })
    if (r.kind === 'ok') AppPrefs.setPasswordChanged()
    return r
  },

  /** Asks the script whether this session is still valid (it signs the device out if not). Offline = no change. */
  async checkSession(): Promise<TeamResult> {
    const r = await request({ type: 'session' })
    if (r.result.kind === 'ok' && r.json && 'region' in r.json) AppPrefs.setRegion(String(r.json.region ?? ''))
    return r.result
  },

  /** List of documents the rep may see (Access = Share / View only) and certification marks per product. */
  async listDocs(): Promise<[TeamResult, TeamJson | null]> { const r = await request({ type: 'docs' }, 45000); return [r.result, r.json] },

  /** One document as base64 (the script checks the Access column again). */
  async docFile(id: string): Promise<[TeamResult, TeamJson | null]> { const r = await request({ type: 'docFile', id }, 120000); return [r.result, r.json] },

  /** Checks the link and the team key. */
  ping(): Promise<TeamResult> { return post({ type: 'ping' }) },

  /** Writes a Stylecraft test result into the product's row of the Catalog tab. */
  sendMeasurement(product: Product, rpm: number | null, noiseDb: number | null = null, watts: number | null = null): Promise<TeamResult> {
    const body: TeamJson = { type: 'measurement', id: product.id, date: fmtDate(Date.now()) }
    if (rpm != null) body.measuredRpm = rpm
    if (noiseDb != null) body.measuredNoiseDb = noiseDb
    if (watts != null) body.measuredWatts = watts
    return post(body)
  },

  /** Sends a crash report saved on this device (see ErrorBoundary) to the "Crashes" tab. Silent; returns true when delivered. */
  async sendCrash(report: Record<string, unknown>): Promise<boolean> {
    return (await post({ type: 'crash', ...report, ua: navigator.userAgent })).kind === 'ok'
  },

  /** Adds leads to the "Leads" tab (created automatically). Leads already sent are skipped by the script. */
  async sendLeads(leads: Lead[], products: Product[]): Promise<TeamResult> {
    const byId = new Map(products.map(p => [p.id, p]))
    const arr: TeamJson[] = []
    for (const l of leads) {
      const o: TeamJson = {
        id: l.id, date: fmtDateTime(l.timestamp), name: l.name, shop: l.shop ?? '', phone: l.phone ?? '', email: l.email ?? '', city: l.city ?? '',
        event: l.event ?? '', products: l.productIds.map(id => byId.get(id)).filter((p): p is Product => !!p).map(displayName).join('; '),
        wantsVisit: l.wantsVisit ? 'Yes' : 'No', notes: l.notes ?? '', rep: AppPrefs.repName.get(),
        title: l.title ?? '', website: l.website ?? '', badgeId: l.badgeId ?? '', source: l.source ?? '',
        status: l.status, followUp: l.followUpAt ? fmtDateTime(l.followUpAt) : '', lastContact: l.lastContactAt ? fmtDateTime(l.lastContactAt) : '',
        region: AppPrefs.region.get(),
      }
      const photo = await LeadStore.photoForUpload(l)
      if (photo) o.photo = photo
      arr.push(o)
    }
    return post({ type: 'leads', leads: arr })
  },
}
