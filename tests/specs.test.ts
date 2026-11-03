import { describe, expect, it } from 'vitest'
import { checkClaim, speedClaim, specRows } from '../src/data/specs'
import { Product, productFromJson } from '../src/data/product'

const make = (o: Record<string, unknown>): Product =>
  productFromJson({ id: 'x', name: 'Test', brand: 'Stylecraft', category: 'Clipper', ...o })!

describe('speed claim', () => {
  it('Stylecraft vector motors claim the 8,500-11,500 RPM range', () => {
    expect(speedClaim(make({ motorType: 'IN2 Vector', rpm: 11500 }))).toEqual({ low: 8500, high: 11500 })
  })
  it('other products use their single published RPM', () => {
    expect(speedClaim(make({ brand: 'Andis', motorType: 'Rotary', rpm: 7000 }))).toEqual({ low: 7000, high: 7000 })
  })
  it('no RPM, no claim', () => {
    expect(speedClaim(make({ brand: 'Andis' }))).toBeNull()
  })
})

describe('checking a measured speed', () => {
  const range = { low: 8500, high: 11500 }
  it('inside the range matches with 0% difference', () => {
    expect(checkClaim(range, 10000)).toMatchObject({ matches: true, diffPct: 0 })
  })
  it('below the range does not match', () => {
    expect(checkClaim(range, 8000)).toMatchObject({ matches: false, label: 'Below the claim' })
  })
  it('a single number allows 5% below', () => {
    expect(checkClaim({ low: 7000, high: 7000 }, 6700).matches).toBe(true)
    expect(checkClaim({ low: 7000, high: 7000 }, 6500).matches).toBe(false)
  })
})

describe('spec sheet', () => {
  it('formats runtime and weight like the app', () => {
    const rows = specRows(make({ runtimeMin: 120, weightG: 258, chargeMin: 90 }))
    const get = (l: string) => rows.find(r => r.label === l)?.text
    expect(get('Runtime')).toBe('2 h (120 min)')
    expect(get('Weight')).toBe('258 g (9.1 oz)')
    expect(get('Charge time')).toBe('1 h 30 min')
  })
  it('hides Power when it is not published', () => {
    expect(specRows(make({})).some(r => r.label === 'Power')).toBe(false)
  })
})
