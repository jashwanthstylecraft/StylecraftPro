import { Product, isIron } from './product'
import { money } from './format'

/**
 * "Why it wins" lines for a sales conversation: every published spec where [ours] beats [theirs].
 * Only uses numbers both brands publish, so every line can be backed up.
 */
export function talkingPoints(ours: Product, theirs: Product, spanish = false): string[] {
  const out: string[] = []
  const l = (en: string, es: string) => spanish ? es : en
  const mins = (m: number) => m % 60 === 0 ? `${m / 60} h` : m > 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`
  const grp = (n: number) => n.toLocaleString('en-US')
  const int = (n: number) => String(Math.trunc(n))

  const oN = ours.noiseDb, tN = theirs.noiseDb
  if (oN != null && tN != null && oN < tN) out.push(l(`Quieter: ${int(oN)} dB vs ${int(tN)} dB`, `Más silenciosa: ${int(oN)} dB vs ${int(tN)} dB`))

  const oR = ours.runtimeMin, tR = theirs.runtimeMin
  if (oR != null && tR != null && oR > tR) out.push(l(`Longer runtime: ${mins(oR)} vs ${mins(tR)}`, `Mayor autonomía: ${mins(oR)} vs ${mins(tR)}`))

  const oC = ours.chargeMin, tC = theirs.chargeMin
  if (oC != null && tC != null && oC < tC) out.push(l(`Charges faster: ${mins(oC)} vs ${mins(tC)}`, `Carga más rápida: ${mins(oC)} vs ${mins(tC)}`))

  const oW = ours.weightG, tW = theirs.weightG
  if (oW != null && tW != null && oW < tW) out.push(l(`Lighter in the hand: ${oW} g vs ${tW} g`, `Más ligera: ${oW} g vs ${tW} g`))

  const oS = ours.rpm, tS = theirs.rpm
  if (oS != null && tS != null && oS > tS) out.push(l(`Faster motor: ${grp(oS)} vs ${grp(tS)}`, `Motor más rápido: ${grp(oS)} vs ${grp(tS)}`))

  const oP = ours.priceUsd, tP = theirs.priceUsd
  if (oP != null && tP != null && oP < tP) out.push(l(`Better value: ${money(oP)} vs ${money(tP)}`, `Mejor precio: ${money(oP)} vs ${money(tP)}`))

  const oPort = ours.chargingPort?.toLowerCase() ?? ''
  const tPort = theirs.chargingPort?.toLowerCase() ?? null
  if (oPort.includes('usb-c') && tPort != null && !tPort.includes('usb-c')) {
    out.push(l(`USB-C charging (theirs: ${theirs.chargingPort})`, `Carga USB-C (la otra: ${theirs.chargingPort})`))
  }
  if (tPort != null && tPort.includes('corded') && !oPort.includes('corded') && ours.category !== 'DRYER' && !isIron(ours.category)) {
    out.push(l('Cordless freedom vs a corded tool', 'Inalámbrica vs una herramienta con cable'))
  }

  const firstInt = (s: string | null) => { const m = s ? /\d+/.exec(s) : null; return m ? parseInt(m[0], 10) : null }
  const oG = firstInt(ours.guards), tG = firstInt(theirs.guards)
  if (oG != null && tG != null && oG > tG) out.push(l(`More guards included: ${oG} vs ${tG}`, `Más peines incluidos: ${oG} vs ${tG}`))

  if (isIron(ours.category)) {
    // Stylecraft lab test, Feb 2026: Stay-Temp spring curling irons vs Hot Tools, time to max heat
    if (ours.id.startsWith('stylecraft-stay-temp-black-gold-curling-iron') && theirs.category === 'CURLING_IRON' && theirs.brand.toLowerCase() === 'hot tools') {
      out.push(l('Heats up faster in our lab test: 200 s vs 270 s (3/4") and 180 s vs 280 s (1-1/2") against Hot Tools',
        'Calienta más rápido en nuestra prueba: 200 s vs 270 s (3/4") y 180 s vs 280 s (1-1/2") contra Hot Tools'))
    }
    const oT = ours.maxTempF, tT = theirs.maxTempF
    if (oT != null && tT != null && oT > tT) out.push(l(`Hotter max heat: ${oT} °F vs ${tT} °F`, `Más calor máximo: ${oT} °F vs ${tT} °F`))
    const oCord = ours.cordFt, tCord = theirs.cordFt
    if (oCord != null && tCord != null && oCord > tCord) out.push(l(`Longer cord: ${int(oCord)} ft vs ${int(tCord)} ft`, `Cable más largo: ${int(oCord)} ft vs ${int(tCord)} ft`))
    const oH = ours.heatUpSec, tH = theirs.heatUpSec
    if (oH != null && tH != null && oH < tH) out.push(l(`Heats up faster: ${oH} s vs ${tH} s`, `Calienta más rápido: ${oH} s vs ${tH} s`))
    if (ours.dualVoltage === true && theirs.dualVoltage === false) out.push(l('Dual voltage for travel', 'Doble voltaje para viajar'))
    const oCordless = ours.chargingPort?.toLowerCase().includes('cordless') === true
    const tCordless = theirs.chargingPort?.toLowerCase().includes('cordless') === true
    if (oCordless && !tCordless) out.push(l('Cordless freedom vs a corded iron', 'Inalámbrica vs una plancha con cable'))
    const oIon = ours.ions?.toLowerCase(), tIon = theirs.ions?.toLowerCase()
    if ((oIon === 'yes' || oIon === 'true') && (tIon == null || tIon === 'no' || tIon === 'false')) out.push(l('Ionic plates/barrel', 'Placas/barril iónicos'))
  }
  if (ours.category === 'DRYER') {
    const oI = ours.ions?.toLowerCase(), tI = theirs.ions?.toLowerCase()
    if (oI != null && !oI.includes('none') && tI != null && tI.includes('none')) out.push(l(`Ionic technology (${ours.ions})`, `Tecnología iónica (${ours.ions})`))
  }
  return out
}

export const TalkingPoints = { forProduct: talkingPoints }
