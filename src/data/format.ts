/** Number / date formatting that matches the Android app (Locale.US). */
export const nf = (n: number) => Math.trunc(n).toLocaleString('en-US')
export const fixed = (n: number, d: number) => n.toFixed(d)
export const money = (v: number) => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pad = (n: number) => String(n).padStart(2, '0')
/** yyyy-MM-dd HH:mm in local time */
export const fmtDateTime = (ts: number) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
/** yyyy-MM-dd in local time */
export const fmtDate = (ts: number) => fmtDateTime(ts).slice(0, 10)
export const digitsOnly = (s: string) => s.replace(/\D/g, '')
export const csvQuote = (s: string | null | undefined) => '"' + (s ?? '').replace(/"/g, '""') + '"'
export const uuid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
  ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16) })
