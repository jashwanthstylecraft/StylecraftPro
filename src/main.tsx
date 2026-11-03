import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { t } from './ui/i18n'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// Offline support: the service worker caches the app after the first visit (production builds only).
// When a newer version has been downloaded, a small bar offers to switch to it.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const showUpdateBar = (worker: ServiceWorker) => {
    const bar = document.createElement('div')
    bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;background:#1A1A1A;color:#fff;border:1px solid #00E5FF;border-radius:14px;padding:12px 16px;display:flex;align-items:center;gap:12px;font:600 14px system-ui,sans-serif'
    const msg = document.createElement('span'); msg.style.flex = '1'; msg.textContent = t('A new version is ready.')
    const btn = document.createElement('button'); btn.textContent = t('UPDATE')
    btn.style.cssText = 'background:#00E5FF;color:#000;border:0;border-radius:10px;padding:8px 16px;font-weight:900;letter-spacing:1px;cursor:pointer'
    btn.onclick = () => worker.postMessage('SKIP_WAITING')
    bar.append(msg, btn); document.body.appendChild(bar)
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then(reg => {
      const watch = (w: ServiceWorker | null) => w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdateBar(w)   // an older version is running: offer the update
      })
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBar(reg.waiting)
      reg.addEventListener('updatefound', () => watch(reg.installing))
    }).catch(() => { /* not available (e.g. private mode): the app still works online */ })
    let reloading = false
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; window.location.reload() } })
  })
}
