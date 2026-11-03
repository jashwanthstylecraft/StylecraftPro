// Port of vision/VisualRecognizer.kt
//
// Recognizes products by how they LOOK (shape, color, finish), like a visual search.
//
//  1. A small image-understanding model (MobileNet V3 small, ~4 MB, the same one the Android app uses) is
//     downloaded once on first use and kept in IndexedDB.
//  2. Every catalog photo is turned into a "visual fingerprint" (1024 numbers) and saved in IndexedDB.
//  3. Each camera frame gets a fingerprint too; the closest catalog fingerprints are the best guesses.
//  4. When the user confirms a guess (or picks the right product), the camera fingerprint is saved as an
//     extra reference for that product, so the scanner gets better with real-world use.
//
// Everything runs in the browser (MediaPipe Tasks Vision, WASM). Without internet on first use it simply
// stays off and the scanner keeps working with label + barcode reading only.
import { Store, useStore, idb } from '../data/store'
import type { Category, Product } from '../data/product'
import { localImageUrls } from '../ui/Common'
// The WASM runtime ships inside the app (no CDN needed); Vite turns these imports into hashed asset URLs.
import wasmLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_internal.js?url'
import wasmBinaryUrl from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'
import type { ImageEmbedder } from '@mediapipe/tasks-vision'

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_small/float32/1/mobilenet_v3_small.tflite'
const MODEL_KEY = 'visual_model_mobilenet_v3_small'
const INDEX_KEY = 'visual_index_v1'
const LEARNED_KEY = 'visual_learned_v1'
const MAX_LEARNED_PER_PRODUCT = 8 // keep the newest 8 views per product

export type VisualStatus = 'OFF' | 'DOWNLOADING_MODEL' | 'INDEXING' | 'READY' | 'UNAVAILABLE'
export interface VisualProgress { status: VisualStatus; done: number; total: number }
export interface VisualMatch { product: Product; similarity: number }

const progress = new Store<VisualProgress>({ status: 'OFF', done: 0, total: 0 })
const setProgress = (status: VisualStatus, done = 0, total = 0) => progress.set({ status, done, total })

let embedder: ImageEmbedder | null = null
let prepareJob: Promise<void> | null = null
let pendingProducts: Product[] | null = null
let storageLoaded = false

/** key "productId|imageKey" -> fingerprint, from catalog photos */
const catalogIndex = new Map<string, Float32Array>()
/** productId -> fingerprints learned from the camera */
const learned = new Map<string, Float32Array[]>()

const sleep0 = () => new Promise<void>(r => setTimeout(r, 0))

// ---------------------------------------------------------------- preparing

/** Starts (or continues) preparing in the background. Safe to call many times. */
function prepare(products: Product[]): void {
  if (prepareJob) { pendingProducts = products; return } // run once more with the newest list when this pass ends
  prepareJob = (async () => {
    try { await prepareInternal(products) } finally {
      prepareJob = null
      const next = pendingProducts
      pendingProducts = null
      if (next && next.length !== products.length) prepare(next)
    }
  })()
}

async function prepareInternal(products: Product[]): Promise<void> {
  try {
    if (!embedder) {
      let model = await idb.get<Uint8Array>(MODEL_KEY)
      if (!model || model.length < 500_000) {
        setProgress('DOWNLOADING_MODEL')
        model = await downloadModel(MODEL_URL)
        await idb.set(MODEL_KEY, model)
      }
      embedder = await createEmbedder(model)
    }
    if (!storageLoaded) { await loadStorage(); storageLoaded = true }

    const todo = products.filter(p => {
      const k = imageKey(p)
      return k != null && !catalogIndex.has(`${p.id}|${k}`)
    })
    setProgress('INDEXING', 0, todo.length)
    let done = 0
    const BATCH = 4 // load photos in parallel, fingerprint one by one
    for (let i = 0; i < todo.length; i += BATCH) {
      const batch = todo.slice(i, i + BATCH)
      const bitmaps = await Promise.all(batch.map(p => loadReferenceImage(p)))
      for (let j = 0; j < batch.length; j++) {
        const p = batch[j]
        const key = imageKey(p)
        const bmp = bitmaps[j]
        if (bmp && key) {
          const v = embed(bmp)
          if (v) catalogIndex.set(`${p.id}|${key}`, v)
        }
        done++
      }
      setProgress('INDEXING', done, todo.length)
      if ((i / BATCH) % 3 === 2) await saveIndex()
      await sleep0() // keep the UI responsive
    }
    await saveIndex()
    setProgress('READY', catalogIndex.size, catalogIndex.size)
  } catch {
    setProgress(embedder ? 'READY' : 'UNAVAILABLE')
  }
}

async function createEmbedder(model: Uint8Array): Promise<ImageEmbedder> {
  const { ImageEmbedder } = await import('@mediapipe/tasks-vision')
  const fileset = { wasmLoaderPath: wasmLoaderUrl, wasmBinaryPath: wasmBinaryUrl }
  return ImageEmbedder.createFromOptions(fileset, {
    baseOptions: { modelAssetBuffer: model },
    l2Normalize: true,
    quantize: false,
    runningMode: 'IMAGE',
  })
}

async function downloadModel(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

// ---------------------------------------------------------------- matching

/** Fingerprint for a camera frame / photo (canvas, image, video or ImageBitmap). */
function embed(source: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement | ImageBitmap): Float32Array | null {
  const e = embedder
  if (!e) return null
  try {
    const r = e.embed(source)
    const v = r.embeddings[0]?.floatEmbedding
    return v && v.length > 0 ? normalize(Float32Array.from(v)) : null
  } catch { return null }
}

/** True once the model is loaded and there is at least one fingerprint to compare with. */
const isReady = () => embedder != null && (catalogIndex.size > 0 || learned.size > 0)

/** Best products for this fingerprint, best first. */
function topMatches(frame: Float32Array, products: Product[], category: Category | null, count = 3): VisualMatch[] {
  const byId = new Map(products.map(p => [p.id, p]))
  const best = new Map<string, number>()
  const consider = (id: string, ref: Float32Array) => {
    const p = byId.get(id)
    if (!p) return
    if (category != null && p.category !== category) return
    const sim = dot(frame, ref)
    if (sim > (best.get(id) ?? -1)) best.set(id, sim)
  }
  for (const [key, ref] of catalogIndex) consider(key.slice(0, key.indexOf('|')), ref)
  for (const [id, refs] of learned) refs.forEach(r => consider(id, r))
  return [...best.entries()].sort((a, b) => b[1] - a[1]).slice(0, count)
    .flatMap(([id, sim]) => { const p = byId.get(id); return p ? [{ product: p, similarity: sim }] : [] })
}

let saveLearnedTimer: number | undefined
/** Remember what this product looks like through the camera (makes future scans better). */
function learn(productId: string, frame: Float32Array): void {
  const list = learned.get(productId) ?? []
  list.push(frame)
  while (list.length > MAX_LEARNED_PER_PRODUCT) list.shift()
  learned.set(productId, list)
  window.clearTimeout(saveLearnedTimer)
  saveLearnedTimer = window.setTimeout(() => { void saveLearned() }, 300)
}

const learnedCount = (productId: string) => learned.get(productId)?.length ?? 0

// ---------------------------------------------------------------- helpers

/** Identifies which photo was fingerprinted, so a new photo gets re-fingerprinted. */
function imageKey(p: Product): string | null {
  const local = localImageUrls(p)[0]
  if (local) return 'res:' + (local.split('/').pop() ?? local)
  return p.imageUrl && p.imageUrl.trim() ? p.imageUrl : null
}

/** Loads the reference photo (bundled one first, else the online one) scaled to at most 448 px. */
async function loadReferenceImage(p: Product): Promise<HTMLCanvasElement | null> {
  const local = localImageUrls(p)[0]
  const url = local ?? p.imageUrl
  if (!url) return null
  try {
    const img = new Image()
    // Online photos need CORS to be readable; photos from servers without it are skipped (like a failed download).
    if (!local) img.crossOrigin = 'anonymous'
    img.referrerPolicy = 'no-referrer'
    img.src = url
    await Promise.race([img.decode(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000))])
    const scale = Math.min(1, 448 / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(img.naturalWidth * scale))
    c.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = c.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#fff' // transparent PNGs become white, like the photo boxes
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0, c.width, c.height)
    return c
  } catch { return null }
}

function normalize(v: Float32Array): Float32Array {
  let n = 0
  for (let i = 0; i < v.length; i++) n += v[i] * v[i]
  n = Math.sqrt(n)
  if (n > 0) for (let i = 0; i < v.length; i++) v[i] /= n
  return v
}

function dot(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return -1
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

async function loadStorage(): Promise<void> {
  const idx = await idb.get<Record<string, Float32Array>>(INDEX_KEY)
  if (idx) for (const k of Object.keys(idx)) catalogIndex.set(k, idx[k])
  const lr = await idb.get<Record<string, Float32Array[]>>(LEARNED_KEY)
  if (lr) for (const id of Object.keys(lr)) learned.set(id, lr[id])
}

async function saveIndex(): Promise<void> {
  await idb.set(INDEX_KEY, Object.fromEntries(catalogIndex))
}

async function saveLearned(): Promise<void> {
  await idb.set(LEARNED_KEY, Object.fromEntries(learned))
}

export const VisualRecognizer = { progress, prepare, embed, isReady, topMatches, learn, learnedCount }
export const useVisualProgress = () => useStore(progress)
