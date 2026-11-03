import { Store, ls, useStore } from './store'

/** Where the online catalog lives (see CatalogConfig in ProductRepository.kt). */
export const CatalogConfig = {
  /** Stylecraft team Google Sheet "StyleCraft_Vision_Catalog_v7" - Catalog tab (shared: anyone with the link can view). */
  REMOTE_CATALOG_URL: 'https://docs.google.com/spreadsheets/d/1Fhw-bPaZbUuzcvBjFQmmM7G-d6sq5Z3Q1V8cU_8fEJI/edit#gid=1717137365',
  /** Same sheet - Accessories tab. */
  REMOTE_ACCESSORIES_URL: 'https://docs.google.com/spreadsheets/d/1Fhw-bPaZbUuzcvBjFQmmM7G-d6sq5Z3Q1V8cU_8fEJI/edit#gid=1506679807',
  /** Apps Script web app of that sheet (link ending in /exec) for leads and "Send to catalog". */
  TEAM_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxIfkvTibrreG3HWbzquVEWuXtuHtvM0bmZ_iLIIjJqGT26hiNGjh091LEhuKkGPyEY/exec',
}

const P = 'vision_prefs:'
const str = (k: string, def = '') => ls.get(P + k) ?? def
const bool = (k: string) => ls.get(P + k) === 'true'
function save(k: string, v: string) { ls.set(P + k, v) }

export const DEFAULT_TEAM_KEY = '2c5eb66ed3b66ae8'

function loadFavorites(): string[] {
  try { const a = JSON.parse(ls.get(P + 'favorites') ?? '[]'); return Array.isArray(a) ? a.map(String) : [] } catch { return [] }
}

/** Small settings saved in the browser: language, online catalog link, favorites, rep sign-in (localStorage). */
export const AppPrefs = {
  /** "en" or "es" */
  language: new Store<string>(str('language', 'en')),
  catalogUrl: new Store<string>(str('catalog_url')),
  /** Link to the "Accessories" tab of the Google Sheet (optional). */
  accessoriesUrl: new Store<string>(str('accessories_url')),
  teamScriptUrl: new Store<string>(str('team_script_url')),
  teamKey: new Store<string>(str('team_key', DEFAULT_TEAM_KEY)),
  /** Name of the sales rep using this device (added to leads). */
  repName: new Store<string>(str('rep_name')),
  /** Rep's email and phone, used to sign follow-up emails. */
  repEmail: new Store<string>(str('rep_email')),
  repPhone: new Store<string>(str('rep_phone')),
  /** Last show / event typed in a lead, offered again for the next one. */
  lastEvent: new Store<string>(str('last_event')),
  /** User name the rep signed in with; empty = signed out. */
  sessionUser: new Store<string>(str('session_user')),
  sessionToken: new Store<string>(str('session_token')),
  /** True after signing in with a temporary password, until the rep picks their own. */
  mustChangePassword: new Store<boolean>(bool('session_must_change')),
  /** Sales region of the signed-in rep (from the Users tab), e.g. "USA - Southeast" or "South America". */
  region: new Store<string>(str('region')),
  favorites: new Store<string[]>(loadFavorites()),

  setRegion(value: string | null | undefined) {
    const v = value?.trim() ?? ''
    AppPrefs.region.set(v); save('region', v)
  },
  get isSignedIn() { return AppPrefs.sessionUser.get() !== '' && AppPrefs.sessionToken.get() !== '' },

  /** Saves the session; the rep's name, email and phone from the Users tab fill in the follow-up signature. */
  setSession(user: string, token: string, mustChange: boolean, name?: string | null, email?: string | null, phone?: string | null) {
    AppPrefs.sessionUser.set(user); AppPrefs.sessionToken.set(token); AppPrefs.mustChangePassword.set(mustChange)
    save('session_user', user); save('session_token', token); save('session_must_change', String(mustChange))
    const n = name?.trim(); if (n) { AppPrefs.repName.set(n); save('rep_name', n) }
    const e = email?.trim(); if (e) { AppPrefs.repEmail.set(e); save('rep_email', e) }
    const p = phone?.trim(); if (p) { AppPrefs.repPhone.set(p); save('rep_phone', p) }
  },
  setPasswordChanged() { AppPrefs.mustChangePassword.set(false); save('session_must_change', 'false') },
  clearSession() {
    AppPrefs.sessionUser.set(''); AppPrefs.sessionToken.set(''); AppPrefs.mustChangePassword.set(false)
    ls.remove(P + 'session_user'); ls.remove(P + 'session_token'); ls.remove(P + 'session_must_change')
  },
  setLanguage(code: string) { AppPrefs.language.set(code); save('language', code) },
  setCatalogUrl(url: string) { AppPrefs.catalogUrl.set(url.trim()); save('catalog_url', url.trim()) },
  setAccessoriesUrl(url: string) { AppPrefs.accessoriesUrl.set(url.trim()); save('accessories_url', url.trim()) },
  setTeamSync(url: string, key: string, rep: string) {
    const k = key.trim() || DEFAULT_TEAM_KEY
    AppPrefs.teamScriptUrl.set(url.trim()); AppPrefs.teamKey.set(k); AppPrefs.repName.set(rep.trim())
    save('team_script_url', url.trim()); save('team_key', k); save('rep_name', rep.trim())
  },
  setRepContact(email: string, phone: string) {
    AppPrefs.repEmail.set(email.trim()); AppPrefs.repPhone.set(phone.trim())
    save('rep_email', email.trim()); save('rep_phone', phone.trim())
  },
  setLastEvent(event: string) { AppPrefs.lastEvent.set(event.trim()); save('last_event', event.trim()) },
  toggleFavorite(id: string) {
    const cur = AppPrefs.favorites.get()
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]
    AppPrefs.favorites.set(next); save('favorites', JSON.stringify(next))
  },
  isFavorite(id: string) { return AppPrefs.favorites.get().includes(id) },

  /**
   * Turns a normal Google Sheets link into its CSV download link, so people can paste the
   * link straight from the browser. Other links are used as they are.
   */
  downloadUrl(raw: string): string {
    const url = raw.trim()
    if (!url.includes('docs.google.com/spreadsheets')) return url
    if (url.includes('output=csv') || url.includes('format=csv')) return url
    if (url.includes('/pubhtml')) {
      const u = url.replace('/pubhtml', '/pub')
      return u.includes('?') ? `${u}&output=csv` : `${u}?output=csv`
    }
    const id = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(url)?.[1]
    if (!id) return url
    const gid = /[#&?]gid=(\d+)/.exec(url)?.[1] ?? '0'
    return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`
  },
  /** CORS-friendly alternative (gviz) of a Google Sheets link, used when the export link is blocked by the browser. */
  gvizUrl(raw: string): string | null {
    const id = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(raw)?.[1]
    if (!id) return null
    const gid = /[#&?]gid=(\d+)/.exec(raw)?.[1] ?? '0'
    return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}`
  },
}

/** Hook for any pref store: `const lang = usePref('language')`. */
type PrefKey = 'language' | 'catalogUrl' | 'accessoriesUrl' | 'teamScriptUrl' | 'teamKey' | 'repName' | 'repEmail' | 'repPhone' |
  'lastEvent' | 'sessionUser' | 'sessionToken' | 'mustChangePassword' | 'region' | 'favorites'
type PrefValue<K extends PrefKey> = typeof AppPrefs[K] extends Store<infer T> ? T : never
export function usePref<K extends PrefKey>(key: K): PrefValue<K> {
  return useStore(AppPrefs[key] as unknown as Store<PrefValue<K>>)
}
/** True while a rep is signed in. */
export function useSignedIn(): boolean {
  const u = useStore(AppPrefs.sessionUser), t = useStore(AppPrefs.sessionToken)
  return u !== '' && t !== ''
}
