/**
 * Pure DSP for the Speed Analyzer (AudioAnalyzer.kt + FftAnalyzer.kt).
 * No browser APIs here, so it can be unit-tested in Node.
 *
 * The Kotlin code works on 16-bit PCM and its thresholds (rms < 150, power < 1e6) assume that scale.
 * Web Audio gives floats in -1..1, so callers convert with `toPcm16Scale()` before analysing.
 * The sample rate is a parameter (the browser picks it, usually 44.1 or 48 kHz).
 */

export const FRAME_SIZE = 8192

export interface ClipperResult { frequency: number; quality: number; rms: number }

/** Float samples (-1..1) -> the Int16 value range the thresholds were tuned for. */
export function toPcm16Scale(input: ArrayLike<number>): Float64Array {
  const out = new Float64Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const v = Math.max(-1, Math.min(1, input[i]))
    out[i] = Math.round(v * 32767)
  }
  return out
}

function goertzelPower(x: Float64Array, targetHz: number, sampleRate: number): number {
  const omega = (2 * Math.PI * targetHz) / sampleRate
  const coeff = 2 * Math.cos(omega)
  let s0: number
  let s1 = 0
  let s2 = 0
  for (let i = 0; i < x.length; i++) {
    s0 = x[i] + coeff * s1 - s2
    s2 = s1
    s1 = s0
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2
}

/** AudioAnalyzer.estimateFrequency: Goertzel scan 60..350 Hz (3,600..21,000 RPM) with a Hann window. */
export function estimateFrequency(samples: ArrayLike<number>, sampleRate = 44100): ClipperResult {
  const n = samples.length
  let mean = 0
  for (let i = 0; i < n; i++) mean += samples[i]
  mean /= n

  const x = new Float64Array(n)
  let rms = 0
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))
    const v = (samples[i] - mean) * w
    x[i] = v
    rms += v * v
  }
  rms = Math.sqrt(rms / n)

  // Threshold for noise floor
  if (rms < 150) return { frequency: 0, quality: 0, rms }

  let bestFreq = 0
  let bestPower = 0
  let totalPower = 0
  for (let f = 60; f <= 350; f++) {
    const p = goertzelPower(x, f, sampleRate)
    totalPower += p
    // Bias towards typical clipper ranges (80-250 Hz)
    const weighted = f >= 80 && f <= 250 ? p * 1.2 : p
    if (weighted > bestPower) { bestPower = weighted; bestFreq = f }
  }

  // Refine detection around the peak
  let refinedFreq = bestFreq
  let refinedPower = bestPower
  const start = Math.max(60, bestFreq - 1)
  const end = Math.min(350, bestFreq + 1)
  for (let f = start; f <= end; f += 0.2) {
    const p = goertzelPower(x, f, sampleRate)
    if (p > refinedPower) { refinedPower = p; refinedFreq = f }
  }

  const quality = totalPower > 0 ? Math.min(1, Math.max(0, bestPower / totalPower)) : 0
  return { frequency: refinedFreq, quality, rms }
}

/** In-place radix-2 FFT (FftAnalyzer.fft). */
function fft(real: Float64Array, imag: Float64Array) {
  const n = real.length
  if (n <= 1) return

  let i = 0
  let j = 1
  while (j < n - 1) {
    let k = n >> 1
    while (k <= i) { i -= k; k >>= 1 }
    i += k
    if (j < i) {
      const tr = real[j]; real[j] = real[i]; real[i] = tr
      const ti = imag[j]; imag[j] = imag[i]; imag[i] = ti
    }
    j++
  }

  for (let m = 2; m <= n; m <<= 1) {
    const angle = (-2 * Math.PI) / m
    const wAlpha = Math.cos(angle)
    const wBeta = Math.sin(angle)
    for (let i2 = 0; i2 < n; i2 += m) {
      let wr = 1
      let wi = 0
      for (let j2 = 0; j2 < m / 2; j2++) {
        const k = i2 + j2 + m / 2
        const tr = wr * real[k] - wi * imag[k]
        const ti = wr * imag[k] + wi * real[k]
        real[k] = real[i2 + j2] - tr
        imag[k] = imag[i2 + j2] - ti
        real[i2 + j2] += tr
        imag[i2 + j2] += ti
        const nextWr = wr * wAlpha - wi * wBeta
        wi = wr * wBeta + wi * wAlpha
        wr = nextWr
      }
    }
  }
}

/** FftAnalyzer.findPrincipalFrequency: returns [frequencyHz, quality 0..1]; [0, 0] when nothing usable. */
export function findPrincipalFrequency(samples: ArrayLike<number>, sampleRate = 48000): [number, number] {
  const n = samples.length
  const m = Math.pow(2, Math.ceil(Math.log2(n)))
  const real = new Float64Array(m)
  const imag = new Float64Array(m)

  for (let i = 0; i < n; i++) {
    const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)))
    real[i] = samples[i] * window
  }

  fft(real, imag)

  let maxPower = -1
  let maxBin = -1
  // Positive half only; ignore everything under 200 Hz (mechanical vibration)
  const startBin = Math.trunc((200 * m) / sampleRate)
  const endBin = m / 2

  for (let i = startBin; i < endBin; i++) {
    const power = real[i] * real[i] + imag[i] * imag[i]
    if (power > maxPower) { maxPower = power; maxBin = i }
  }

  if (maxBin === -1 || maxPower < 1e6) return [0, 0]

  // Parabolic interpolation for better precision
  const alpha = maxBin > 0 ? real[maxBin - 1] ** 2 + imag[maxBin - 1] ** 2 : 0
  const beta = maxPower
  const gamma = maxBin < endBin - 1 ? real[maxBin + 1] ** 2 + imag[maxBin + 1] ** 2 : 0

  const p = 2 * beta - alpha - gamma !== 0 ? (0.5 * (alpha - gamma)) / (alpha - 2 * beta + gamma) : 0
  const preciseBin = maxBin + p
  const freq = (preciseBin * sampleRate) / m

  // Signal quality estimate: peak height vs average
  let totalPower = 0
  for (let i = startBin; i < endBin; i++) totalPower += real[i] * real[i] + imag[i] * imag[i]
  const quality = Math.min(100, Math.max(0, maxPower / (totalPower / (endBin - startBin)))) / 100

  return [freq, quality]
}

/** Median of the last few readings (UnifiedViewModel.smooth), so the number doesn't jump around. */
export class MedianSmoother {
  private recent: number[] = []
  constructor(private size = 5) {}
  clear() { this.recent = [] }
  push(value: number): number {
    this.recent.push(value)
    while (this.recent.length > this.size) this.recent.shift()
    return [...this.recent].sort((a, b) => a - b)[Math.trunc(this.recent.length / 2)]
  }
}

export type ClipperHealth = 'Waiting' | 'CLEAN SIGNAL' | 'GOOD SIGNAL' | 'WEAK SIGNAL' | 'TOO NOISY'
export type ClipperQuality = 'None' | 'Strong' | 'Medium' | 'Weak'

/** processClipperData: label strings for a quality value. */
export function clipperLabels(quality: number): { health: ClipperHealth; strength: ClipperQuality } {
  const strength: ClipperQuality = quality > 0.15 ? 'Strong' : quality > 0.06 ? 'Medium' : 'Weak'
  const health: ClipperHealth = quality > 0.15 ? 'CLEAN SIGNAL' : quality > 0.08 ? 'GOOD SIGNAL' : quality > 0.04 ? 'WEAK SIGNAL' : 'TOO NOISY'
  return { health, strength }
}

/** Frequency (Hz) of the clipper motor -> RPM, as the Kotlin did: (hz * 60) truncated. */
export const clipperRpm = (hz: number) => Math.trunc(hz * 60)
/** Dryer: fan blade frequency -> RPM. */
export const dryerRpm = (hz: number, bladeCount: number) => Math.trunc((hz * 60) / bladeCount)
