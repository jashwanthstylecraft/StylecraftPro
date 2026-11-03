import { ReactNode, useState } from 'react'
import { AppPrefs } from '../data/prefs'
import { TeamSync } from '../data/teamsync'
import { useStore } from '../data/store'
import { assetUrl } from '../data/repository'
import { Field, Spinner } from '../ui/Common'
import { Icon } from '../ui/icons'
import { t, tr } from '../ui/i18n'

/** Short, rep-friendly versions of connection errors. */
function friendly(reason: string): string {
  const r = reason.toLowerCase()
  if (r.includes('unable to resolve host') || r.includes('failed to connect') || r.includes('timeout') || r.includes('no connection') || r.includes('failed to fetch') || r.includes('networkerror'))
    return tr('No internet. Connect to Wi-Fi or mobile data and try again.')
  return tr(reason)
}

function AuthFrame({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
      <img className="auth-bg" src={assetUrl('img/bgapp.webp')} alt="" />
      <div className="auth-scroll">
        <div style={{ height: 36 }} />
        <div style={{ color: '#fff', fontSize: 28, fontWeight: 900, letterSpacing: 4, textAlign: 'center' }}>STYLECRAFT PRO</div>
        <div style={{ color: 'var(--red)', fontSize: 12, fontWeight: 700, letterSpacing: 2 }}>{t('FIELD SALES SUITE')}</div>
        <div style={{ height: 36 }} />
        <div className="auth-card">
          <div style={{ color: 'var(--cyan)', fontSize: 13, fontWeight: 900, letterSpacing: 2 }}>{title}</div>
          <div style={{ color: 'gray', fontSize: 13, margin: '4px 0 16px' }}>{subtitle}</div>
          {children}
        </div>
      </div>
    </div>
  )
}

function EyeButton({ show, onToggle, label }: { show: boolean; onToggle: () => void; label?: string }) {
  return (
    <button type="button" className="icon-btn" onClick={onToggle} aria-label={label ?? 'Show password'} style={{ color: 'var(--muted)' }}>
      <Icon name={show ? 'visibilityOff' : 'visibility'} />
    </button>
  )
}

/**
 * Sign-in for sales reps. Accounts are rows in the "Users" tab of the private leads sheet;
 * a manager adds a user name and a temporary password, and the rep picks their own password at the first sign-in.
 * After that the browser stays signed in, also offline at shows.
 */
export function LoginScreen() {
  const [user, setUser] = useState(AppPrefs.sessionUser.get())
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = !busy && user.trim() !== '' && password !== ''
  const signIn = async () => {
    if (user.trim() === '' || password === '' || busy) return
    setBusy(true); setError(null)
    const r = await TeamSync.login(user, password)
    if (r.kind === 'ok') setPassword('') // the app switches screens by itself
    else setError(friendly(r.reason))
    setBusy(false)
  }

  return (
    <AuthFrame title={t('SIGN IN')} subtitle={t('Use the user name and password from your manager.')}>
      <form onSubmit={e => { e.preventDefault(); void signIn() }}>
        <Field label={t('User name')} value={user} onChange={v => { setUser(v); setError(null) }} autoComplete="username"
          icon={<Icon name="person" color="var(--muted)" />} />
        <div style={{ height: 10 }} />
        <Field label={t('Password')} value={password} onChange={v => { setPassword(v); setError(null) }} type={show ? 'text' : 'password'} autoComplete="current-password"
          icon={<Icon name="lock" color="var(--muted)" />}
          trailing={<EyeButton show={show} onToggle={() => setShow(!show)} label={t('Show password')} />} />
        {error && <div className="error-text" style={{ marginTop: 10 }}>{error}</div>}
        <div style={{ height: 18 }} />
        <button type="submit" className="btn btn-red btn-block btn-lg" disabled={!canSubmit}>
          {busy ? <Spinner color="#fff" /> : t('SIGN IN')}
        </button>
      </form>
      <div style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', paddingTop: 14 }}>
        {t('The first sign-in needs internet. After that the app works offline too.')}
      </div>
    </AuthFrame>
  )
}

function PasswordField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [show, setShow] = useState(false)
  return <Field label={label} value={value} onChange={onChange} type={show ? 'text' : 'password'} autoComplete="new-password"
    trailing={<EyeButton show={show} onToggle={() => setShow(!show)} />} />
}

/** Shown right after signing in with a temporary password: the rep must choose their own before using the app. */
export function ChangePasswordScreen({ onCancel }: { onCancel?: (() => void) | null }) {
  const mustChange = useStore(AppPrefs.mustChangePassword)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const problem =
    next !== '' && next.length < 6 ? t('Use at least 6 characters')
      : again !== '' && again !== next ? t("The two passwords don't match")
        : next !== '' && next === current ? t('Choose a password different from the temporary one')
          : null

  const save = async () => {
    setBusy(true); setError(null)
    const r = await TeamSync.changePassword(current, next)
    if (r.kind === 'ok') { setCurrent(''); setNext(''); setAgain(''); onCancel?.() }
    else if (r.kind === 'failed') setError(friendly(r.reason))
    else setError(tr('No team sheet link'))
    setBusy(false)
  }

  return (
    <AuthFrame title={t('CHOOSE YOUR PASSWORD')}
      subtitle={mustChange ? t('You signed in with a temporary password. Pick your own to continue.') : t('Change your password.')}>
      <PasswordField value={current} onChange={v => { setCurrent(v); setError(null) }} label={mustChange ? t('Temporary password') : t('Current password')} />
      <div style={{ height: 10 }} />
      <PasswordField value={next} onChange={v => { setNext(v); setError(null) }} label={t('New password (6+ characters)')} />
      <div style={{ height: 10 }} />
      <PasswordField value={again} onChange={v => { setAgain(v); setError(null) }} label={t('Repeat new password')} />
      {(error ?? problem) && <div className="error-text" style={{ marginTop: 10 }}>{error ?? problem}</div>}
      <div style={{ height: 18 }} />
      <button className="btn btn-lime btn-block btn-lg" onClick={() => void save()}
        disabled={busy || current === '' || next.length < 6 || next !== again || next === current}>
        {busy ? <Spinner color="#000" /> : t('SAVE PASSWORD')}
      </button>
      <button className="btn btn-text btn-block" style={{ marginTop: 6 }} onClick={() => onCancel ? onCancel() : AppPrefs.clearSession()}>
        {onCancel ? t('Cancel') : t('Sign out')}
      </button>
    </AuthFrame>
  )
}
