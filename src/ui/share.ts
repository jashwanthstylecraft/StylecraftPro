import { Product } from '../data/product'
import { compareRows, winnerOf } from '../data/specs'
import { localImageUrls } from './Common'

/**
 * Sharing comparison images and spreadsheets with other apps (ui/ShareTools.kt).
 * Android used FileProvider + the share sheet; the web uses the Web Share API (files) when the browser supports
 * it (mobile Chrome / Safari) and otherwise downloads the file.
 */
export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled'

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = fileName
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export async function shareFile(file: File, title: string, text?: string): Promise<ShareOutcome> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title, text }); return 'shared' } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
    }
  }
  downloadBlob(file, file.name)
  return 'downloaded'
}

export function shareText(fileName: string, text: string, mime: string, title: string): Promise<ShareOutcome> {
  return shareFile(new File([text], fileName, { type: mime }), title)
}

/** Shares a link / message with the system share sheet, falling back to copying it. */
export async function shareLink(title: string, text: string, url?: string): Promise<ShareOutcome> {
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); return 'shared' } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
    }
  }
  await copyText([text, url].filter(Boolean).join('\n'))
  return 'downloaded'
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch {
    const ta = document.createElement('textarea')
    ta.value = text; document.body.appendChild(ta); ta.select()
    let ok = false
    try { ok = document.execCommand('copy') } catch { ok = false }
    ta.remove()
    return ok
  }
}

/** Opens the browser print dialog with an HTML snippet (e.g. a spec sheet). */
export function printHtml(html: string, title = 'Stylecraft Pro') {
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.write(`<!doctype html><title>${title}</title><body style="font-family:sans-serif">${html}</body>`)
  w.document.close(); w.focus(); setTimeout(() => w.print(), 300)
  return true
}

export function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/** Product photo as an image element (bundled photo first, then the online one); null when unavailable / blocked by CORS. */
export async function productBitmap(p: Product): Promise<HTMLImageElement | null> {
  const local = localImageUrls(p)[0]
  if (local) return loadImage(local)
  return p.imageUrl ? loadImage(p.imageUrl) : null
}

const CYAN = '#00E5FF', RED = '#FF1744', WHITE = '#FFFFFF', GREY = '#9E9E9E', DARK = '#0B0B0B', CARD = '#161616'

function newCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const c = canvas.getContext('2d')!
  c.fillStyle = DARK; c.fillRect(0, 0, w, h)
  const g = c.createLinearGradient(0, 0, w, 0)
  g.addColorStop(0, RED); g.addColorStop(1, CYAN)
  c.fillStyle = g; c.fillRect(0, 0, w, 10)
  return { canvas, c }
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath()
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r)
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r)
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y)
  c.closePath()
}

function drawText(c: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, bold = false, align: CanvasTextAlign = 'left', maxW = 1000) {
  c.font = `${bold ? '700 ' : ''}${size}px sans-serif`
  c.fillStyle = color; c.textAlign = align
  let t = s
  while (c.measureText(t).width > maxW && t.length > 4) t = t.slice(0, -2)
  if (t !== s) t = t.slice(0, -1) + '…'
  c.fillText(t, x, y)
}

const toPng = (canvas: HTMLCanvasElement, name: string) => new Promise<File>((resolve, reject) =>
  canvas.toBlob(b => b ? resolve(new File([b], name, { type: 'image/png' })) : reject(new Error('Could not create the image')), 'image/png'))

function drawFit(c: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, cy: number, maxW: number, maxH: number) {
  const s = Math.min(maxW / img.width, maxH / img.height)
  const dw = img.width * s, dh = img.height * s
  c.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh)
}

export interface CompareLabels { title: string; subtitle: string; notListed: string; pointsTitle: string }

/** Draws a share-ready comparison card (1080 px wide) and returns the PNG file. [points] are the "why it wins" lines. */
export async function renderComparison(a: Product, b: Product, points: string[], labels: CompareLabels): Promise<File> {
  const [ra, rb] = compareRows(a, b)
  const rows = ra.map((x, i) => [x, rb[i]] as const).filter(([x, y]) => x.text != null || y.text != null)
  const w = 1080, rowH = 92
  const h = 560 + rows.length * rowH + (points.length ? 120 + points.length * 64 : 0) + 120
  const { canvas, c } = newCanvas(w, h)

  drawText(c, labels.title, 60, 90, 44, WHITE, true)
  drawText(c, labels.subtitle, 60, 140, 28, GREY)

  const colX = [60, 570]
  const imgs = await Promise.all([productBitmap(a), productBitmap(b)])
  ;[a, b].forEach((prod, i) => {
    const x = colX[i]
    c.fillStyle = '#F2F2F2'; roundRect(c, x, 180, 450, 240, 28); c.fill()
    const img = imgs[i]; if (img) drawFit(c, img, x + 225, 300, 410, 210)
    drawText(c, prod.brand.toUpperCase(), x, 465, 26, i === 0 ? CYAN : RED, true, 'left', 450)
    drawText(c, prod.name, x, 505, 32, WHITE, true, 'left', 450)
  })

  let y = 560
  rows.forEach(([x, z]) => {
    c.fillStyle = CARD; roundRect(c, 40, y, w - 80, rowH - 10, 18); c.fill()
    const win = winnerOf(x, z)
    drawText(c, x.label.toUpperCase(), 60, y + 32, 22, GREY, true)
    drawText(c, (x.text ?? labels.notListed) + (win === 1 ? '  ⚡' : ''), 60, y + 68, 30, win === 1 ? WHITE : '#CCCCCC', win === 1, 'left', 470)
    drawText(c, (z.text ?? labels.notListed) + (win === 2 ? '  ⚡' : ''), 570, y + 68, 30, win === 2 ? WHITE : '#CCCCCC', win === 2, 'left', 470)
    y += rowH
  })

  if (points.length) {
    y += 30
    drawText(c, labels.pointsTitle, 60, y + 40, 34, RED, true)
    y += 80
    points.forEach(line => { drawText(c, '✓  ' + line, 60, y + 30, 30, WHITE, false, 'left', 960); y += 64 })
  }
  drawText(c, 'Stylecraft Pro', w / 2, h - 50, 26, GREY, false, 'center')
  return toPng(canvas, `comparison_${a.id}_vs_${b.id}.png`)
}

/** What the benchmark chart needs to know about its metric (BenchMetric in BenchmarkScreen.kt). */
export interface BenchMetricLike { key: string; higherIsBetter: boolean; format: (v: number) => string }

/** Benchmark chart as a 1080 x 1350 image: bars, product photos on top, best first. */
export async function renderBenchmark(rows: [Product, number | null][], metric: BenchMetricLike, metricLabel: string, categoryLabelText: string,
  notListed: string, basis: string): Promise<File> {
  const w = 1080, h = 1350
  const { canvas, c } = newCanvas(w, h)
  drawText(c, metricLabel.toUpperCase(), 60, 95, 52, WHITE, true)
  drawText(c, categoryLabelText + ' · ' + basis + ' · ' + (metric.higherIsBetter ? 'higher is better' : 'lower is better'), 60, 145, 28, GREY, false, 'left', 960)

  const n = Math.max(rows.length, 1)
  const left = 60, right = w - 60, slot = (right - left) / n
  const baseY = 1080, maxBar = 620
  const vals = rows.map(r => r[1]).filter((v): v is number => v != null)
  const max = vals.length && Math.max(...vals) > 0 ? Math.max(...vals) : 1
  const imgs = await Promise.all(rows.map(([p]) => productBitmap(p)))
  rows.forEach(([prod, v], i) => {
    const b = prod.brand.toLowerCase()
    const own = b === 'stylecraft' || b === 'gamma+'
    const cx = left + slot * i + slot / 2
    const bw = slot * 0.62
    const bh = v == null ? maxBar * 0.15 : Math.max(maxBar * (v / max), maxBar * 0.05)
    const top = baseY - bh
    if (v == null) {
      c.lineWidth = 3; c.strokeStyle = GREY; roundRect(c, cx - bw / 2, top, bw, baseY - top, 14); c.stroke()
    } else {
      const g = c.createLinearGradient(0, top, 0, baseY)
      g.addColorStop(0, own ? '#FF5252' : '#9E9E9E'); g.addColorStop(1, own ? RED : '#616161')
      c.fillStyle = g; roundRect(c, cx - bw / 2, top, bw, baseY - top, 14); c.fill()
    }
    const r = Math.min(slot * 0.4, 70)
    const cy = top - r - 12
    c.fillStyle = '#F2F2F2'; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill()
    c.lineWidth = 5; c.strokeStyle = own ? RED : GREY; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke()
    const img = imgs[i]; if (img) drawFit(c, img, cx, cy, r * 1.4, r * 1.4)
    drawText(c, v != null ? metric.format(v) : notListed, cx, cy - r - 18, 30, v == null ? GREY : WHITE, true, 'center', slot - 6)
    drawText(c, prod.brand.toUpperCase(), cx, baseY + 50, 22, own ? RED : GREY, true, 'center', slot - 6)
    // product name on up to 3 lines
    const lines = ['']
    c.font = '24px sans-serif'
    prod.name.split(' ').forEach(wd => {
      const tryL = (lines[lines.length - 1] + ' ' + wd).trim()
      if (c.measureText(tryL).width <= slot - 10 || lines[lines.length - 1] === '') lines[lines.length - 1] = tryL
      else lines.push(wd)
    })
    lines.slice(0, 3).forEach((line, li) => drawText(c, line, cx, baseY + 85 + li * 30, 24, WHITE, false, 'center', slot - 6))
  })
  c.fillStyle = '#333333'; c.fillRect(left, baseY, right - left, 3)
  drawText(c, 'Stylecraft Pro · Field Sales Suite', w / 2, h - 40, 26, GREY, false, 'center')
  return toPng(canvas, `benchmark_${metric.key}.png`)
}
