import { ReactNode } from 'react'
import { ScreenHeader } from '../ui/Common'

/** Temporary body for screens that are not ported yet. Delete the usage when you port the real screen. */
export function Placeholder({ title, kotlin, onBack, children }: { title: string; kotlin: string; onBack?: (() => void) | null; children?: ReactNode }) {
  return (
    <div className="screen">
      <ScreenHeader title={title} subtitle="NOT PORTED YET" onBack={onBack ?? null} />
      <div className="scroll" style={{ padding: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 900 }}>{title}</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>Port of <b>{kotlin}</b> goes here.</div>
          {children}
        </div>
      </div>
    </div>
  )
}
