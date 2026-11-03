import { ReactNode, useEffect, useState } from 'react'

/**
 * Screen-size helpers (ui/Adaptive.kt). CSS px play the role of dp.
 *  - phone:  < 600 wide
 *  - tablet: >= 600 (tablet in portrait, desktop window)
 *  - split:  >= 720 (two columns on the product page)
 *  - wide:   >= 840 (list and detail side by side)
 */
export const Adaptive = { TABLET_DP: 600, SPLIT_DP: 720, WIDE_DP: 840 }

const width = () => (typeof window === 'undefined' ? 360 : window.innerWidth)

/** Current viewport width in CSS px (updates on resize / rotation). */
export function useScreenWidth(): number {
  const [w, setW] = useState(width)
  useEffect(() => {
    const on = () => setW(width())
    window.addEventListener('resize', on)
    window.addEventListener('orientationchange', on)
    return () => { window.removeEventListener('resize', on); window.removeEventListener('orientationchange', on) }
  }, [])
  return w
}
export const useIsTablet = () => useScreenWidth() >= Adaptive.TABLET_DP
export const useIsSplit = () => useScreenWidth() >= Adaptive.SPLIT_DP
export const useIsWide = () => useScreenWidth() >= Adaptive.WIDE_DP

/**
 * Keeps forms and text screens at a comfortable reading width on tablets / desktop (centered),
 * and does nothing on phones.
 */
export function ReadableWidth({ maxWidth = 760, children }: { maxWidth?: number; children: ReactNode }) {
  return <div className="readable" style={{ maxWidth }}>{children}</div>
}
