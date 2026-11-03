import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseCatalog, parseCsv } from '../src/data/product'

describe('built-in catalog', () => {
  const list = parseCatalog(readFileSync('public/data/products.json', 'utf8'))
  it('loads every product with unique ids', () => {
    expect(list.length).toBeGreaterThan(200)
    expect(new Set(list.map(p => p.id)).size).toBe(list.length)
  })
  it('covers all six categories', () => {
    expect(new Set(list.map(p => p.category)).size).toBe(6)
  })
})

describe('spreadsheet (CSV) catalog', () => {
  it('reads quotes, commas and line breaks inside cells', () => {
    expect(parseCsv('a,b\n"x, y","line1\nline2"\n')).toEqual([['a', 'b'], ['x, y', 'line1\nline2']])
  })
  it('builds a product from a row', () => {
    const csv = 'id,brand,name,category,rpm,priceUsd,features\nt1,Stylecraft,Test Clipper,Clipper,"7,200",$199.95,A | B\n'
    const [p] = parseCatalog(csv)
    expect(p).toMatchObject({ id: 't1', category: 'CLIPPER', rpm: 7200, priceUsd: 199.95, features: ['A', 'B'] })
  })
  it('skips rows without an id, name or valid category', () => {
    expect(parseCatalog('id,name,category\n,No id,Clipper\nok,Name,Spaceship\n')).toHaveLength(0)
  })
})
