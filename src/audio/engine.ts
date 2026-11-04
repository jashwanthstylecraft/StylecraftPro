import { Store } from '../data/store'
import {
  FRAME_SIZE, MedianSmoother, StableTone, clipperLabels, clipperRpm, dryerRpm, estimateFrequency, findPrincipalFrequency, toPcm16Scale,
  ClipperHealth, ClipperQuality,
} from './dsp'

export type AnalyzerMode = 'CLIPPER' | 'DRYER'

/** UnifiedState (UnifiedViewModel.kt). */
export interface UnifiedState {
  mode: AnalyzerMode
  isRunning: boolean
  /** RPM */
  displayedValue: number
  status: string
  clipperHealth: ClipperHealth
  clipperQuality: ClipperQuality
  dryerBladeCount: number
  dryerSignalQuality: number
}

const INITIAL: UnifiedState = {
  mode: 'CLIPPER', isRunning: false, displayedValue: 0, status: 'READY',
  clipperHealth: 'Waiting', clipperQuality: 'None', dryerBladeCount: 13, dryerSignalQuality: 0,
}

/** Receives mic audio on the audio thread and forwards the raw blocks (128 samples) to the page. */
const WORKLET_SOURCE = `
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch && ch.length) this.port.postMessage(ch.slice(0))
    return true
  }
}
registerProcessor('stylecraft-capture', CaptureProcessor)
`

const MIC_CONSTRAINTS: MediaTrackConstraints = {
  // Raw signal: the Android app prefers the UNPROCESSED source for the same reason.
  echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1,
}

interface Session {
  stream: MediaStream
  ctx: AudioContext
  stop: () => void
}

/**
 * Web version of UnifiedViewModel: owns the microphone and publishes state.
 * One shared instance (`analyzer`), like the Activity-scoped view model.
 */
class AnalyzerEngine {
  readonly state = new Store<UnifiedState>(INITIAL)
  /** Each start gets a new token; an old capture stops as soon as the token changes. */
  private activeToken = 0
  private session: Session | null = null
  private smoother = new MedianSmoother(5)
  /** Only a steady pitch counts as a motor (see StableTone). */
  private tone = new StableTone(4, 0.03, 0.04)

  private patch(p: Partial<UnifiedState>) { this.state.set({ ...this.state.get(), ...p }) }

  setMode(mode: AnalyzerMode) {
    this.stop()
    this.patch({ mode, displayedValue: 0, status: 'READY' })
  }

  setDryerBladeCount(count: number) {
    this.smoother.clear()
    this.patch({ dryerBladeCount: count })
  }

  toggleMeasurement() {
    if (this.state.get().isRunning) this.stop()
    else void this.start()
  }

  /** True when the browser can capture audio at all (needs HTTPS or localhost). */
  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof AudioContext !== 'undefined'
  }

  private async openSession(mode: AnalyzerMode, token: number, onFrame: (frame: Float32Array, sampleRate: number) => void): Promise<Session | 'denied' | 'unavailable' | 'cancelled'> {
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS })
    } catch (e) {
      const name = (e as DOMException)?.name
      return name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError' ? 'denied' : 'unavailable'
    }
    if (token !== this.activeToken) { stream.getTracks().forEach(t => t.stop()); return 'cancelled' }

    // Ask for the rates the Android app used (44.1 kHz clipper, 48 kHz dryer); the browser may pick another one and the DSP adapts.
    const wanted = mode === 'CLIPPER' ? 44100 : 48000
    let ctx: AudioContext
    try { ctx = new AudioContext({ sampleRate: wanted, latencyHint: 'interactive' }) } catch { ctx = new AudioContext() }
    try { await ctx.resume() } catch { /* ignore */ }
    if (token !== this.activeToken) { stream.getTracks().forEach(t => t.stop()); void ctx.close(); return 'cancelled' }

    const sampleRate = ctx.sampleRate
    const source = ctx.createMediaStreamSource(stream)

    // Collect consecutive samples into FRAME_SIZE blocks (the Kotlin loop reads 8192 at a time).
    let buf = new Float32Array(FRAME_SIZE)
    let filled = 0
    const feed = (chunk: Float32Array) => {
      let off = 0
      while (off < chunk.length) {
        const n = Math.min(chunk.length - off, FRAME_SIZE - filled)
        buf.set(chunk.subarray(off, off + n), filled)
        filled += n
        off += n
        if (filled === FRAME_SIZE) {
          const frame = buf
          buf = new Float32Array(FRAME_SIZE)
          filled = 0
          onFrame(frame, sampleRate)
        }
      }
    }

    let cleanup: () => void = () => {}
    let usedWorklet = false
    if (ctx.audioWorklet) {
      try {
        const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }))
        await ctx.audioWorklet.addModule(url)
        URL.revokeObjectURL(url)
        const node = new AudioWorkletNode(ctx, 'stylecraft-capture', { numberOfInputs: 1, numberOfOutputs: 0 })
        node.port.onmessage = e => { if (token === this.activeToken) feed(e.data as Float32Array) }
        source.connect(node)
        cleanup = () => { node.port.onmessage = null; try { source.disconnect() } catch { /* ignore */ } node.disconnect() }
        usedWorklet = true
      } catch { /* fall back below */ }
    }
    if (!usedWorklet) {
      // Older browsers: ScriptProcessor (deprecated but universal). Must be connected to the destination to run; output stays silent.
      const proc = ctx.createScriptProcessor(4096, 1, 1)
      proc.onaudioprocess = e => { if (token === this.activeToken) feed(new Float32Array(e.inputBuffer.getChannelData(0))) }
      const mute = ctx.createGain()
      mute.gain.value = 0
      source.connect(proc)
      proc.connect(mute)
      mute.connect(ctx.destination)
      cleanup = () => { proc.onaudioprocess = null; try { source.disconnect() } catch { /* ignore */ } proc.disconnect(); mute.disconnect() }
    }

    return {
      stream, ctx,
      stop: () => {
        cleanup()
        stream.getTracks().forEach(t => t.stop())
        void ctx.close().catch(() => {})
      },
    }
  }

  private async start() {
    if (!AnalyzerEngine.isSupported()) {
      this.patch({ isRunning: false, status: 'MICROPHONE UNAVAILABLE' })
      return
    }
    const mode = this.state.get().mode
    const token = ++this.activeToken
    this.smoother.clear()
    this.tone.clear()
    this.patch({ isRunning: true, status: 'LISTENING...', displayedValue: 0 })

    // The analysis of one frame takes a few ms; if the page is busy, drop the oldest frames instead of lagging behind.
    let pending: { frame: Float32Array; sampleRate: number }[] = []
    let busy = false
    const drain = () => {
      if (busy) return
      busy = true
      try {
        while (pending.length && token === this.activeToken) {
          const { frame, sampleRate } = pending.shift()!
          if (pending.length > 2) pending = pending.slice(-1)
          this.process(mode, frame, sampleRate)
        }
      } finally { busy = false }
    }

    try {
      const session = await this.openSession(mode, token, (frame, sampleRate) => { pending.push({ frame, sampleRate }); drain() })
      if (session === 'cancelled') return
      if (session === 'denied' || session === 'unavailable') {
        if (token === this.activeToken) {
          this.patch({ isRunning: false, displayedValue: 0, status: session === 'denied' ? 'MICROPHONE PERMISSION NEEDED' : 'MICROPHONE UNAVAILABLE' })
        }
        return
      }
      if (token !== this.activeToken) { session.stop(); return }
      this.session = session
      // The microphone can be unplugged / revoked while listening.
      session.stream.getAudioTracks().forEach(tr => { tr.onended = () => { if (token === this.activeToken) { this.stop(); this.patch({ status: 'MICROPHONE ERROR' }) } } })
    } catch {
      if (token === this.activeToken) this.patch({ isRunning: false, status: 'MICROPHONE ERROR' })
    }
  }

  /** Safe to call any time (leaving the screen, tab hidden, ...). */
  stop() {
    this.activeToken++
    const s = this.session
    this.session = null
    s?.stop()
    if (this.state.get().isRunning) this.patch({ isRunning: false, status: 'READY', displayedValue: 0 })
  }

  private process(mode: AnalyzerMode, frame: Float32Array, sampleRate: number) {
    const samples = toPcm16Scale(frame)
    if (mode === 'CLIPPER') {
      const r = estimateFrequency(samples, sampleRate)
      this.processClipper(r.frequency, r.quality)
    } else {
      const [hz, q] = findPrincipalFrequency(samples, sampleRate)
      this.processDryer(hz, q)
    }
  }

  private processClipper(hz: number, quality: number) {
    const tone = this.tone.push(hz, quality)
    if (hz <= 0 || tone.state === 'collecting') {
      this.patch({ displayedValue: 0, clipperHealth: 'Waiting', clipperQuality: 'None' })
      return
    }
    // Sound is present but it is not one steady motor pitch (voices, music, other tools): show no number.
    if (tone.state === 'unstable') {
      this.smoother.clear()
      this.patch({ displayedValue: 0, clipperHealth: 'TOO NOISY', clipperQuality: 'Weak' })
      return
    }
    const rpm = this.smoother.push(clipperRpm(tone.hz))
    const { health, strength } = clipperLabels(quality)
    this.patch({ displayedValue: rpm, clipperHealth: health, clipperQuality: strength })
  }

  private processDryer(hz: number, quality: number) {
    const tone = this.tone.push(hz, quality)
    if (hz <= 0 || tone.state !== 'locked') {
      this.smoother.clear()
      this.patch({ displayedValue: 0, dryerSignalQuality: 0 })
      return
    }
    const rpm = this.smoother.push(dryerRpm(tone.hz, this.state.get().dryerBladeCount))
    this.patch({ displayedValue: rpm, dryerSignalQuality: quality })
  }
}

export const analyzer = new AnalyzerEngine()
