// Port of ScannerScreen.kt
//
// Three ways to recognize a product from the camera, all on the same live frames:
//   1. box barcodes (UPC / EAN)   -> exact match, opens the product right away
//   2. label text (OCR)           -> model code / name, needs the same product in 3 of the last 5 reads
//   3. how it looks (visual)      -> suggestions; opens by itself only when very sure
// Android used CameraX + ML Kit + MediaPipe; the web uses getUserMedia + BarcodeDetector/ZXing + tesseract.js + MediaPipe (WASM).
import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Product, Category, CATEGORIES, categoryLabel, displayName } from '../data/product'
import { Accessory, AccessoryRepository } from '../data/accessory'
import { Combo, ComboRepository } from '../data/combo'
import { ProductMatcher } from '../data/matcher'
import { useProducts } from '../data/repository'
import { CategoryIcon,ProductImage, ScreenHeader, BottomSheet, vibrateShort } from '../ui/Common'
import { Icon } from '../ui/icons'
import { ProductPickerList } from '../ui/Pickers'
import { t, tr, useLang, isSpanish } from '../ui/i18n'
import { VisualRecognizer, VisualMatch, useVisualProgress } from '../vision/VisualRecognizer'
import { BarcodeReader, TextReader, createBarcodeReader, createTextReader, drawCenterCrop, drawFrame } from '../vision/scanning'
import './ScannerScreen.css'

// Label reading: same product in this many of the last WINDOW frames.
const VOTES_NEEDED = 3
const WINDOW = 5

// Visual search tuning (similarity is 0..1). Suggestions appear above SHOW, auto-open needs AUTO + a clear lead.
const VISUAL_SHOW = 0.45
const VISUAL_AUTO = 0.82
const VISUAL_LEAD = 0.04
const VISUAL_AGREE = 0.60 // label + look agree -> accept at once
const VISUAL_EVERY_MS = 600

export interface ScannerScreenProps {
  onBack: () => void
  onProductFound: (p: Product) => void
  onAccessoryFound: (a: Accessory) => void
  onComboFound: (c: Combo) => void
}

type CamState = 'starting' | 'live' | 'denied' | 'unavailable' | 'insecure'

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
const normCode = (c: string) => c.replace(/\D/g, '').replace(/^0+/, '')

const FLASH_ON = 'M7 2v11h3v9l7-12h-4l4-8z'
const FLASH_OFF = 'M3.27 3 2 4.27l5 5V13h3v9l3.58-6.14L17.73 20 19 18.73 3.27 3zM17 10h-4l4-8H7v2.18l8.46 8.46L17 10z'
const SCHOOL = 'M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3 1 9l11 6 9-4.91V17h2V9L12 3z'
const PHOTO = 'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z'

function SvgIcon({ d, size = 24, color = '#fff' }: { d: string; size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden><path d={d} /></svg>
}

export function ScannerScreen({ onBack, onProductFound, onAccessoryFound, onComboFound }: ScannerScreenProps) {
  useLang()
  const products = useProducts()
  const visual = useVisualProgress()

  const [category, setCategory] = useState<Category | null>(null)
  const [hint, setHint] = useState(() => tr('Point the camera at the product or its label'))
  const [suggestions, setSuggestions] = useState<VisualMatch[]>([])
  const [showTeach, setShowTeach] = useState(false)
  const [cam, setCam] = useState<CamState>('starting')
  const [askedOnce, setAskedOnce] = useState(false)
  const [retry, setRetry] = useState(0)
  const [torchOn, setTorchOn] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const [ocrOk, setOcrOk] = useState<boolean | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)

  // Latest values for the frame loop (Kotlin: rememberUpdatedState)
  const categoryRef = useRef(category)
  const productsRef = useRef(products)
  const onFoundRef = useRef(onProductFound)
  const onAccessoryRef = useRef(onAccessoryFound)
  const onComboRef = useRef(onComboFound)
  const suggestionsRef = useRef<VisualMatch[]>([])
  categoryRef.current = category
  productsRef.current = products
  onFoundRef.current = onProductFound
  onAccessoryRef.current = onAccessoryFound
  onComboRef.current = onComboFound

  const doneRef = useRef(false)
  const photoRef = useRef<string | null>(null)
  const votes = useRef<string[]>([])
  const visualVotes = useRef<string[]>([])
  const lastFrame = useRef<Float32Array | null>(null) // latest camera fingerprint
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const readers = useRef<{ barcode?: Promise<BarcodeReader>; ocr?: TextReader }>({})
  const cropCanvas = useRef<HTMLCanvasElement | null>(null)
  const ocrReady = useRef(false)

  photoRef.current = photoUrl

  const getBarcode = useCallback(() => (readers.current.barcode ??= createBarcodeReader()), [])
  const getOcr = useCallback(() => {
    if (!readers.current.ocr) {
      const r = createTextReader()
      readers.current.ocr = r
      void r.ready.then(setOcrOk)
    }
    return readers.current.ocr
  }, [])

  const setSuggestionList = (list: VisualMatch[]) => { suggestionsRef.current = list; setSuggestions(list) }

  // Prepare visual search in the background (Kotlin: LaunchedEffect(products))
  useEffect(() => { VisualRecognizer.prepare(products) }, [products])

  // ---------------------------------------------------------------- camera
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(tr => tr.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    let cancelled = false
    setCam('starting')
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCam(window.isSecureContext ? 'unavailable' : 'insecure')
      return
    }
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
    }).then(stream => {
      if (cancelled || doneRef.current) { stream.getTracks().forEach(x => x.stop()); return }
      streamRef.current = stream
      const track = stream.getVideoTracks()[0]
      const caps = (track?.getCapabilities?.() ?? {}) as { torch?: boolean }
      setTorchSupported(!!caps.torch)
      setCam('live')
    }).catch((e: unknown) => {
      if (cancelled) return
      const name = e instanceof DOMException ? e.name : ''
      setAskedOnce(true)
      setCam(name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError' ? 'unavailable' : 'denied')
    })
    return () => { cancelled = true; stopCamera() }
  }, [retry, stopCamera])

  // Attach the stream to the <video> once it is rendered
  useEffect(() => {
    const v = videoRef.current
    if (cam === 'live' && v && streamRef.current) {
      v.srcObject = streamRef.current
      void v.play().catch(() => { /* autoplay blocked: user can tap */ })
    }
  }, [cam])

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track || !torchSupported) { setHint(tr('The flashlight is not available on this camera')); return }
    const next = !torchOn
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      setTorchOn(next)
    } catch { setHint(tr('The flashlight is not available on this camera')) }
  }

  // ---------------------------------------------------------------- accepting a result

  /** Opens the product and, when we have a camera fingerprint, teaches it to the visual search. */
  const accept = useCallback((product: Product, teach = true) => {
    if (doneRef.current) return
    doneRef.current = true
    vibrateShort()
    if (teach) {
      let frame = lastFrame.current
      // No fingerprint yet (e.g. visual search still starting): take one from the picture on screen right now.
      if (!frame) {
        const src = videoRef.current && streamRef.current ? videoRef.current : null
        if (src && src.videoWidth) { const c = (cropCanvas.current ??= document.createElement('canvas')); frame = VisualRecognizer.embed(drawCenterCrop(src, c)) }
      }
      if (frame) VisualRecognizer.learn(product.id, frame)
    }
    stopCamera()
    onFoundRef.current(product)
  }, [stopCamera])

  const onText = useCallback((text: string) => {
    if (doneRef.current) return
    const match = ProductMatcher.bestMatch(text, productsRef.current, categoryRef.current)
    votes.current.push(match?.product.id ?? '')
    while (votes.current.length > WINDOW) votes.current.shift()
    if (!match) {
      const codes = ProductMatcher.codeHints(text)
      if (codes.length > 0) setHint(isSpanish() ? `Leyendo ${codes.join(', ')}… mantén firme` : `Reading ${codes.join(', ')}… hold steady`)
      else if (suggestionsRef.current.length === 0)
        setHint(text.trim() === '' ? tr('Fill the frame with the product, or move closer to the label') : tr('Looking…'))
      return
    }
    // Label and look agree -> confident right away
    const top = suggestionsRef.current[0]
    if (top && top.product.id === match.product.id && top.similarity >= VISUAL_AGREE) { accept(match.product); return }
    const count = votes.current.filter(v => v === match.product.id).length
    setHint(`${isSpanish() ? 'Etiqueta' : 'Label'}: ${displayName(match.product)} (${count}/${VOTES_NEEDED})`)
    if (count >= VOTES_NEEDED) accept(match.product)
  }, [accept])

  /** Box barcodes (UPC / EAN) are an exact match, so they open the product right away. Returns true when something opened. */
  const onCodes = useCallback((codes: string[]): boolean => {
    if (doneRef.current) return true
    const wanted = new Set(codes.map(normCode).filter(c => c.length >= 6))
    if (wanted.size === 0) return false
    const hit = productsRef.current.find(p => p.upc.some(u => wanted.has(normCode(u))))
    if (hit) { accept(hit); return true }
    // Boxed combos, then blades, guards and capes have barcodes too
    const combo = ComboRepository.byUpc(wanted)
    if (combo) { doneRef.current = true; vibrateShort(); stopCamera(); onComboRef.current(combo); return true }
    const acc = AccessoryRepository.byUpc(wanted)
    if (acc) { doneRef.current = true; vibrateShort(); stopCamera(); onAccessoryRef.current(acc); return true }
    setHint(tr('Barcode') + ` ${codes[0]} ` + tr("isn't in the catalog yet"))
    return false
  }, [accept, stopCamera])

  const onVisual = useCallback((frame: Float32Array, matches: VisualMatch[]) => {
    if (doneRef.current) return
    lastFrame.current = frame
    setSuggestionList(matches.filter(m => m.similarity >= VISUAL_SHOW))
    const top = matches[0]
    const second = matches[1]
    const strong = !!top && top.similarity >= VISUAL_AUTO && (!second || top.similarity - second.similarity >= VISUAL_LEAD)
    visualVotes.current.push(strong ? top.product.id : '')
    while (visualVotes.current.length > 4) visualVotes.current.shift()
    if (strong && visualVotes.current.filter(v => v === top.product.id).length >= 3) accept(top.product)
  }, [accept])

  // ---------------------------------------------------------------- live frame loop
  useEffect(() => {
    if (cam !== 'live') return
    let stopped = false
    const frameC = document.createElement('canvas')
    const ocrC = document.createElement('canvas')
    const cropC = (cropCanvas.current ??= document.createElement('canvas'))
    const ocr = getOcr()
    let lastCode = 0
    let lastVisual = 0
    let ocrBusy = false

    void (async () => {
      const barcode = await getBarcode()
      while (!stopped) {
        await sleep(120)
        const video = videoRef.current
        if (stopped || doneRef.current || photoRef.current || !video || video.readyState < 2 || !video.videoWidth) continue
        const now = Date.now()
        try {
          // 1) barcode on the same frame (a few times per second)
          if (now - lastCode >= 250) {
            lastCode = now
            const codes = await barcode.detect(drawFrame(video, frameC, 960))
            if (codes.length > 0) onCodes(codes)
            if (doneRef.current || stopped) continue
          }
          // 2) visual search a few times per second
          if (VisualRecognizer.isReady() && now - lastVisual >= VISUAL_EVERY_MS) {
            lastVisual = now
            const frame = VisualRecognizer.embed(drawCenterCrop(video, cropC))
            if (frame) onVisual(frame, VisualRecognizer.topMatches(frame, productsRef.current, categoryRef.current))
            if (doneRef.current || stopped) continue
          }
          // 3) label reading (slow, runs in a worker: one frame at a time)
          if (!ocrBusy && ocrReady.current) {
            ocrBusy = true
            void ocr.recognize(drawFrame(video, ocrC, 1280))
              .then(text => { if (!stopped) onText(text) })
              .catch(() => { /* skip this frame */ })
              .finally(() => { ocrBusy = false })
          }
        } catch { /* skip this frame */ }
      }
    })()
    return () => { stopped = true }
  }, [cam, getBarcode, getOcr, onCodes, onText, onVisual])

  useEffect(() => { ocrReady.current = ocrOk === true }, [ocrOk])

  // Release the readers when leaving the screen (Kotlin: onDispose)
  useEffect(() => () => {
    readers.current.ocr?.close()
    void readers.current.barcode?.then(b => b.close())
    readers.current = {}
  }, [])

  // ---------------------------------------------------------------- still photo (no camera / camera blocked / user choice)
  const onPickPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (photoUrl) URL.revokeObjectURL(photoUrl)
    const url = URL.createObjectURL(file)
    setPhotoUrl(url)
    photoRef.current = url
    setSuggestionList([])
    votes.current = []
    visualVotes.current = []
    setHint(tr('Looking…'))
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
      const canvas = drawFrame(bmp, document.createElement('canvas'), 1280)
      // 1) barcode
      const barcode = await getBarcode()
      const codes = await barcode.detect(canvas)
      if (codes.length > 0 && onCodes(codes)) return
      // 2) visual search first (fast), shown as suggestions
      let topVisual: VisualMatch | undefined
      if (VisualRecognizer.isReady()) {
        const frame = VisualRecognizer.embed(drawCenterCrop(bmp, document.createElement('canvas')))
        if (frame) {
          lastFrame.current = frame
          const matches = VisualRecognizer.topMatches(frame, productsRef.current, categoryRef.current)
          setSuggestionList(matches.filter(m => m.similarity >= VISUAL_SHOW))
          topVisual = matches[0]
          const second = matches[1]
          if (topVisual && topVisual.similarity >= VISUAL_AUTO && (!second || topVisual.similarity - second.similarity >= VISUAL_LEAD)) {
            accept(topVisual.product); return
          }
        }
      }
      // 3) label text: a single photo is enough, no voting
      const ocr = getOcr()
      if (await ocr.ready) {
        const text = await ocr.recognize(canvas)
        const match = ProductMatcher.bestMatch(text, productsRef.current, categoryRef.current)
        if (match) { accept(match.product); return }
        const hints = ProductMatcher.codeHints(text)
        if (hints.length > 0) { setHint(isSpanish() ? `Leí ${hints.join(', ')} pero no está en el catálogo. Elige el producto abajo.` : `Read ${hints.join(', ')} but it is not in the catalog. Pick the product below.`); return }
      }
      setHint(suggestionsRef.current.length > 0 ? tr('Not sure. Tap a suggestion, or choose the product below.') : tr("Couldn't recognize this photo. Try another one, or choose the product below."))
    } catch {
      setHint("Couldn't read that photo. Try another one.")
    }
  }

  const backToCamera = () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl)
    setPhotoUrl(null)
    photoRef.current = null
    setSuggestionList([])
    votes.current = []
    visualVotes.current = []
    setHint(tr('Point the camera at the product or its label'))
  }

  const pickCategory = (cat: Category) => {
    setCategory(c => (c === cat ? null : cat))
    votes.current = []
    visualVotes.current = []
  }

  // ---------------------------------------------------------------- render
  const live = cam === 'live'
  const visualText = {
    OFF: t('Visual search starting…'),
    DOWNLOADING_MODEL: t('Visual search: downloading (first time only)…'),
    INDEXING: t('Visual search: learning catalog photos') + ` ${visual.done}/${visual.total}`,
    READY: t('Visual search ON · label + barcode reading ON'),
    UNAVAILABLE: t('Visual search needs internet once to set up. Label + barcode reading ON'),
  }[visual.status]

  const teachList = category ? products.filter(p => p.category === category) : products

  return (
    <div className="screen">
      <ScreenHeader title={t('PRODUCT SCANNER')} subtitle={t('BARCODE · LABEL · LOOK')} onBack={onBack} actions={
        <div className="scan-actions">
          <button className="icon-btn" onClick={() => fileRef.current?.click()} aria-label="Choose a photo" title="Choose a photo">
            <SvgIcon d={PHOTO} />
          </button>
          {live && (
            <button className="icon-btn" onClick={() => void toggleTorch()} aria-label="Flashlight" style={{ opacity: torchSupported ? 1 : 0.4 }}>
              <SvgIcon d={torchOn ? FLASH_ON : FLASH_OFF} />
            </button>
          )}
        </div>
      } />
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => void onPickPhoto(e)} />

      <div className="scan-chips">
        {CATEGORIES.map(cat => (
          <button key={cat} className={'scan-chip' + (category === cat ? ' selected' : '')} onClick={() => pickCategory(cat)}>
            <CategoryIcon category={cat} size={16} color={category === cat ? '#fff' : '#ddd'} />
            {categoryLabel(cat)}
          </button>
        ))}
      </div>

      <div className={'scan-status' + (visual.status === 'READY' ? ' ready' : '')}>
        {visualText}{ocrOk === false ? ' · Label reading unavailable (needs internet once)' : ''}
      </div>

      <div className="scan-stage">
        {live && <video ref={videoRef} className="scan-video" playsInline muted autoPlay />}
        {photoUrl && <img className="scan-photo" src={photoUrl} alt="" />}
        {(live || photoUrl) && !photoUrl && (
          <div className="scan-frame"><div className="scan-frame-box" /><div className="scan-frame-line" /></div>
        )}

        {(live || photoUrl) ? (
          <div className="scan-bottom">
            {suggestions.length > 0 && (
              <>
                <div className="scan-suggest-title">{t('LOOKS LIKE · tap to open')}</div>
                <div className="scan-suggest-row">
                  {suggestions.map(m => (
                    <button key={m.product.id} className="scan-suggest" onClick={() => accept(m.product)}>
                      <div className="photo-box"><ProductImage product={m.product} /></div>
                      <div className="scan-suggest-name ellipsis">{m.product.name}</div>
                      <div className="scan-suggest-sim">{Math.round(m.similarity * 100)}% match</div>
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="scan-hint">{hint}</div>
            {photoUrl && live && (
              <button className="btn btn-outline" style={{ marginTop: 8 }} onClick={backToCamera}>{tr('BACK TO CAMERA')}</button>
            )}
          </div>
        ) : cam === 'starting' ? (
          <div className="scan-nocam"><div className="spinner" /><div className="scan-note">{tr('Starting the camera…')}</div></div>
        ) : (
          <div className="scan-nocam">
            <div className="scan-nocam-icon"><Icon name="camera" size={56} color="gray" /></div>
            <div style={{ color: '#fff' }}>
              {cam === 'insecure' ? tr('The camera only works on a secure (https) page.')
                : cam === 'unavailable' ? tr('No camera was found on this device.')
                  : t('Camera access is needed to scan products.')}
            </div>
            {(cam === 'denied' || cam === 'unavailable') && (
              <button className="btn btn-cyan" onClick={() => setRetry(n => n + 1)}>{askedOnce ? tr('TRY AGAIN') : tr('ALLOW CAMERA')}</button>
            )}
            {cam === 'denied' && (
              <div className="scan-note">{tr('If nothing happens, allow the camera for this site in your browser settings (the lock icon next to the address), then try again.')}</div>
            )}
            <button className="btn btn-outline" onClick={() => fileRef.current?.click()}>{tr('TAKE / CHOOSE A PHOTO INSTEAD')}</button>
          </div>
        )}
      </div>

      <button className="scan-teach" onClick={() => setShowTeach(true)}>
        <SvgIcon d={SCHOOL} />
        {t('NOT FOUND? CHOOSE IT & TEACH THE SCANNER')}
      </button>

      {showTeach && (
        <BottomSheet onClose={() => setShowTeach(false)}>
          <ProductPickerList
            title={t('What is this product?')}
            subtitle={t('Keep the product in front of the camera. The scanner saves how it looks, so next time it recognizes it.')}
            products={teachList}
            onPick={p => { setShowTeach(false); accept(p, true) }}
          />
        </BottomSheet>
      )}
    </div>
  )
}
