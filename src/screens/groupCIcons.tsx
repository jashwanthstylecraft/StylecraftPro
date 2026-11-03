import type { CSSProperties } from 'react'
import { Icon, IconName } from '../ui/icons'

/** Material icons used by the group C screens that ui/icons.tsx does not have yet (24x24 paths). */
const EXTRA = {
  cloudUpload: 'M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z',
  personAdd: 'M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  videoCall: 'M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z',
  layers: 'M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z',
  checkroom: 'M21.6 18.2L13 11.75v-.91c1.65-.49 2.8-2.17 2.43-4.05-.26-1.31-1.3-2.4-2.61-2.7-2.35-.54-4.43 1.23-4.43 3.46h2c0-.75.64-1.34 1.4-1.24.62.08 1.12.57 1.2 1.19.1.74-.4 1.37-1.1 1.55-.64.17-1.1.74-1.1 1.4v1.15L2.4 18.2c-.77.58-.36 1.8.6 1.8h18c.96 0 1.37-1.22.6-1.8zM6 18l6-4.5 6 4.5H6z',
} as const

export type ExtraIconName = keyof typeof EXTRA

/** `<GIcon name=... />` works for both the shared icon set and the extras above. */
export function GIcon({ name, size = 24, color, style }: { name: IconName | ExtraIconName; size?: number; color?: string; style?: CSSProperties }) {
  if (name in EXTRA) {
    return (
      <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ color, ...style }}>
        <path d={EXTRA[name as ExtraIconName]} />
      </svg>
    )
  }
  return <Icon name={name as IconName} size={size} color={color} style={style} />
}
