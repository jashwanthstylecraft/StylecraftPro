import { describe, expect, it } from 'vitest'
import { parseCode } from '../src/data/leadparser'

describe('lead QR codes', () => {
  it('reads a vCard', () => {
    const d = parseCode('BEGIN:VCARD\nVERSION:3.0\nFN:Jane Doe\nORG:Fade Lab\nTEL:555-0100\nEMAIL:jane@fadelab.com\nEND:VCARD')
    expect(d).toMatchObject({ name: 'Jane Doe', email: 'jane@fadelab.com' })
    expect(d?.shop).toBe('Fade Lab')
  })
  it('reads mailto and tel links', () => {
    expect(parseCode('mailto:a@b.com?subject=hi')).toMatchObject({ email: 'a@b.com' })
    expect(parseCode('tel:+15550100')).toMatchObject({ phone: '+15550100' })
  })
  it('treats a web address as the website', () => {
    expect(parseCode('https://example.com')).toMatchObject({ website: 'https://example.com' })
  })
  it('ignores empty codes', () => {
    expect(parseCode('   ')).toBeNull()
  })
})
