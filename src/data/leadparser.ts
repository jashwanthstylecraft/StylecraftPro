/** Fields read from a badge, business card or QR code. Anything null was not found. */
export interface LeadDraft {
  name?: string | null
  shop?: string | null
  phone?: string | null
  email?: string | null
  city?: string | null
  website?: string | null
  title?: string | null
  badgeId?: string | null
  source?: string | null
}

export const draftIsEmpty = (d: LeadDraft) => [d.name, d.shop, d.phone, d.email, d.city, d.website, d.badgeId].every(v => !v || !v.trim())

/** Values from [other] fill only what this draft doesn't have yet. */
export function mergeDrafts(a: LeadDraft, other: LeadDraft | null | undefined): LeadDraft {
  if (!other) return a
  return {
    name: a.name ?? other.name, shop: a.shop ?? other.shop, phone: a.phone ?? other.phone, email: a.email ?? other.email,
    city: a.city ?? other.city, website: a.website ?? other.website, title: a.title ?? other.title,
    badgeId: a.badgeId ?? other.badgeId, source: a.source ?? other.source,
  }
}

/** One line of text found by the camera, with its size and position (for picking the name). */
export interface OcrLine { text: string; height: number; top: number }

const emailRx = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
const emailRxG = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const phoneRxG = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g
const phoneRx = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/
const webRx = /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+\.(?:com|net|org|co|us|io|shop|biz|salon|barber)(?:\/\S*)?\b/i
const cityRx = /^([A-Za-z .'-]{2,}),\s*([A-Za-z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/
const badgeNoRx = /\b\d{2}-\d{3}-\d{3}\b/
const nameWordRx = /^[A-Za-zÀ-ÿ'’.-]+$/
// A job-title line is made only of these words ("Master Barber / Owner"); "Barber Kings" is a shop, not a title.
const titleWord = /^(?:owner|co-owner|barber|stylist|manager|ceo|president|director|educator|artist|founder|master|senior|head|lead|and|of|creative|platform|brand|ambassador|colorist|hairstylist|cosmetologist)$/i
const isTitle = (s: string) => { const w = s.split(/[\s/&,|]+/).filter(x => x.trim() !== ''); return w.length > 0 && w.every(x => titleWord.test(x)) }
const companyHints = /barber|salon|shop|studio|spa|beauty|cuts|fades|inc\b|llc|co\.|corp|company|academy|school|supply|distribut|\//i
const eventWords = new RegExp(
  'cosmoprof|north america|las vegas|convention|center|exhibitor|attendee|visitor|buyer|press|media|staff|speaker|' +
  "thank you|sponsor|booth|badge|beauty show|expo|bronner|premiere|isse|america's beauty|mandalay|registration|" +
  '\\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\b.*\\d', 'i')

const isLetter = (c: string) => /\p{L}/u.test(c)
const countDigits = (s: string) => (s.match(/\d/g) ?? []).length
const nz = (s: string | null | undefined) => (s && s.trim() !== '' ? s : null)

/** "ALLEN BENITEZ" -> "Allen Benitez", "STYLECRAFT/GAMMA+" -> "Stylecraft/Gamma+", "MCDONALD" -> "McDonald". */
export function titleCase(s: string): string {
  return s.toLowerCase()
    .replace(/\p{L}[\p{L}'’]*/gu, m => m.charAt(0).toUpperCase() + m.slice(1))
    .replace(/\bMc(\p{Ll})/gu, (_m, g: string) => 'Mc' + g.toUpperCase())
}

// ---------------- QR / barcode ----------------
export function parseCode(raw: string): LeadDraft | null {
  const v = raw.trim()
  if (!v) return null
  const lower = v.toLowerCase()
  if (lower.startsWith('begin:vcard')) return parseVCard(v)
  if (lower.startsWith('mecard:')) return parseKeyed(v.substring(v.indexOf(':') + 1), 'MECARD')
  if (lower.startsWith('bizcard:')) return parseKeyed(v.substring(v.indexOf(':') + 1), 'BIZCARD')
  if (lower.startsWith('mailto:')) return { email: v.substring(v.indexOf(':') + 1).split('?')[0], source: 'QR' }
  if (lower.startsWith('tel:')) return { phone: v.substring(v.indexOf(':') + 1), source: 'QR' }
  if (v.includes('|')) return parseBadgeFields(v)
  if (lower.startsWith('http') || lower.startsWith('www.')) return { website: v, source: 'QR' }
  const d = fromFreeText(v.split(/\r?\n/).map(l => ({ text: l, height: 0, top: 0 })), 'QR')
  return draftIsEmpty(d) ? null : d
}

function parseBadgeFields(v: string): LeadDraft {
  const parts = v.split('|').map(p => p.trim())
  const words = parts.filter(p => p !== '' && [...p].every(c => isLetter(c) || c === ' ' || c === "'" || c === '-') && [...p].some(isLetter))
  const name = nz(titleCase(words.slice(0, 2).join(' ')))
  const email = parts.find(p => new RegExp('^' + emailRx.source + '$').test(p)) ?? null
  const phone = parts.find(p => countDigits(p) === 10 && phoneRx.test(p)) ?? null
  // the badge / registration number is usually the 2nd field (all digits)
  const id = parts.slice(1).find(p => p.length >= 5 && p.length <= 10 && /^\d+$/.test(p)) ?? null
  const extra = words.slice(2)
  const company = extra.find(w => companyHints.test(w)) ?? extra[0] ?? null
  return { name, shop: company ? titleCase(company) : null, email, phone, badgeId: id, source: 'Badge' }
}

function parseVCard(v: string): LeadDraft {
  const lines = v.replace(/\r\n /g, '').split(/\r?\n/)
  const field = (key: string) => {
    const l = lines.find(x => x.split(':')[0].split(';')[0].toLowerCase() === key.toLowerCase())
    return l ? nz(l.substring(l.indexOf(':') + 1).trim()) : null
  }
  const n = field('N')?.split(';')
  const name = field('FN') ?? (n ? [n[1], n[0]].filter(s => s && s.trim() !== '').join(' ') : null)
  const adr = field('ADR')?.split(';')
  const city = adr ? nz([adr[3], adr[4]].filter(s => s && s.trim() !== '').join(', ')) : null
  return { name, shop: field('ORG')?.replace(/;/g, ' ').trim() ?? null, phone: field('TEL'), email: field('EMAIL'), city, website: field('URL'), title: field('TITLE'), source: 'QR' }
}

function parseKeyed(body: string, kind: 'MECARD' | 'BIZCARD'): LeadDraft {
  const map: Record<string, string> = {}
  body.split(';').forEach(p => { const i = p.indexOf(':'); if (i > 0) map[p.substring(0, i).toUpperCase()] = p.substring(i + 1) })
  if (kind === 'MECARD') {
    const parts = map['N']?.split(',')
    const name = parts ? (parts.length === 2 ? `${parts[1]} ${parts[0]}` : parts[0]) : null
    return { name: name?.trim() ?? null, phone: map['TEL'] ?? null, email: map['EMAIL'] ?? null, website: map['URL'] ?? null, shop: map['ORG'] ?? null, city: map['ADR'] ?? null, source: 'QR' }
  }
  return { name: nz([map['N'], map['X']].filter(Boolean).join(' ')), shop: map['C'] ?? null, title: map['T'] ?? null, phone: map['B'] ?? map['M'] ?? null, email: map['E'] ?? null, city: map['A'] ?? null, source: 'QR' }
}

// ---------------- printed text (badge or business card) ----------------
export function fromFreeText(lines: OcrLine[], source: string): LeadDraft {
  const clean = lines.map(l => ({ ...l, text: l.text.trim() })).filter(l => l.text.length >= 2)
  const all = clean.map(l => l.text).join('\n')
  const email = emailRx.exec(all)?.[0] ?? null
  const phone = (all.match(phoneRxG) ?? []).find(m => countDigits(m) >= 10) ?? null
  // look for links with the e-mail removed, so "name@shop.com" isn't read as a website (but "www.shop.com" still is)
  const website = webRx.exec(all.replace(emailRxG, ' '))?.[0]
    ?? (email ? (() => { const d = email.substring(email.indexOf('@') + 1); return /^(gmail|yahoo|hotmail|outlook|icloud|aol)\..*/i.test(d) ? null : d })() : null)
  const badgeNo = badgeNoRx.exec(all)?.[0] ?? null
  const cityLine = clean.find(l => cityRx.test(l.text) && !eventWords.test(l.text)) ?? null
  const cm = cityLine ? cityRx.exec(cityLine.text) : null
  const city = cm ? titleCase(cm[1].trim()) + ', ' + cm[2].toUpperCase() : null

  // Candidates for name / company: plain words, not contact info, not event text
  const cand = clean.filter(l =>
    l !== cityLine && !eventWords.test(l.text) && !emailRx.test(l.text) && !webRx.test(l.text) &&
    countDigits(l.text) < 3 && [...l.text].some(isLetter)).sort((a, b) => a.top - b.top)
  const nameCand = cand.filter(l => {
    const w = l.text.split(/\s+/)
    return w.length >= 1 && w.length <= 4 && w.every(x => nameWordRx.test(x)) && !companyHints.test(l.text) && !isTitle(l.text)
  })
  // Name = the largest plain line; badges print first and last name on two lines
  let first: OcrLine | null = null
  for (const l of nameCand) if (first === null || l.height > first.height) first = l
  let name: string | null = null
  const used = new Set<OcrLine>()
  if (first) {
    used.add(first)
    name = first.text
    const idx = cand.indexOf(first)
    const next = cand[idx + 1]
    if (first.text.split(' ').length === 1 && next && nameCand.includes(next) && next.text.split(' ').length === 1) {
      name += ' ' + next.text; used.add(next)
    }
  }
  const rest = cand.filter(l => !used.has(l))
  const notTitle = rest.filter(l => !isTitle(l.text))
  const maxUsedIdx = [...used].reduce((m, u) => Math.max(m, cand.indexOf(u)), -1)
  const company = notTitle.find(l => companyHints.test(l.text))?.text
    ?? notTitle.find(l => cand.indexOf(l) > maxUsedIdx)?.text ?? null
  const title = rest.find(l => isTitle(l.text) && l.text !== company)?.text ?? null

  return {
    name: name ? titleCase(name) : null, shop: company ? (company === company.toUpperCase() ? titleCase(company) : company) : null,
    phone, email, city, website, title, badgeId: badgeNo, source,
  }
}

export const LeadParser = { parseCode, fromFreeText, titleCase }
