import { CSSProperties, ReactNode, useEffect, useRef, useState } from 'react'

/**
 * ui/Motion.kt
 *  - staggeredEnter(index)  ->  className="stagger" style={staggerStyle(index)}   (CSS in styles.css)
 *  - bounceClick            ->  className="bounce" (springy press feedback)
 *  - AnimatedGlowIcon       ->  <AnimatedGlowIcon>...</AnimatedGlowIcon>
 */
export const staggerStyle = (index: number, stepMs = 70, risePx = 28): CSSProperties =>
  ({ ['--i' as string]: Math.min(Math.max(index, 0), 10), animationDelay: `${Math.min(Math.max(index, 0), 10) * stepMs}ms`, ['--rise' as string]: `${risePx}px` })

/** Category / tool icon that pops in (fade + scale + small spin), then keeps a gentle float and a breathing glow behind it. */
export function AnimatedGlowIcon({ tint, size = 56, iconSize = 30, delayMs = 0, children }: {
  tint: string; size?: number; iconSize?: number; delayMs?: number; children: ReactNode
}) {
  return (
    <div className="glow-icon" style={{ width: size, height: size }}>
      <div className="halo" style={{ background: `radial-gradient(circle, ${tint} 0%, transparent 62%)`, animationDelay: `${delayMs}ms` }} />
      <div className="glyph" style={{ width: iconSize, height: iconSize, animationDelay: `${delayMs}ms, 0ms`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </div>
    </div>
  )
}

/** Animates a number toward its target (animateFloatAsState with tween(durationMs)). */
export function useAnimatedNumber(target: number, durationMs = 300): number {
  const [value, setValue] = useState(target)
  const from = useRef(target)
  const raf = useRef(0)
  useEffect(() => {
    const start = performance.now()
    const begin = from.current
    cancelAnimationFrame(raf.current)
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs)
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2
      const v = begin + (target - begin) * e
      from.current = v
      setValue(v)
      if (p < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [target, durationMs])
  return value
}
