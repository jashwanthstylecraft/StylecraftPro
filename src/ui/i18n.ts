import { AppPrefs } from '../data/prefs'
import { useStore } from '../data/store'
import { SPANISH } from './spanish'
import { SPANISH_EXTRA } from './spanishExtra'

/**
 * English / Spanish. Text in the code stays in English; t("...") looks up the Spanish version
 * when Spanish is selected in Settings. Missing translations simply show the English text.
 * To add or fix a translation, edit spanish.ts (generated from SpanishStrings.kt; now edit it by hand).
 *
 * `t()` reads the current language directly (like Kotlin's tr()). The app root subscribes to the language,
 * so every screen re-renders when it changes. In a React.memo component call `useLang()` once so it also re-renders.
 */
export function t(english: string): string {
  return AppPrefs.language.get() === 'es' ? SPANISH[english] ?? SPANISH_EXTRA[english] ?? english : english
}
/** Same as t() - kept so ported code can keep using the Kotlin names. */
export const tr = t

/** Subscribes the component to language changes and returns "en" or "es". */
export function useLang(): string { return useStore(AppPrefs.language) }
export const isSpanish = () => AppPrefs.language.get() === 'es'
