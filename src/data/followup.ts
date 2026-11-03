import { AppPrefs } from './prefs'
import { Lead } from './leads'
import { Product, displayName } from './product'
import { money } from './format'

/**
 * Follow-up after a show or visit: a ready-to-send email in the rep's own email app (mailto:), and a calendar
 * invite in Google Calendar (opens in a new tab). Both are pre-filled with the barber's name, the event
 * and the products they liked; the rep can still edit everything before sending.
 */
export interface Email { to: string | null; subject: string; body: string }

const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? ''

export function buildEmail(lead: Lead, products: Product[], spanish: boolean): Email {
  const byId = new Map(products.map(p => [p.id, p]))
  const liked = lead.productIds.map(id => byId.get(id)).filter((p): p is Product => !!p)
  const rep = AppPrefs.repName.get().trim()
  const repEmail = AppPrefs.repEmail.get().trim()
  const repPhone = AppPrefs.repPhone.get().trim()
  const event = lead.event?.trim() ?? ''
  const hi = firstName(lead.name)
  const productLines = liked.map(p => {
    const link = p.buyUrl ?? p.websiteUrl
    return `• ${displayName(p)}` + (p.priceUsd != null ? ` – ${money(p.priceUsd)}` : '') + (link ? `\n  ${link}` : '')
  }).join('\n')
  const signature = [rep || null, 'Stylecraft / Gamma+', repPhone || null, repEmail || null, 'stylecraftus.com'].filter(Boolean).join('\n')
  if (spanish) {
    const subject = 'Un gusto conocerte' + (event ? ` en ${event}` : '') + ' – Stylecraft'
    let body = `Hola ${hi},\n\n`
    body += `Mi nombre es ${rep || '[tu nombre]'}`
    body += event ? ` y nos conocimos en ${event}. ` : '. '
    body += 'Gracias por tu tiempo.\n\n'
    if (liked.length) body += `Te interesaron estos productos:\n${productLines}\n\n`
    body += '¿Te gustaría agendar una llamada o videollamada corta para resolver tus preguntas y ver precios para tu barbería?\n\n'
    body += `Saludos,\n${signature}`
    return { to: lead.email, subject, body }
  }
  const subject = 'Great meeting you' + (event ? ` at ${event}` : '') + ' – Stylecraft'
  let body = `Hi ${hi},\n\n`
  body += `My name is ${rep || '[your name]'}`
  body += event ? ` and we met at ${event}. ` : '. '
  body += 'Thanks for taking the time to stop by.\n\n'
  if (liked.length) body += `You were interested in these products:\n${productLines}\n\n`
  body += 'Would you like to set up a quick call or video meeting to answer any questions and go over pricing for your shop?\n\n'
  body += `Best regards,\n${signature}`
  return { to: lead.email, subject, body }
}

const enc = (s: string) => encodeURIComponent(s)

/** mailto: link with everything filled in. */
export function mailtoUrl(email: Email): string {
  return 'mailto:' + (email.to ? encodeURIComponent(email.to) : '') + '?subject=' + enc(email.subject) + '&body=' + enc(email.body)
}

/** Opens the default email app with everything filled in. Always returns true (the browser can't tell if there is no mail app). */
export function openEmail(email: Email): boolean {
  window.location.href = mailtoUrl(email)
  return true
}

/** Next weekday at 10:00 local time, [daysAhead] days from now. */
export function suggestedTime(daysAhead: number): number {
  const c = new Date()
  c.setDate(c.getDate() + daysAhead)
  while (c.getDay() === 6 || c.getDay() === 0) c.setDate(c.getDate() + 1)
  c.setHours(10, 0, 0, 0)
  return c.getTime()
}

const utcStamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')

/** Google Calendar "new event" link with a 30-minute meeting pre-filled (title, barber as guest, notes with the products). */
export function meetingUrl(lead: Lead, products: Product[], start: number, spanish: boolean): string {
  const end = start + 30 * 60 * 1000
  const email = buildEmail(lead, products, spanish)
  const title = (spanish ? 'Seguimiento Stylecraft – ' : 'Stylecraft follow-up – ') + lead.name + (lead.shop ? ` (${lead.shop})` : '')
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + enc(title) +
    '&dates=' + utcStamp(start) + '/' + utcStamp(end) + '&details=' + enc(email.body) + (lead.email ? '&add=' + enc(lead.email) : '')
}

/** Opens Google Calendar in a new tab. In Google Calendar click "Add Google Meet video conferencing", then Save. */
export function openMeeting(lead: Lead, products: Product[], start: number, spanish: boolean): boolean {
  const w = window.open(meetingUrl(lead, products, start, spanish), '_blank', 'noopener')
  return w != null
}

export const FollowUp = { buildEmail, openEmail, mailtoUrl, suggestedTime, meetingUrl, openMeeting }
