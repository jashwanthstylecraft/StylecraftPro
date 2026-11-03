import { assetUrl } from '../data/repository'

/** Opening animation: the Stylecraft wordmark fades in while a scanner line sweeps across it (IntroOverlay.kt). */
export function IntroOverlay({ leaving = false }: { leaving?: boolean }) {
  return (
    <div className={'intro' + (leaving ? ' leaving' : '')}>
      <div className="col" style={{ alignItems: 'center', width: '100%' }}>
        <div className="intro-logo-box">
          <img className="intro-logo" src={assetUrl('img/logo.png')} alt="Stylecraft" />
          <div className="intro-sweep" />
        </div>
        <div className="intro-tag">FIELD SALES SUITE</div>
      </div>
    </div>
  )
}
