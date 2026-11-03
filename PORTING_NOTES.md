# Stylecraft Pro - web port notes

The Android project (`app/`, Gradle files, `sheets/`) is untouched. Everything for the web app lives in `web/`.

```
cd web
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc --noEmit + vite build -> web/dist  (static files, host anywhere over HTTPS)
```

Stack: Vite + React 18 + TypeScript (strict), plain CSS. No router library: `src/nav` ports the Kotlin back stack.

## Architecture

```
src/
  data/    port of app/.../data/*.kt  (no React except the small hooks at the bottom of some files)
  ui/      port of app/.../ui/*.kt + shared composables (Common, Motion, Pickers, ShareTools, HUD, gauges, intro)
  nav/     Screen union + history-synced back stack (MainProApp.kt navigation)
  screens/ one file per Kotlin screen file; most are STUBS (see "TODO(port)" comment on top)
  App.tsx  shell: boot effects, intro, login gating, screen transitions, wiring of every screen's callbacks
public/    data/*.json (assets), img/*.png (res/drawable + drawable-nodpi), manifest.webmanifest, icon-512.png
```

* **State** = tiny observable `Store<T>` (data/store.ts) = Kotlin `StateFlow`. Read in components with `useStore(store)` or
  the hooks `useProducts()`, `useAccessories()`, `useCombos()`, `useLeads()`, `useMeasurements()`, `useDocs()`, `useCerts()`,
  `usePref('language' | 'favorites' | ...)`, `useSignedIn()`. Outside React use `store.get()` / `store.set()`.
* **Persistence**: localStorage (prefs `vision_prefs:*`, leads, measurements, catalog cache, docs index) and IndexedDB
  (lead photos, downloaded documents) - the web equivalents of SharedPreferences and `filesDir`.
* **Navigation**: `Screen` is a discriminated union on `kind` (same cases and defaults as the Kotlin sealed interface). `useNav()` gives
  `{ current, stack, direction, canGoBack, push, pop, replaceTop, reset }`. Every push is a browser-history entry; the URL hash
  (`#/detail?id=...`) reflects the open screen, the browser Back/Forward buttons move through the stack, refresh/deep links re-open the screen
  (stack rebuilt as Home + screen). `useBackHandler(enabled, fn)` = Android `BackHandler` for sub-states of a screen.
  `App.tsx` already wires every screen's callbacks exactly like `MainProApp.kt`; a screen author only replaces the stub body and keeps the props.
* **i18n**: `t('English text')` / `tr(...)` return Spanish when the language pref is `es` (table in `ui/spanish.ts`, generated from
  `SpanishStrings.kt`, 426 entries; edit it by hand from now on). `<App>` re-renders on language change; inside `React.memo` components call `useLang()`.
* **Responsive**: CSS px = dp. `useScreenWidth/useIsTablet(600)/useIsSplit(720)/useIsWide(840)`, `<ReadableWidth maxWidth>` (centered column on desktop).
  The shell is `position: fixed; inset: 0` with safe-area padding; each screen is a `.screen` flex column whose body is `.scroll`.

## File map (Kotlin -> TypeScript)

| Kotlin | TypeScript |
|---|---|
| data/Product.kt (+ Csv, JSON helpers) | data/product.ts |
| data/Specs.kt | data/specs.ts (also `winnerOf` from ShareTools.kt) |
| data/AppStore.kt (AppPrefs, MeasurementStore) | data/prefs.ts, data/measurements.ts |
| data/ProductRepository.kt (+ CatalogConfig) | data/repository.ts (CatalogConfig in data/prefs.ts) |
| data/Accessory.kt | data/accessory.ts |
| data/Combo.kt (Combo, ComboRepository, Family, Families) | data/combo.ts |
| data/Docs.kt | data/docs.ts |
| data/FollowUp.kt | data/followup.ts |
| data/LeadParser.kt | data/leadparser.ts |
| data/Leads.kt | data/leads.ts |
| data/ProductMatcher.kt | data/matcher.ts |
| data/TalkingPoints.kt | data/talking.ts |
| data/TeamSync.kt | data/teamsync.ts |
| (new) | data/store.ts (Store, useStore, ls, idb), data/format.ts, data/index.ts (barrel) |
| ui/L10n.kt, ui/SpanishStrings.kt | ui/i18n.ts, ui/spanish.ts |
| ui/Common.kt | ui/Common.tsx (+ ui/icons.tsx) |
| ui/Adaptive.kt | ui/adaptive.tsx |
| ui/Motion.kt | ui/Motion.tsx + CSS classes `.stagger`, `.bounce`, `.glow-icon` |
| ui/Pickers.kt | ui/Pickers.tsx |
| ui/ShareTools.kt | ui/share.ts |
| BlueprintHUDComponents.kt | ui/Blueprint.tsx |
| UltraGauge.kt, ImpactGauge.kt | ui/Gauges.tsx |
| IntroOverlay.kt | ui/Intro.tsx |
| MainActivity.kt, MainProApp.kt | main.tsx, App.tsx, nav/screens.ts, nav/NavProvider.tsx |
| LoginScreen.kt | screens/LoginScreen.tsx (**fully ported**) |
| HomeScreen / CatalogScreen / ProductDetailScreen / CompareScreen / ScannerScreen / UnifiedDashboard / FavoritesScreen (+ShowModeScreen) / SettingsScreen / AccessoriesScreen (+AccessoryDetailScreen) / SearchScreen / LeadsScreen (+LeadsTwoPane, LeadFormScreen, LeadScanOverlay) / FamiliesScreen (+FamilyScreen, ComboDetailScreen, FamilyAndCombosStrip) / BenchmarkScreen / DocsUi | screens/<same name>.tsx (**stubs with final prop signatures**) |
| AudioAnalyzer.kt, FftAnalyzer.kt, UnifiedViewModel.kt | NOT PORTED yet (speed tool: see below) |
| vision/VisualRecognizer.kt | NOT PORTED yet (scanner) |

Differences worth knowing:
* Kotlin `suspend` / `Flow` -> `Promise` / `Store`. `ProductRepository.init()` is async (loads `data/products.json` by `fetch`); `ready` store tells when done.
  Other repositories also load async, so lists are empty for a few ms at startup.
* Kotlin sealed results -> `{ kind: 'ok' | 'failed' | 'notConfigured' ... }` objects (`TeamResult`, `LoginResult`, `RefreshResult`).
* `LeadStore.markSent`, `photoForUpload`, `savePhoto`, `photoUrl` are async (IndexedDB). `Lead` is an interface; make one with `newLead({ name })`.
* Product helpers that were Kotlin members are plain functions: `displayName(p)`, `isStylecraft(p)`, `hasMeasured(p)`, `isEstimated(p, field)`,
  `specRows(p)`, `measuredRows(p)`, `speedClaim(p)`, `checkClaim(claim, rpm)`, `categoryLabel(c)`, `categoryPlural(c)`, `isIron(c)`, `hasMotor(c)`.
  Category is a string union (`'CLIPPER' | ...`); `CATEGORIES` has the enum order.
* Family key parameter is `familyKey` in props (React reserves `key`).

## Exports for screen authors

* **Data** (`import ... from '../data'` barrel, or the module): everything above, plus `ProductRepository.refresh()`, `AccessoryRepository.refresh()`,
  `TeamSync.{login,changePassword,checkSession,ping,sendMeasurement,sendLeads,listDocs,docFile}`, `DocsRepository.{forProduct,certsFor,fetch,refresh}`,
  `FollowUp.{buildEmail,openEmail,mailtoUrl,suggestedTime,openMeeting,meetingUrl}`, `LeadParser.{parseCode,fromFreeText}`, `ProductMatcher.bestMatch`,
  `talkingPoints(ours, theirs, spanish)`, `Families.{all,of,byKey}`, `MeasurementStore.{add,remove,forProduct,toCsv}`, `LeadStore.{save,remove,findById,toCsv,...}`,
  `AppPrefs.{toggleFavorite,setLanguage,setCatalogUrl,setAccessoriesUrl,setTeamSync,setRepContact,setLastEvent,clearSession,...}`.
* **UI components**: `ScreenHeader`, `Pill`, `ProductImage`, `NoPhoto`, `CategoryIcon`, `Field`, `Spinner`, `BottomSheet`, `Dialog`, `ToastHost`/`showToast`, `Icon` (add paths to `ui/icons.tsx`),
  `ProductPickerList`, `AnimatedGlowIcon`, `staggerStyle`, `useAnimatedNumber`, `RotatingScannerRing`, `DataCallout`, `HexIconItem`, `EnergyParticleSystem`,
  `UltraGauge`, `ImpactGauge`, `IntroOverlay`, `ReadableWidth`.
* **Helpers**: `Brand` colors, `openUrl`, `vibrateShort`, `categoryIconUrl`, `localImageUrls`, `motorFamily`, `motorImageUrl`, `drawableUrl` (register new bundled images in `KNOWN_IMAGES` in ui/Common.tsx),
  `shareFile/shareText/shareLink/copyText/downloadBlob/printHtml`, `renderComparison`, `renderBenchmark` (PNG `File`s), `productBitmap`.
* **CSS conventions** (`src/styles.css`, documented at its top): `.screen .scroll .row .col .grow .center .gap-*`, `.card`, `.photo-box`, `.btn .btn-red/-lime/-cyan/-outline/-text/-block/-lg`,
  `.input`, `.pill`, `.section-title`, `.muted .red .cyan .lime`, `.stagger` (+`staggerStyle(i)`), `.bounce`, `.backdrop/.sheet/.dialog`, `.grid-2`, `.grid-auto`, CSS vars `--cyan --red --lime --card --card-border --photo-bg --muted`.
  Screens are inline-styled + these classes; no CSS framework.

## Android-only features and the web equivalents

| Android | Web plan |
|---|---|
| CameraX + ML Kit barcode (badge/QR/UPC) | `getUserMedia` + `BarcodeDetector` (Chromium/Android/Safari 17+) with `@zxing/browser` fallback. Parsing is already in `LeadParser.parseCode` / `Accessory/Combo.byUpc` |
| ML Kit text recognition (OCR of box / badge / card) | `tesseract.js` (WASM, lazy-loaded) feeding `ProductMatcher.bestMatch` and `LeadParser.fromFreeText` (needs `OcrLine` heights/tops: tesseract gives bboxes) |
| MediaPipe visual recognition (`VisualRecognizer.kt`) | `@mediapipe/tasks-vision` image embedder (WASM) - same model file; fingerprints cached in IndexedDB. Lower priority |
| AudioRecord + FFT (`AudioAnalyzer`, `FftAnalyzer`, `UnifiedViewModel`) | Web Audio: `getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}})` + `AnalyserNode` (fftSize 8192) or an AudioWorklet; port the peak/harmonic logic to TS; keep 5-sample median smoothing. Sample rate is chosen by the browser (usually 44.1/48k) - use `audioContext.sampleRate` |
| Vibrator | `navigator.vibrate` (`vibrateShort`); no-op on iOS |
| FileProvider + share sheet | Web Share API with files, else download (`ui/share.ts`) |
| Intent mailto / Calendar | `mailto:` link / Google Calendar template URL in a new tab (`data/followup.ts`) |
| Documents opened with another app | `DocsRepository.fetch` returns a `Blob`; open with `URL.createObjectURL` in a new tab / `<iframe>` |
| Coil online images | plain `<img>` (Shopify CDN allows hotlinking; canvas export needs CORS, falls back to no photo) |
| SplashScreen | `IntroOverlay` (same 1.7 s) + manifest `background_color` |
| Orientation lock on phones | not possible on the web; layouts are responsive instead |

## Issues / risks (please read)

1. **CORS - Google Sheets catalog / accessories.** The app reads the team sheet as CSV (`.../export?format=csv&gid=...`). From a browser this works only
   when Google allows the cross-origin read. `fetchRemoteText` tries the export URL, then the `gviz/tq?tqx=out:csv` URL (which allows cross-origin reads of
   public sheets). If both are blocked the user sees `CORS_HINT` and the built-in/cached catalog keeps working. Most robust fix: "Publish to the web" the sheet tabs as CSV,
   or mirror the JSON on your own domain (any URL with `Access-Control-Allow-Origin: *`).
2. **CORS - Apps Script team sheet (login, leads, send-to-catalog, documents).** Requests are POSTs with `Content-Type: text/plain` (no preflight, as Apps Script requires).
   Apps Script answers with a redirect to `script.googleusercontent.com`; browsers follow it and that response is readable, so login/docs should work **if the web app is deployed
   "Execute as: Me / Anyone"**. Not testable offline here - **must be verified against the real `/exec` URL.** If a reply is blocked, `leads` and `measurement` requests are re-sent
   with `mode: 'no-cors'` (the write still happens but the app can't read the confirmation, so it reports "Sent (could not confirm)"). `login`, `docs`, `docFile`, `changePassword`
   need to read the reply: if CORS blocks them the web app cannot sign in. Fallback would be a tiny proxy (Vercel/Cloudflare function) in front of the script.
3. **HTTPS required** for camera, microphone, Web Share, clipboard and service worker (`localhost` is OK for dev). Host the build on HTTPS (Vercel, Netlify, Firebase Hosting...).
4. **Browser support**: `BarcodeDetector` is missing in Firefox / older Safari (zxing fallback planned); `navigator.vibrate` and file-share are mobile-Chromium/Safari only; iOS Safari
   microphone processing can't be fully disabled, so RPM accuracy on iPhones may differ from the Android app - validate the analyzer on real devices.
5. **Auth token in localStorage**: same trust level as SharedPreferences on a phone, but anyone with access to the browser profile can read it; sign out on shared computers.
   The Apps Script `TEAM_KEY` and URL are in the bundle (as they were in the APK).
6. **Offline**: data is cached (catalog, docs list, leads), but there is no service worker yet, so the app shell itself needs a connection to load. Add `vite-plugin-pwa` later if offline-at-shows matters.
7. **Not ported yet** (the stubs): all screens except Login, speed-tool audio engine, scanner/OCR/visual recognition, `LeadScanOverlay`, `DocsUi` cards, `FamilyAndCombosStrip`.
8. Product photos bundled by model name (`sc607m.png` ...) do not exist in the repo (only 9 images in `res/drawable`), so most products use their online `imageUrl`, same as the app.
9. `ic_cat_*.xml` vector icons are unused by the Kotlin code (it uses `cat_*.png`), so they were not converted.
10. Number rounding (`toFixed`) can differ from Java `String.format` by one digit in rare half-way cases.
