// One-off: converts the big PNG photos in public/img to WebP (much smaller, same look).
// Run: node scripts/optimize-images.mjs   (originals are deleted only after the WebP is written)
import sharp from 'sharp'
import { readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const dir = 'public/img'
const MIN_BYTES = 100 * 1024   // leave small icons as PNG
const MAX_SIDE = 1100          // longest side in px: plenty for a phone or desktop card

for (const f of readdirSync(dir)) {
  if (!f.endsWith('.png')) continue
  const src = join(dir, f)
  const before = statSync(src).size
  if (before < MIN_BYTES) continue
  const out = src.replace(/\.png$/, '.webp')
  await sharp(src).resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(out)
  const after = statSync(out).size
  unlinkSync(src)
  console.log(`${f}: ${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB`)
}
