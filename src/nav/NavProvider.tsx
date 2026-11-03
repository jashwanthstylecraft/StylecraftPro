import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { HOME, Screen, hashToScreen, screenToHash } from './screens'

/**
 * Back stack with push / pop / replaceTop (like MainProApp's `stack`), kept in sync with the browser history:
 * every push is a history entry, the browser Back / Forward buttons move through the stack, and the URL hash
 * describes the open screen so a refresh or a shared link re-opens it.
 */
interface NavState { entries: Screen[]; idx: number; dir: 1 | -1 }

export interface Nav {
  current: Screen
  /** Screens from Home up to the current one. */
  stack: Screen[]
  /** 1 when the last move was forward (open), -1 when it was backward. */
  direction: 1 | -1
  canGoBack: boolean
  push(s: Screen): void
  /** One screen back (the browser's Back button does the same). */
  pop(): void
  replaceTop(s: Screen): void
  /** Back to Home with an empty stack (used when the rep signs out). */
  reset(): void
}

const NavContext = createContext<Nav | null>(null)

export function useNav(): Nav {
  const n = useContext(NavContext)
  if (!n) throw new Error('useNav() needs <NavProvider>')
  return n
}

const hashOf = (s: Screen) => screenToHash(s)
const normalizedHash = () => (window.location.hash && window.location.hash !== '#' ? window.location.hash : '#/home')

function initialState(): NavState {
  const parsed = hashToScreen(window.location.hash)
  const entries: Screen[] = parsed && parsed.kind !== 'Home' ? [HOME, parsed] : [HOME]
  const idx = entries.length - 1
  try { window.history.replaceState({ idx }, '', hashOf(entries[idx])) } catch { /* ignore */ }
  return { entries, idx, dir: 1 }
}

/** Handlers registered with useBackHandler(); the newest enabled one gets Back before the stack pops. */
const backHandlers: { id: number; fn: () => void }[] = []
let backHandlerSeq = 0

/** Back handling for sub-states of a screen (Android BackHandler): while `enabled`, Back calls `handler` instead of leaving the screen. */
export function useBackHandler(enabled: boolean, handler: () => void) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    if (!enabled) return
    const id = ++backHandlerSeq
    backHandlers.push({ id, fn: () => ref.current() })
    return () => { const i = backHandlers.findIndex(h => h.id === id); if (i >= 0) backHandlers.splice(i, 1) }
  }, [enabled])
}

export function NavProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NavState>(initialState)
  const ref = useRef(state)
  ref.current = state
  const ignorePop = useRef(0)

  const commit = (next: NavState) => { ref.current = next; setState(next) }

  const push = useCallback((s: Screen) => {
    const cur = ref.current
    const entries = [...cur.entries.slice(0, cur.idx + 1), s]
    const idx = entries.length - 1
    try { window.history.pushState({ idx }, '', hashOf(s)) } catch { /* ignore */ }
    commit({ entries, idx, dir: 1 })
  }, [])

  const replaceTop = useCallback((s: Screen) => {
    const cur = ref.current
    const entries = [...cur.entries]
    entries[cur.idx] = s
    try { window.history.replaceState({ idx: cur.idx }, '', hashOf(s)) } catch { /* ignore */ }
    commit({ entries, idx: cur.idx, dir: cur.dir })
  }, [])

  const pop = useCallback(() => {
    const top = backHandlers[backHandlers.length - 1]
    if (top) { top.fn(); return }
    if (ref.current.idx > 0) window.history.back()
  }, [])

  const reset = useCallback(() => {
    try { window.history.replaceState({ idx: 0 }, '', hashOf(HOME)) } catch { /* ignore */ }
    commit({ entries: [HOME], idx: 0, dir: -1 })
  }, [])

  useEffect(() => {
    const onPop = (ev: PopStateEvent) => {
      if (ignorePop.current > 0) { ignorePop.current--; return }
      const cur = ref.current
      const st = (ev.state as { idx?: number } | null)?.idx
      // A sub-state of the open screen wants the Back press (e.g. a lead pane): undo the history step and hand it over.
      if (typeof st === 'number' && st < cur.idx && backHandlers.length > 0) {
        ignorePop.current++
        window.history.go(cur.idx - st)
        backHandlers[backHandlers.length - 1].fn()
        return
      }
      if (typeof st === 'number' && st >= 0 && st < cur.entries.length && hashOf(cur.entries[st]) === normalizedHash()) {
        commit({ entries: cur.entries, idx: st, dir: st >= cur.idx ? 1 : -1 })
        return
      }
      // Unknown entry (e.g. history from before a refresh): rebuild the stack from the URL.
      const parsed = hashToScreen(window.location.hash)
      const entries: Screen[] = parsed && parsed.kind !== 'Home' ? [HOME, parsed] : [HOME]
      const idx = entries.length - 1
      try { window.history.replaceState({ idx }, '', hashOf(entries[idx])) } catch { /* ignore */ }
      commit({ entries, idx, dir: -1 })
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const nav = useMemo<Nav>(() => ({
    current: state.entries[state.idx],
    stack: state.entries.slice(0, state.idx + 1),
    direction: state.dir,
    canGoBack: state.idx > 0,
    push, pop, replaceTop, reset,
  }), [state, push, pop, replaceTop, reset])

  return <NavContext.Provider value={nav}>{children}</NavContext.Provider>
}
