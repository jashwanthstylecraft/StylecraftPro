import { describe, it, expect } from 'vitest'
import { StableTone, estimateFrequency, toPcm16Scale, FRAME_SIZE } from '../src/audio/dsp'

const SR = 44100
let seed = 7
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5 }

/** One 8192-sample frame: a motor hum at `hz` plus a little broadband noise. */
function motor(hz: number, noise = 0.05, amp = 0.3): Float32Array {
  const f = new Float32Array(FRAME_SIZE)
  for (let i = 0; i < FRAME_SIZE; i++) f[i] = amp * Math.sin(2 * Math.PI * hz * i / SR) + noise * rand()
  return f
}
const noiseFrame = (amp = 0.3): Float32Array => Float32Array.from({ length: FRAME_SIZE }, () => amp * 2 * rand())

function run(frames: Float32Array[]) {
  const gate = new StableTone()
  return frames.map(fr => { const r = estimateFrequency(toPcm16Scale(fr), SR); return gate.push(r.frequency, r.quality) })
}

describe('StableTone', () => {
  it('locks onto a steady motor hum after a short settle time', () => {
    const out = run(Array.from({ length: 8 }, () => motor(140)))
    expect(out.slice(0, 3).every(o => o.state === 'collecting')).toBe(true)
    const last = out[out.length - 1]
    expect(last.state).toBe('locked')
    expect(last.hz).toBeGreaterThan(138); expect(last.hz).toBeLessThan(142)
  })

  it('shows no reading for random noise', () => {
    const out = run(Array.from({ length: 10 }, () => noiseFrame()))
    expect(out.filter(o => o.state === 'locked')).toHaveLength(0)
  })

  it('shows no reading when the pitch keeps moving (voice / music like)', () => {
    const out = run([100, 170, 120, 220, 90, 190, 130, 240, 110, 200].map(h => motor(h)))
    expect(out.filter(o => o.state === 'locked')).toHaveLength(0)
  })

  it('drops the lock when the motor stops and noise takes over', () => {
    const out = run([...Array.from({ length: 6 }, () => motor(140)), ...Array.from({ length: 6 }, () => noiseFrame())])
    expect(out[5].state).toBe('locked')
    expect(out[out.length - 1].state).not.toBe('locked')
  })
})
