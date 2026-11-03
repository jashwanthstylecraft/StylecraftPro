import { Product, Category, categoryLabel } from './product'

/**
 * Turns the text the camera reads into a product guess.
 *
 * Scoring, strongest first:
 *  - full model code found (e.g. SC607M, FX870NG, 8148)      -> 100
 *  - model code without its last letter (SC607 for SC607M)   -> 80
 *  - every distinctive word of the name found                -> 25 per word
 *  - brand printed on the label                               -> +10
 *  - category word printed on the label (TRIMMER...)          -> +8
 * Common OCR slips (O/0, I/1) are ignored when comparing codes.
 */
export interface Match { product: Product; score: number }

const genericWords = new Set([
  'CLIPPER', 'CLIPPERS', 'TRIMMER', 'TRIMMERS', 'SHAVER', 'SHAVERS', 'DRYER', 'HAIR',
  'CORDLESS', 'CORD', 'PROFESSIONAL', 'PRO', 'THE', 'AND', 'WITH', 'EDITION', 'FOIL',
  'DOUBLE', 'SINGLE', 'TRIPLE', 'LITHIUM', 'LI', 'ION', 'MOTOR', 'DIGITAL', 'NEW', '2IN1', 'IN',
])

const normCode = (s: string) => s.toUpperCase().replace(/O/g, '0').replace(/I/g, '1').replace(/[^A-Z0-9]/g, '')
const words = (s: string) => s.toUpperCase().split(/[^A-Z0-9+]+/).filter(w => w !== '')
const hasDigit = (s: string) => /\d/.test(s)
const allDigits = (s: string) => /^\d+$/.test(s)

/** Codes worth looking for: model parts that contain at least one digit and are 3+ chars. */
function modelCodes(p: Product): string[] {
  const parts = (p.model ?? '').split(/[/, ;]/)
  const all = parts.flatMap(part => [part, part.split('-')[0]])
    .filter(hasDigit) // real digits, before O/I mapping
    .map(normCode).filter(c => c.length >= 3)
  return [...new Set(all)]
}

const nameWords = (p: Product) => words(p.name).filter(w => !genericWords.has(w) && w !== p.brand.toUpperCase() && w.length >= 3)

export function bestMatch(rawText: string, products: Product[], category: Category | null): Match | null {
  if (!rawText.trim()) return null
  const textWords = new Set(words(rawText))
  const codeText = normCode(rawText)
  const upper = rawText.toUpperCase()
  const candidates = category ? products.filter(p => p.category === category) : products
  const scored: Match[] = []
  for (const p of candidates) {
    let score = 0
    for (const code of modelCodes(p)) {
      if (allDigits(code)) {
        // Plain numbers (e.g. Wahl 8148) must appear as a whole word, so a barcode won't match.
        if (code.length >= 4 && [...textWords].some(w => normCode(w) === code)) score = Math.max(score, 90)
      } else if (code.length >= 4 && codeText.includes(code)) {
        score = Math.max(score, 100)
      } else if (code.length >= 5 && /[A-Za-z]/.test(code[code.length - 1]) && codeText.includes(code.slice(0, -1))) {
        score = Math.max(score, 80)
      } else if (code.length === 3 && [...textWords].some(w => normCode(w) === code)) {
        score = Math.max(score, 60)
      }
    }
    const nw = nameWords(p)
    if (nw.length > 0 && nw.every(w => textWords.has(w))) score += 25 * nw.length
    if (score === 0) continue
    if (upper.includes(p.brand.toUpperCase().split(' ')[0])) score += 10
    if (textWords.has(categoryLabel(p.category).toUpperCase())) score += 8
    scored.push({ product: p, score })
  }
  const sorted = [...scored].sort((a, b) => b.score - a.score)
  const top = sorted[0]; if (!top) return null
  // Refuse to guess when two different products tie (e.g. only "2020C" is visible).
  const second = sorted[1]
  if (second && second.score === top.score) return null
  return top.score >= 25 ? top : null
}

/** Short preview of code-like words seen, for the scanner hint line. */
export const codeHints = (rawText: string): string[] =>
  words(rawText).filter(w => w.length >= 4 && hasDigit(w) && /[A-Z]/.test(w)).slice(0, 3)

export const ProductMatcher = { bestMatch, codeHints }
