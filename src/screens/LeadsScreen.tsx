// Port of LeadsScreen.kt (LeadsScreen, LeadsTwoPane, LeadFormScreen, LeadScanOverlay, statusColor)
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Lead, LeadStatus, LeadStore, newLead, useLeads } from '../data/leads'
import {
  LeadDraft, LeadParser, OcrLine, draftIsEmpty, mergeDrafts,
} from '../data/leadparser'
import { AppPrefs } from '../data/prefs'
import { Product, categoryLabel, displayName } from '../data/product'
import { useProducts } from '../data/repository'
import { Store, useStore } from '../data/store'
import { TeamSync } from '../data/teamsync'
import { FollowUp } from '../data/followup'
import { uuid } from '../data/format'
import { useBackHandler } from '../nav/NavProvider'
import { Brand, Dialog, Field, Pill, ScreenHeader, Spinner, showToast, vibrateShort } from '../ui/Common'
import { staggerStyle } from '../ui/Motion'
import { shareText } from '../ui/share'
import { t, tr, useLang } from '../ui/i18n'
import { GIcon } from './groupCIcons'
import './groupC.css'
import './leads.css'

const LeadColor = '#69F0AE'

/** Bumped whenever a lead photo is saved so list avatars reload (the Kotlin list re-read the file on every recompose). */
const photoVersion = new Store<number>(0)

export function statusColor(status: string): string {
  switch (status) {
    case LeadStatus.EMAILED: return '#00E5FF'
    case LeadStatus.MEETING: return '#B388FF'
    case LeadStatus.WON: return '#CCFF00'
    case LeadStatus.LOST: return '#9E9E9E'
    default: return '#69F0AE'
  }
}

const fmtShort = (ms: number) => {
  const d = new Date(ms)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
const fmtLong = (ms: number) => {
  const d = new Date(ms)
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** Round avatar: the lead's photo (IndexedDB) or initials. */
function useLeadPhoto(id: string, ...deps: unknown[]): string | null {
  const [url, setUrl] = useState<string | null>(null)
  const version = useStore(photoVersion)
  useEffect(() => {
    let dead = false
    let made: string | null = null
    LeadStore.photoUrl(id).then(u => { if (dead) { if (u) URL.revokeObjectURL(u) } else { made = u; setUrl(u) } })
    return () => { dead = true; if (made) URL.revokeObjectURL(made) }
  }, [id, version, ...deps]) // eslint-disable-line react-hooks/exhaustive-deps
  return url
}

function LeadAvatar({ lead }: { lead: Lead }) {
  const url = useLeadPhoto(lead.id, lead.timestamp)
  const initials = lead.name.split(' ').map(w => w.charAt(0).toUpperCase()).filter(Boolean).slice(0, 2).join('')
  return (
    <div className="lead-avatar">
      {url ? <img src={url} alt="" /> : <span style={{ color: LeadColor, fontWeight: 900 }}>{initials}</span>}
    </div>
  )
}

// ======================================================================= list

export interface LeadsScreenProps {
  onBack: () => void
  onNew: () => void
  onOpen: (l: Lead) => void
  selectedId?: string | null
}

/** All leads saved on this device: export to Excel or send to the team Google Sheet. */
export function LeadsScreen({ onBack, onNew, onOpen, selectedId = null }: LeadsScreenProps) {
  useLang()
  const leads = useLeads()
  const products = useProducts()
  const byId = useMemo(() => new Map(products.map(p => [p.id, p])), [products])
  const [filter, setFilter] = useState('All')
  const [sending, setSending] = useState(false)
  const isOpen = (l: Lead) => l.status !== LeadStatus.WON && l.status !== LeadStatus.LOST

  // Leads needing attention first: overdue / upcoming follow-ups, then the newest
  const sorted = useMemo(() => leads.filter(l => {
    switch (filter) {
      case 'To follow up': return isOpen(l)
      case 'Meetings': return l.status === LeadStatus.MEETING
      case 'Won': return l.status === LeadStatus.WON
      default: return true
    }
  }).sort((a, b) =>
    (Number(!(isOpen(a) && a.followUpAt != null)) - Number(!(isOpen(b) && b.followUpAt != null))) ||
    ((a.followUpAt ?? Number.MAX_SAFE_INTEGER) - (b.followUpAt ?? Number.MAX_SAFE_INTEGER)) ||
    (b.timestamp - a.timestamp)), [leads, filter])
  const unsent = leads.filter(l => !l.sent).length

  const exportCsv = () => {
    shareText('stylecraft_leads.csv', LeadStore.toCsv(products), 'text/csv', tr('Leads'))
      .catch(e => showToast(e instanceof Error ? e.message : 'Error'))
  }

  const sendAll = async () => {
    if (!TeamSync.isConfigured) { showToast(tr('Add the Team Google Sheet link in Settings first')); return }
    setSending(true)
    const toSend = LeadStore.all.get().filter(l => !l.sent)
    const r = await TeamSync.sendLeads(toSend, products)
    let msg: string
    if (r.kind === 'ok') { await LeadStore.markSent(toSend.map(l => l.id)); msg = r.message }
    else if (r.kind === 'notConfigured') msg = tr('Add the Team Google Sheet link in Settings first')
    else msg = tr("Couldn't send") + ': ' + r.reason
    setSending(false)
    showToast(msg)
  }

  return (
    <div className="lead-wrap">
      <div className="screen">
        <ScreenHeader title={t('LEADS')} subtitle={`${leads.length} ` + t('saved') + (unsent > 0 ? ` · ${unsent} ` + t('not sent') : '')} onBack={onBack}
          actions={
            <button className="icon-btn" disabled={leads.length === 0} aria-label={t('Export to Excel')} title={t('Export to Excel')}
              style={{ opacity: leads.length === 0 ? 0.38 : 1 }} onClick={exportCsv}>
              <GIcon name="share" />
            </button>
          } />

        <div className="c-chips" style={{ padding: '4px 16px' }}>
          {['All', 'To follow up', 'Meetings', 'Won'].map(f => (
            <button key={f} className={'c-chip' + (filter === f ? ' sel' : '')} style={{ ['--chip' as string]: LeadColor }} onClick={() => setFilter(f)}>{t(f)}</button>
          ))}
        </div>

        {unsent > 0 && (
          <div style={{ padding: '0 16px 8px' }}>
            <button className="btn btn-block" style={{ ['--bg-c' as string]: LeadColor, height: 48 }} disabled={sending} onClick={sendAll}>
              {sending ? <Spinner size={18} color="#000" /> : <GIcon name="cloudUpload" color="#000" />}
              <span>{t('SEND TO TEAM SHEET') + ` (${unsent})`}</span>
            </button>
          </div>
        )}

        {sorted.length === 0 ? (
          <div className="grow center" style={{ padding: 32, textAlign: 'center', color: 'gray', fontSize: 14 }}>
            {t("No leads yet. Tap + after a demo to save the barber's info and the products they liked.")}
          </div>
        ) : (
          <div className="scroll" style={{ padding: '0 16px 100px' }}>
            <div className="col" style={{ gap: 10 }}>
              {sorted.map((l, i) => {
                const sub = [l.shop, l.city].filter(Boolean).join(' · ')
                const contact = [l.phone, l.email].filter(Boolean).join(' · ')
                const liked = l.productIds.map(id => byId.get(id)?.name).filter((n): n is string => !!n)
                const due = l.followUpAt != null && l.followUpAt <= Date.now() + 24 * 3600 * 1000 && isOpen(l)
                const selected = l.id === selectedId
                return (
                  <div key={l.id} className="lead-card stagger bounce" style={{
                    ...staggerStyle(i % 10, 45),
                    borderWidth: selected ? 2 : 1,
                    borderColor: selected ? Brand.Cyan : l.sent ? Brand.CardBorder : 'color-mix(in srgb, ' + LeadColor + ' 50%, transparent)',
                  }} onClick={() => onOpen(l)}>
                    <LeadAvatar lead={l} />
                    <div style={{ width: 12, flex: '0 0 auto' }} />
                    <div className="grow">
                      <div className="row" style={{ gap: 6 }}>
                        <div className="grow ellipsis" style={{ color: '#fff', fontWeight: 900, fontSize: 16 }}>{l.name}</div>
                        {l.wantsVisit && <Pill text={t('VISIT / DEMO')} color={Brand.Red} />}
                        <Pill text={t(l.status).toUpperCase()} color={statusColor(l.status)} />
                        <Pill text={l.sent ? t('SENT') : t('ON PHONE')} color={l.sent ? Brand.Muted : LeadColor} />
                      </div>
                      {sub && <div style={{ color: '#D3D3D3', fontSize: 13 }}>{sub}</div>}
                      {contact && <div style={{ color: Brand.Cyan, fontSize: 12 }}>{contact}</div>}
                      {liked.length > 0 && <div className="clamp-2" style={{ color: '#fff', fontSize: 12, marginTop: 4 }}>{'♥ ' + liked.join(', ')}</div>}
                      <div style={{ color: 'gray', fontSize: 11, marginTop: 4 }}>{fmtShort(l.timestamp) + (l.event ? ` · ${l.event}` : '')}</div>
                      {l.followUpAt != null && (
                        <div style={{ color: due ? Brand.Red : '#B388FF', fontSize: 12, fontWeight: 700 }}>
                          {'⏰ ' + t('Follow-up') + ': ' + fmtShort(l.followUpAt)}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
      <button className="lead-fab bounce" onClick={onNew}>
        <GIcon name="add" color="#000" />
        <span>{t('NEW LEAD')}</span>
      </button>
    </div>
  )
}

/**
 * Landscape tablet / desktop: the leads list on the left and the open lead (or a new one) on the right,
 * so reps never lose their place in the list.
 */
export function LeadsTwoPane({ onBack }: { onBack: () => void }) {
  useLang()
  // null = nothing open, "" = a new lead, otherwise the id of the lead being edited
  const [openId, setOpenId] = useState<string | null>(null)
  const [newCount, setNewCount] = useState(0)

  // Back closes the open lead first, then leaves the Leads screen
  useBackHandler(openId != null, () => setOpenId(null))

  return (
    <div className="lead-two" >
      <div style={{ flex: '42 1 0', minWidth: 0, height: '100%' }}>
        <LeadsScreen onBack={onBack} onNew={() => { setNewCount(c => c + 1); setOpenId('') }} onOpen={l => setOpenId(l.id)} selectedId={openId} />
      </div>
      <div style={{ width: 1, background: 'rgba(255,255,255,0.08)', flex: '0 0 auto' }} />
      <div style={{ flex: '58 1 0', minWidth: 0, height: '100%' }}>
        {openId == null ? (
          <div className="col center" style={{ height: '100%', padding: 40, textAlign: 'center' }}>
            <GIcon name="personAdd" size={64} color="color-mix(in srgb, #69F0AE 60%, transparent)" />
            <div style={{ height: 16 }} />
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>{t('Pick a lead to see it here')}</div>
            <div style={{ color: 'gray', fontSize: 14 }}>{t('or tap NEW LEAD after a demo.')}</div>
          </div>
        ) : (
          // A fresh form for every lead opened (the form keeps its own state)
          <LeadFormScreen key={openId === '' ? `new-${newCount}` : openId} leadId={openId === '' ? null : openId} productId={null} onDone={() => setOpenId(null)} />
        )}
      </div>
    </div>
  )
}

// ======================================================================= form

/** Form to add or edit a lead. [productId] pre-selects the product being shown. */
export function LeadFormScreen({ leadId, productId, onDone }: { leadId: string | null | undefined; productId: string | null | undefined; onDone: () => void }) {
  useLang()
  const products = useProducts()
  const existing = useMemo(() => (leadId ? LeadStore.findById(leadId) : undefined), [leadId])
  const lastEvent = useStore(AppPrefs.lastEvent)
  const favorites = useStore(AppPrefs.favorites)
  const language = useStore(AppPrefs.language)

  const [name, setName] = useState(existing?.name ?? '')
  const [shop, setShop] = useState(existing?.shop ?? '')
  const [phone, setPhone] = useState(existing?.phone ?? '')
  const [email, setEmail] = useState(existing?.email ?? '')
  const [city, setCity] = useState(existing?.city ?? '')
  const [event, setEvent] = useState(existing?.event ?? lastEvent)
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [wantsVisit, setWantsVisit] = useState(existing?.wantsVisit ?? false)
  const [title, setTitle] = useState(existing?.title ?? '')
  const [website, setWebsite] = useState(existing?.website ?? '')
  const [badgeId, setBadgeId] = useState(existing?.badgeId ?? '')
  const [source, setSource] = useState<string | null>(existing?.source ?? null)
  const [newId] = useState(() => existing?.id ?? uuid())
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const photoBlob = useRef<Blob | null>(null)
  const photoChanged = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  const [picked, setPicked] = useState<string[]>(() => existing?.productIds ?? (productId ? [productId] : []))
  const [productQuery, setProductQuery] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [status, setStatus] = useState(existing?.status ?? LeadStatus.NEW)
  const [followUpAt, setFollowUpAt] = useState<number | null>(existing?.followUpAt ?? null)
  const [lastContactAt, setLastContactAt] = useState<number | null>(existing?.lastContactAt ?? null)
  const [pickMeetingTime, setPickMeetingTime] = useState(false)
  const spanish = language === 'es'

  // existing profile photo
  useEffect(() => {
    let dead = false
    let made: string | null = null
    LeadStore.photoUrl(newId).then(u => { if (dead) { if (u) URL.revokeObjectURL(u) } else if (!photoChanged.current) { made = u; setPhotoUrl(u) } else if (u) URL.revokeObjectURL(u) })
    return () => { dead = true; if (made) URL.revokeObjectURL(made) }
  }, [newId])
  const photoUrlRef = useRef<string | null>(null)
  photoUrlRef.current = photoUrl
  useEffect(() => () => { if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current) }, [])

  const onPhotoChosen = (file: File | undefined) => {
    if (!file) return
    photoBlob.current = file
    photoChanged.current = true
    setPhotoUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file) })
  }

  /** Fills empty fields from a scan; fields already typed are kept. */
  const applyScan = (d: LeadDraft) => {
    if (!name.trim() && d.name) setName(d.name)
    if (!shop.trim() && d.shop) setShop(d.shop)
    if (!phone.trim() && d.phone) setPhone(d.phone)
    if (!email.trim() && d.email) setEmail(d.email)
    if (!city.trim() && d.city) setCity(d.city)
    if (!title.trim() && d.title) setTitle(d.title)
    if (!website.trim() && d.website) setWebsite(d.website)
    if (!badgeId.trim() && d.badgeId) setBadgeId(d.badgeId)
    if (d.source != null) setSource(d.source)
  }

  const byId = useMemo(() => new Map(products.map(p => [p.id, p])), [products])
  const suggestions = useMemo(() => {
    const q = productQuery.trim().toLowerCase()
    if (q === '') return favorites.map(id => byId.get(id)).filter((p): p is Product => !!p && !picked.includes(p.id)).slice(0, 6)
    return products
      .filter(p => !picked.includes(p.id) && (p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || (p.model?.toLowerCase().includes(q) ?? false)))
      .sort((a, b) => Number(!(a.brand === 'Stylecraft' || a.brand === 'Gamma+')) - Number(!(b.brand === 'Stylecraft' || b.brand === 'Gamma+')))
      .slice(0, 6)
  }, [productQuery, products, picked, favorites, byId])

  const nz = (s: string) => s.trim() || null

  /** The lead as currently typed, or null (with a message) when the name is missing. */
  const buildLead = (): Lead | null => {
    if (!name.trim()) { showToast(tr("Add the barber's name")); return null }
    return {
      ...(existing ?? newLead({ id: newId, name: name.trim() })),
      name: name.trim(), shop: nz(shop), phone: nz(phone), email: nz(email), city: nz(city), event: nz(event),
      notes: nz(notes), wantsVisit, productIds: [...picked], sent: false,
      title: nz(title), website: nz(website), badgeId: nz(badgeId), source: source ?? 'Manual', status, followUpAt, lastContactAt,
    }
  }

  /** Saves on this device and sends to the team sheet when it's set up (otherwise it waits on the device). */
  const persist = (lead: Lead) => {
    LeadStore.save(lead)
    const blob = photoChanged.current ? photoBlob.current : null
    photoChanged.current = false
    AppPrefs.setLastEvent(event)
    void (async () => {
      if (blob) { await LeadStore.savePhoto(lead.id, blob); photoVersion.update(v => v + 1) }
      if (TeamSync.isConfigured) {
        const r = await TeamSync.sendLeads([lead], products)
        if (r.kind === 'ok') await LeadStore.markSent([lead.id])
      }
    })()
  }

  const save = () => {
    const lead = buildLead(); if (!lead) return
    persist(lead)
    vibrateShort()
    showToast(tr('Lead saved'))
    onDone()
  }

  const sendFollowUpEmail = () => {
    const lead = buildLead(); if (!lead) return
    if (!lead.email?.trim()) { showToast(tr("Add the barber's email first")); return }
    if (!AppPrefs.repName.get().trim()) showToast(tr('Tip: add your name in Settings so it signs the email'))
    if (FollowUp.openEmail(FollowUp.buildEmail(lead, products, spanish))) {
      const now = Date.now()
      const next = status === LeadStatus.NEW ? LeadStatus.EMAILED : status
      setLastContactAt(now); setStatus(next)
      persist({ ...lead, lastContactAt: now, status: next })
    } else showToast(tr('No email app found on this phone'))
  }

  const scheduleMeeting = (start: number) => {
    const lead = buildLead(); if (!lead) return
    if (FollowUp.openMeeting(lead, products, start, spanish)) {
      const now = Date.now()
      const next = status !== LeadStatus.WON && status !== LeadStatus.LOST ? LeadStatus.MEETING : status
      setFollowUpAt(start); setLastContactAt(now); setStatus(next)
      persist({ ...lead, followUpAt: start, lastContactAt: now, status: next })
      showToast(tr('In Google Calendar tap "Add Google Meet", then Save'))
    } else showToast(tr('No calendar app found on this phone'))
  }

  const status2 = [
    followUpAt != null ? t('Next follow-up') + ': ' + fmtLong(followUpAt) : null,
    lastContactAt != null ? t('Last contact') + ': ' + fmtLong(lastContactAt) : null,
  ].filter(Boolean).join('\n')

  return (
    <div className="screen">
      <div className="scroll">
        <ScreenHeader title={existing ? t('EDIT LEAD') : t('NEW LEAD')} subtitle={t('SAVED ON THIS PHONE')} onBack={onDone}
          actions={existing ? (
            <button className="icon-btn" aria-label={t('Delete')} title={t('Delete')} style={{ color: 'gray' }} onClick={() => setConfirmDelete(true)}><GIcon name="delete" /></button>
          ) : undefined} />
        <div className="col lead-form" style={{ padding: '0 16px', gap: 8 }}>
          {/* Photo + scan buttons */}
          <div className="row" style={{ gap: 14 }}>
            <button className="lead-photo" aria-label={t('Photo')} onClick={() => fileInput.current?.click()}>
              {photoUrl ? <img src={photoUrl} alt={t('Photo')} /> : (
                <span className="col center">
                  <GIcon name="camera" color={LeadColor} />
                  <span style={{ color: LeadColor, fontSize: 10, fontWeight: 900 }}>{t('PHOTO')}</span>
                </span>
              )}
            </button>
            <input ref={fileInput} type="file" accept="image/*" capture="environment" hidden
              onChange={e => { onPhotoChosen(e.target.files?.[0]); e.target.value = '' }} />
            <div className="grow">
              <button className="btn btn-block" style={{ ['--bg-c' as string]: LeadColor, height: 52 }} onClick={() => setScanning(true)}>
                <GIcon name="qr" color="#000" />
                <span style={{ fontSize: 13 }}>{t('SCAN BADGE / CARD / QR')}</span>
              </button>
              <div style={{ color: Brand.Muted, fontSize: 11, marginTop: 4 }}>{t('Fills the form from an event badge, business card or contact QR.')}</div>
              {source && <div style={{ color: LeadColor, fontSize: 11, fontWeight: 700 }}>{t('Captured by') + ': ' + t(source)}</div>}
            </div>
          </div>
          <Field label={t('Barber name') + ' *'} value={name} onChange={setName} />
          <Field label={t('Title (owner, barber…)')} value={title} onChange={setTitle} />
          <Field label={t('Shop / salon')} value={shop} onChange={setShop} />
          <Field label={t('Phone')} value={phone} onChange={setPhone} type="tel" inputMode="tel" />
          <Field label={t('Email')} value={email} onChange={setEmail} type="email" inputMode="email" />
          <Field label={t('Website / Instagram')} value={website} onChange={setWebsite} inputMode="url" />
          <Field label={t('City / state')} value={city} onChange={setCity} />
          <Field label={t('Badge # (events)')} value={badgeId} onChange={setBadgeId} />
          <Field label={t('Show / event (optional)')} value={event} onChange={setEvent} />

          <div className="c-label" style={{ color: LeadColor, paddingTop: 10 }}>{t('INTERESTED IN')}</div>
          {picked.length > 0 && (
            <div className="row wrap" style={{ gap: 6 }}>
              {picked.map(id => byId.get(id)).filter((p): p is Product => !!p).map(p => (
                <button key={p.id} className="lead-chip" onClick={() => setPicked(list => list.filter(x => x !== p.id))}>
                  <span className="ellipsis" style={{ maxWidth: 220 }}>{p.name}</span>
                  <GIcon name="close" size={16} />
                </button>
              ))}
            </div>
          )}
          <Field value={productQuery} onChange={setProductQuery} placeholder={t('Add a product: type a name or model')} />
          {suggestions.length > 0 && (
            <>
              {productQuery.trim() === '' && <div style={{ color: Brand.Muted, fontSize: 11 }}>{t('From your favorites')}</div>}
              {suggestions.map(p => (
                <div key={p.id} className="lead-suggest" onClick={() => { setPicked(list => [...list, p.id]); setProductQuery('') }}>
                  <GIcon name="add" size={18} color={LeadColor} />
                  <span style={{ width: 8, flex: '0 0 auto' }} />
                  <span className="grow ellipsis" style={{ color: '#fff', fontSize: 14 }}>{displayName(p)}</span>
                  <span style={{ color: Brand.Muted, fontSize: 11 }}>{t(categoryLabel(p.category))}</span>
                </div>
              ))}
            </>
          )}

          <div className="row" style={{ paddingTop: 8 }}>
            <span className="grow" style={{ color: '#fff', fontSize: 15 }}>{t('Wants a visit or demo')}</span>
            <button role="switch" aria-checked={wantsVisit} className={'switch' + (wantsVisit ? ' on' : '')} onClick={() => setWantsVisit(v => !v)}><span /></button>
          </div>
          <div className="lead-notes"><Field label={t('Notes')} value={notes} onChange={setNotes} multiline /></div>

          {/* ---- Follow-up: email + Google Meet, and where this lead stands ---- */}
          <div className="c-label" style={{ color: LeadColor, paddingTop: 14 }}>{t('FOLLOW UP')}</div>
          <div className="row" style={{ gap: 10 }}>
            <button className="btn btn-outline grow" style={{ height: 52, borderColor: 'color-mix(in srgb, ' + LeadColor + ' 70%, transparent)', color: LeadColor }} onClick={sendFollowUpEmail}>
              <GIcon name="email" size={18} color={LeadColor} /><span style={{ fontSize: 13 }}>{t('EMAIL')}</span>
            </button>
            <button className="btn btn-outline grow" style={{ height: 52, borderColor: 'color-mix(in srgb, ' + Brand.Cyan + ' 70%, transparent)', color: Brand.Cyan }} onClick={() => setPickMeetingTime(true)}>
              <GIcon name="videoCall" size={18} color={Brand.Cyan} /><span style={{ fontSize: 13 }}>{t('GOOGLE MEET')}</span>
            </button>
          </div>
          <div style={{ color: Brand.Muted, fontSize: 11 }}>
            {t('Opens your email or Google Calendar already filled in with your name, the event and the products they liked. You can edit before sending.')}
          </div>
          <div className="c-chips">
            {LeadStatus.all.map(st => (
              <button key={st} className={'c-chip' + (status === st ? ' sel' : '')} style={{ ['--chip' as string]: statusColor(st), fontSize: 12 }} onClick={() => setStatus(st)}>{t(st)}</button>
            ))}
          </div>
          {status2 && <div style={{ color: '#D3D3D3', fontSize: 12, whiteSpace: 'pre-line' }}>{status2}</div>}

          <button className="btn btn-block" style={{ ['--bg-c' as string]: LeadColor, height: 54, margin: '12px 0' }} onClick={save}>
            <span style={{ fontSize: 16 }}>{t('SAVE LEAD')}</span>
          </button>
          <div style={{ height: 30 }} />
        </div>
      </div>

      {pickMeetingTime && (
        <Dialog onClose={() => setPickMeetingTime(false)}>
          <div className="col" style={{ gap: 8, minWidth: 260 }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{t('Schedule a Google Meet')}</div>
            <div style={{ fontSize: 13 }}>{t('Pick a starting time. You can change the date and time in Google Calendar.')}</div>
            {([[1, t('Next business day, 10 AM')], [3, t('In 3 days, 10 AM')], [7, t('Next week, 10 AM')]] as [number, string][]).map(([days, label]) => (
              <button key={days} className="btn btn-outline btn-block" style={{ letterSpacing: 0 }}
                onClick={() => { setPickMeetingTime(false); scheduleMeeting(FollowUp.suggestedTime(days)) }}>{label}</button>
            ))}
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-text" style={{ color: Brand.Cyan }} onClick={() => setPickMeetingTime(false)}>{t('Cancel')}</button>
            </div>
          </div>
        </Dialog>
      )}

      {scanning && <LeadScanOverlay onResult={d => { applyScan(d); setScanning(false); vibrateShort() }} onClose={() => setScanning(false)} />}

      {confirmDelete && existing && (
        <Dialog onClose={() => setConfirmDelete(false)}>
          <div className="col" style={{ gap: 12, minWidth: 260 }}>
            <div style={{ fontSize: 22 }}>{t('Delete this lead?')}</div>
            <div>{existing.name}</div>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-text" style={{ color: Brand.Cyan }} onClick={() => setConfirmDelete(false)}>{t('Cancel')}</button>
              <button className="btn btn-text" style={{ color: Brand.Red }} onClick={() => { LeadStore.remove(existing); setConfirmDelete(false); onDone() }}>{t('Delete')}</button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}

// ======================================================================= scan overlay

// Browser replacements for ML Kit: the BarcodeDetector API (jsQR as a fallback for QR codes) for codes, and
// tesseract.js (WASM) for printed text. Both helper libraries are bundled but loaded on demand (dynamic import),
// so they are only fetched when the scanner opens; if they cannot be loaded the camera still works for the codes the browser can read.

interface DetectedCode { rawValue?: string }
interface BarcodeDetectorLike { detect(source: CanvasImageSource): Promise<DetectedCode[]> }
type JsQr = (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null

/**
 * Full-screen camera that reads an event badge (QR + printed name, company, city), a business card
 * or a contact QR code, shows what it found, and hands it back to the lead form.
 */
export function LeadScanOverlay({ onResult, onClose }: { onResult: (d: LeadDraft) => void; onClose: () => void }) {
  useLang()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [permission, setPermission] = useState<'asking' | 'granted' | 'denied'>('asking')
  const [fromCode, setFromCode] = useState<LeadDraft | null>(null)
  const [fromText, setFromText] = useState<LeadDraft | null>(null)
  const fromCodeRef = useRef<LeadDraft | null>(null)
  fromCodeRef.current = fromCode
  const draft = mergeDrafts(fromCode ?? {}, fromText)

  // The browser Back button closes the scanner first
  useBackHandler(true, onClose)

  useEffect(() => {
    let cancelled = false
    let stream: MediaStream | null = null
    let timer = 0
    let worker: { recognize: (img: HTMLCanvasElement) => Promise<{ data: { lines?: { text: string; confidence: number; bbox: { y0: number; y1: number } }[] } }>; terminate: () => Promise<unknown> } | null = null

    const onCode = (raw: string) => {
      const d = LeadParser.parseCode(raw)
      if (d && !draftIsEmpty(d)) setFromCode(prev => mergeDrafts(d, prev))
    }
    const onLines = (lines: OcrLine[]) => {
      const d = LeadParser.fromFreeText(lines, fromCodeRef.current?.source === 'Badge' ? 'Badge' : 'Business card')
      if (!draftIsEmpty(d)) setFromText(d)
    }

    const grab = (maxW: number) => {
      const v = videoRef.current
      if (!v || v.readyState < 2 || v.videoWidth === 0) return null
      const scale = Math.min(1, maxW / v.videoWidth)
      const c = document.createElement('canvas')
      c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale)
      c.getContext('2d', { willReadFrequently: true })!.drawImage(v, 0, 0, c.width, c.height)
      return c
    }

    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
        })
      } catch { if (!cancelled) setPermission('denied'); return }
      if (cancelled) { stream.getTracks().forEach(tr => tr.stop()); return }
      setPermission('granted')
      const v = videoRef.current
      if (v) { v.srcObject = stream; v.play().catch(() => { /* autoplay blocked: the muted attribute normally prevents this */ }) }

      // ---- codes: QR, PDF417, Data Matrix, Aztec, 1-D ----
      const BD = (window as unknown as { BarcodeDetector?: new () => BarcodeDetectorLike }).BarcodeDetector
      let jsqr: JsQr | null = null
      let detector: BarcodeDetectorLike | null = null
      if (BD) { try { detector = new BD() } catch { detector = null } }
      if (!detector) {
        try { jsqr = (await import('jsqr')).default as unknown as JsQr } catch { jsqr = null }
      }
      const scanCodes = async () => {
        if (cancelled) return
        try {
          const vv = videoRef.current
          if (vv && vv.readyState >= 2) {
            if (detector) {
              const found = await detector.detect(vv)
              const raw = found.map(f => f.rawValue).find((x): x is string => !!x)
              if (raw) onCode(raw)
            } else if (jsqr) {
              const c = grab(960)
              if (c) {
                const img = c.getContext('2d')!.getImageData(0, 0, c.width, c.height)
                const r = jsqr(img.data, c.width, c.height)
                if (r?.data) onCode(r.data)
              }
            }
          }
        } catch { /* a bad frame: try the next one */ }
        timer = window.setTimeout(scanCodes, 300)
      }
      void scanCodes()

      // ---- printed text (badge / card) ----
      try {
        const mod = await import('tesseract.js') as unknown as { createWorker?: (lang: string) => Promise<typeof worker>; default?: { createWorker: (lang: string) => Promise<typeof worker> } }
        const create = mod.createWorker ?? mod.default?.createWorker
        if (!create) return
        worker = await create('eng')
        const readText = async () => {
          if (cancelled || !worker) return
          try {
            const c = grab(1280)
            if (c) {
              const { data } = await worker.recognize(c)
              const lines: OcrLine[] = (data.lines ?? [])
                .filter(l => l.confidence >= 60 && l.text.trim().length >= 2)
                .map(l => ({ text: l.text.trim(), height: l.bbox.y1 - l.bbox.y0, top: l.bbox.y0 }))
              if (lines.length > 0 && !cancelled) onLines(lines)
            }
          } catch { /* ignore this frame */ }
          if (!cancelled) window.setTimeout(readText, 400)
        }
        void readText()
      } catch { /* text reading unavailable (offline): codes still work */ }
    })()

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      stream?.getTracks().forEach(tk => tk.stop())
      void worker?.terminate()
    }
  }, [])

  const fields: [string, string | null | undefined][] = [
    [t('Name'), draft.name], [t('Title'), draft.title], [t('Shop'), draft.shop], [t('Phone'), draft.phone],
    [t('Email'), draft.email], [t('City'), draft.city], [t('Website'), draft.website], [t('Badge #'), draft.badgeId],
  ]
  const empty = draftIsEmpty(draft)

  return createPortal(
    <div className="lead-scan">
      <ScreenHeader title={t('SCAN BADGE / CARD / QR')} subtitle={t('HOLD STEADY, FILL THE FRAME')} onBack={onClose} />
      {/* Buttons sit right under the title so they can never be covered */}
      <div className="row" style={{ padding: '4px 16px 12px', gap: 12 }}>
        <button className="btn btn-outline" style={{ flex: 1, height: 52, letterSpacing: 0 }} onClick={() => { setFromCode(null); setFromText(null) }}>{t('CLEAR')}</button>
        <button className="btn" style={{ flex: 2, height: 52, ['--bg-c' as string]: LeadColor }} disabled={empty} onClick={() => onResult(draft)}>{t('FILL THE FORM')}</button>
      </div>
      <div className="lead-scan-cam">
        {permission === 'denied' ? (
          <div className="center" style={{ position: 'absolute', inset: 0, padding: 32, color: '#fff', textAlign: 'center' }}>
            {t('Camera access is needed to scan badges and cards.')}
          </div>
        ) : (
          <>
            <video ref={videoRef} playsInline muted autoPlay />
            <div className="lead-scan-found">
              {empty ? <div style={{ color: Brand.Muted, fontSize: 13 }}>{t('Point at the badge or card…')}</div> : (
                fields.filter(([, v]) => !!v && v.trim() !== '').map(([k, v]) => (
                  <div key={k} className="row" style={{ alignItems: 'flex-start' }}>
                    <span style={{ color: Brand.Muted, fontSize: 12, width: 70, flex: '0 0 auto' }}>{k}</span>
                    <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>{v}</span>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
