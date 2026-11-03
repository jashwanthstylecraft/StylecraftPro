import { Component, ReactNode } from 'react'
import { t } from './i18n'

/** Last-resort screen: a crash in any screen shows this instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  componentDidCatch(error: unknown) {
    // Kept on this device so it can be sent to support (a remote error service can be plugged in here later).
    try { localStorage.setItem('last_crash', JSON.stringify({ at: new Date().toISOString(), message: String((error as Error)?.message ?? error), stack: String((error as Error)?.stack ?? '').slice(0, 2000) })) } catch { /* storage unavailable */ }
    console.error(error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#000', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 2 }}>{t('Something went wrong')}</div>
        <div style={{ color: '#9E9E9E', fontSize: 14, maxWidth: 360 }}>{t('Your saved leads and settings are safe. Reload to continue.')}</div>
        <button onClick={() => window.location.reload()}
          style={{ background: '#00E5FF', color: '#000', border: 0, borderRadius: 12, padding: '12px 28px', fontWeight: 900, letterSpacing: 1, fontSize: 14, cursor: 'pointer' }}>
          {t('RELOAD')}
        </button>
      </div>
    )
  }
}
