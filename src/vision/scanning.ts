// Browser replacements for what the Android scanner got from CameraX + ML Kit:
//  - barcode reading (UPC-A / UPC-E / EAN-13 / EAN-8): native BarcodeDetector, else ZXing (lazy loaded)
//  - label text reading (OCR): tesseract.js (lazy loaded, runs in a web worker)
//  - frame helpers (downscaled frame for reading, centered square for the visual search)

export interface BarcodeReader { detect(frame: HTMLCanvasElement): Promise<string[]>; close(): void }

interface NativeBarcodeDetector { detect(source: CanvasImageSource): Promise<Array<{ rawValue?: string }>> }
interface NativeBarcodeDetectorCtor {
  new (opts: { formats: string[] }): NativeBarcodeDetector
  getSupportedFormats(): Promise<string[]>
}

const noBarcodes: BarcodeReader = { detect: async () => [], close() { /* nothing */ } }

export async function createBarcodeReader(): Promise<BarcodeReader> {
  const BD = (window as unknown as { BarcodeDetector?: NativeBarcodeDetectorCtor }).BarcodeDetector
  if (BD) {
    try {
      const wanted = ['upc_a', 'upc_e', 'ean_13', 'ean_8']
      const supported = await BD.getSupportedFormats()
      const formats = wanted.filter(f => supported.includes(f))
      if (formats.length > 0) {
        const detector = new BD({ formats })
        return {
          async detect(frame) {
            try { return (await detector.detect(frame)).map(b => b.rawValue ?? '').filter(Boolean) } catch { return [] }
          },
          close() { /* nothing */ },
        }
      }
    } catch { /* fall through to ZXing */ }
  }
  try {
    const z = await import('@zxing/library')
    const hints = new Map<unknown, unknown>()
    hints.set(z.DecodeHintType.POSSIBLE_FORMATS, [z.BarcodeFormat.UPC_A, z.BarcodeFormat.UPC_E, z.BarcodeFormat.EAN_13, z.BarcodeFormat.EAN_8])
    hints.set(z.DecodeHintType.TRY_HARDER, true)
    const reader = new z.MultiFormatReader()
    reader.setHints(hints as Map<import('@zxing/library').DecodeHintType, unknown>)
    return {
      async detect(frame) {
        try {
          const bitmap = new z.BinaryBitmap(new z.HybridBinarizer(new z.HTMLCanvasElementLuminanceSource(frame)))
          return [reader.decode(bitmap).getText()]
        } catch { return [] } // NotFoundException = no barcode in this frame
      },
      close() { /* nothing */ },
    }
  } catch { return noBarcodes }
}

export interface TextReader {
  /** Resolves true when the OCR engine is loaded (false: it could not be loaded, e.g. offline the first time). */
  ready: Promise<boolean>
  recognize(frame: HTMLCanvasElement): Promise<string>
  close(): void
}

export function createTextReader(): TextReader {
  type Worker = { recognize(img: HTMLCanvasElement): Promise<{ data: { text: string } }>; terminate(): Promise<unknown> }
  let worker: Worker | null = null
  let closed = false
  const ready = (async () => {
    try {
      const T = await import('tesseract.js')
      const w = await T.createWorker('eng') as unknown as Worker & { setParameters(p: Record<string, unknown>): Promise<unknown> }
      if (closed) { void w.terminate(); return false }
      await w.setParameters({ tessedit_pageseg_mode: T.PSM.SPARSE_TEXT }) // labels are scattered words, not paragraphs
      worker = w
      return true
    } catch { return false }
  })()
  return {
    ready,
    async recognize(frame) {
      if (!worker) return ''
      return (await worker.recognize(frame)).data.text ?? ''
    },
    close() { closed = true; const w = worker; worker = null; if (w) void w.terminate() },
  }
}

// ---------------------------------------------------------------- frames

type FrameSource = HTMLVideoElement | HTMLImageElement | ImageBitmap | HTMLCanvasElement

const sizeOf = (s: FrameSource): [number, number] =>
  s instanceof HTMLVideoElement ? [s.videoWidth, s.videoHeight]
    : s instanceof HTMLImageElement ? [s.naturalWidth, s.naturalHeight]
      : [s.width, s.height]

/** Draws the source scaled so its width is at most [maxWidth]. Returns the same canvas. */
export function drawFrame(src: FrameSource, canvas: HTMLCanvasElement, maxWidth: number): HTMLCanvasElement {
  const [w, h] = sizeOf(src)
  const scale = Math.min(1, maxWidth / Math.max(1, w))
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  canvas.getContext('2d')?.drawImage(src, 0, 0, canvas.width, canvas.height)
  return canvas
}

/** Centered square (80% of the short side) = roughly what is inside the on-screen frame, drawn at [size] px. */
export function drawCenterCrop(src: FrameSource, canvas: HTMLCanvasElement, size = 224): HTMLCanvasElement {
  const [w, h] = sizeOf(src)
  const side = Math.min(w, h) * 0.8
  canvas.width = size
  canvas.height = size
  canvas.getContext('2d')?.drawImage(src, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size)
  return canvas
}
