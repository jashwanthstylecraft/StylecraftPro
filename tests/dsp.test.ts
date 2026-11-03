import { describe, expect, it } from 'vitest'
import { FRAME_SIZE, MedianSmoother, clipperLabels, clipperRpm, dryerRpm, estimateFrequency, findPrincipalFrequency, toPcm16Scale } from '../src/audio/dsp'

// Synthetic sound: a sine wave (optionally with harmonics and noise) as one analysis frame.
function tone(hz: number, sampleRate: number, amp: number, noiseAmp = 0) {
  let s = 7
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 - 0.5 }
  const f = new Float32Array(FRAME_SIZE)
  for (let i = 0; i < FRAME_SIZE; i++) f[i] = amp * Math.sin(2 * Math.PI * hz * i / sampleRate) + noiseAmp * rand()
  return toPcm16Scale(f)
}

describe('clipper speed (Goertzel)', () => {
  for (const sr of [44100, 48000]) {
    for (const hz of [100, 125, 150, 200, 250]) {
      it(`${hz} Hz at ${sr} Hz sampling gives ${hz * 60} RPM (within 1%)`, () => {
        const rpm = clipperRpm(estimateFrequency(tone(hz, sr, 0.3, 0.02), sr).frequency)
        expect(Math.abs(rpm - hz * 60)).toBeLessThanOrEqual(hz * 60 * 0.01)
      })
    }
  }
  it('reports nothing for silence', () => {
    expect(estimateFrequency(tone(150, 44100, 0.0005), 44100).frequency).toBe(0)
  })
})

describe('dryer speed (FFT)', () => {
  for (const blades of [7, 11, 13]) {
    for (const rpm of [20000, 40000, 60000]) {
      it(`${rpm} RPM with ${blades} blades`, () => {
        const hz = (rpm / 60) * blades
        const [freq] = findPrincipalFrequency(tone(hz, 48000, 0.3), 48000)
        expect(Math.abs(dryerRpm(freq, blades) - rpm)).toBeLessThanOrEqual(rpm * 0.005)
      })
    }
  }
})

describe('smoothing and labels', () => {
  it('uses the median of the last 5 readings', () => {
    const m = new MedianSmoother()
    let out = 0
    for (const v of [100, 100, 900, 100, 100]) out = m.push(v)
    expect(out).toBe(100)
  })
  it('labels signal quality', () => {
    expect(clipperLabels(0.2).health).toBe('CLEAN SIGNAL')
    expect(clipperLabels(0.01).health).toBe('TOO NOISY')
  })
})
