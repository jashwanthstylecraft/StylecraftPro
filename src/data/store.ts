import { useSyncExternalStore } from 'react'

/** Tiny observable value (the web version of Kotlin's MutableStateFlow / StateFlow). */
export class Store<T> {
  private value: T
  private listeners = new Set<() => void>()
  constructor(initial: T) { this.value = initial }
  get(): T { return this.value }
  set(next: T) {
    if (Object.is(next, this.value)) return
    this.value = next
    this.listeners.forEach(l => l())
  }
  update(fn: (v: T) => T) { this.set(fn(this.value)) }
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
}

/** Re-renders the component whenever the store changes. */
export function useStore<T>(s: Store<T>): T {
  return useSyncExternalStore(s.subscribe, () => s.get(), () => s.get())
}

/** localStorage helpers that never throw (private mode, quota...). */
export const ls = {
  get(key: string): string | null { try { return localStorage.getItem(key) } catch { return null } },
  set(key: string, value: string): boolean { try { localStorage.setItem(key, value); return true } catch { return false } },
  remove(key: string) { try { localStorage.removeItem(key) } catch { /* ignore */ } },
}

/** Minimal IndexedDB key/value store for bigger blobs (documents, lead photos). */
const DB_NAME = 'stylecraft_pro'
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => { req.result.createObjectStore('kv') }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
export const idb = {
  async get<T>(key: string): Promise<T | undefined> {
    try {
      const db = await openDb()
      return await new Promise<T | undefined>((resolve, reject) => {
        const r = db.transaction('kv').objectStore('kv').get(key)
        r.onsuccess = () => resolve(r.result as T | undefined)
        r.onerror = () => reject(r.error)
      })
    } catch { return undefined }
  },
  async set(key: string, value: unknown): Promise<boolean> {
    try {
      const db = await openDb()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('kv', 'readwrite')
        tx.objectStore('kv').put(value, key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
      return true
    } catch { return false }
  },
  async remove(key: string): Promise<void> {
    try {
      const db = await openDb()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('kv', 'readwrite')
        tx.objectStore('kv').delete(key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    } catch { /* ignore */ }
  },
}
