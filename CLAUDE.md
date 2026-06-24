# CLAUDE.md — manhwa-convertor

> **Audience:** any agent (Claude or human) picking up this repository cold.
> **Status:** Phase 6 in progress. Phases 3–5 complete.
> **Sibling project:** [`../manhwa-pipeline/`](../manhwa-pipeline/) — the legacy React app that this rewrite replaces. It still ships and gets bug-fixes until v1.0.
> **Last full review:** 2026-06-25.

### Current state at a glance (2026-06-25)

**Done**
- Phases 0–2: scaffolding, domain/application stubs, Electron skeleton.
- **Phase 3** — single-mode pipeline: extract → filter → bible → narrate → polish → structural → accuracy → assemble (ZIP + progress rail).
- **Phase 4** — bulk mode: master-bible threading, disk checkpoints, resume after a hard kill.
- **Phase 5** — TTS mode: `Ai33Adapter` + `audio:stitch` IPC (ffmpeg) + `TtsModeStore` + full page UI + AI33 keys in settings.
- **Phase 6 (partial)** — worker pool for rasterise+filter in `node:worker_threads` w/ inline fallback (ADR-001); ESM-main/CJS-preload fix so the desktop app actually boots (ADR-003); `build:all` lib chain + `electron-builder --dir` packaging fixed — `domain`→`@mc/domain`, hidden type errors, `asarUnpack` (ADR-004); `npm run typecheck` reworked to a real `tsc -b`; initial bundle back under the 500 kB budget (jszip lazy-loaded → 404.8 kB).

**Verified:** `npm run build:all` ✓ (no budget warning), `npm run electron:build` ✓, `npm run typecheck` ✓, `electron-builder --win --dir` ✓ (runnable `release/win-unpacked`), `npx electron dist-electron/main/index.js` boots to renderer load.

**Left**
- *Phase 6 polish:* `MessageChannelMain` IPC streaming; virtual scroll >500 rows; prompt/image caching; p95 chapter <60 s.
- *Phase 5 follow-up:* golden-file test vs. legacy WAV (deferred — non-deterministic TTS, needs live API).
- *Phase 7:* auto-updater + signing. NSIS installer is blocked locally by a Windows winCodeSign symlink-privilege issue (needs Developer Mode/admin or CI).
- *Phase 8:* cutover (archive legacy to a `legacy/` branch).
- *Known gaps:* near-zero automated test coverage vs. the §15 strategy; key rotator still localStorage (not `safeStorage`/main-process canonical).

---

## 0. Quick Orientation

```
manhwa-convertor/
├─ projects/
│  ├─ renderer/            # APP — Angular 21 shell, routes, app.config.ts
│  ├─ domain/              # LIB — Pure TS: entities, value objects, ports, errors
│  ├─ application/         # LIB — Use cases (pipeline orchestration)
│  ├─ infrastructure/      # LIB — Adapters: Gemini, OpenRouter, ai33, storage, IPC
│  ├─ shared-ipc/          # LIB — IPC channel constants + zod payloads + bridge type
│  ├─ ui-kit/              # LIB — Reusable presentational components
│  ├─ feature-single-mode/ # LIB — Single-chapter UI + signal store
│  ├─ feature-bulk-mode/   # LIB — Bulk-queue UI + signal store
│  ├─ feature-tts-mode/    # LIB — TTS UI + signal store
│  ├─ feature-settings/    # LIB — API keys, filter settings, model tiers
│  └─ feature-debug/       # LIB — Debug panel
├─ electron/               # main / preload / workers — built with tsc → dist-electron/
├─ angular.json
├─ eslint.config.js        # ESLint 9 flat config with boundaries plugin
├─ package.json
├─ tsconfig.json           # strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes
└─ CLAUDE.md               # this file
```

**Product identity:**

| Field                  | Value                |
|------------------------|----------------------|
| npm `name`             | `manhwa-convertor`   |
| Electron `productName` | `Manhwa Convertor`   |
| Window title           | `Manhwa Convertor`   |
| Selector prefix        | `mc-` (components), `app-` (root only) |

---

## 1. Why this project exists

`manhwa-convertor` is the clean-architecture rewrite of [`manhwa-pipeline`](../manhwa-pipeline/), which had:

- **God components.** `BulkMode.tsx` 2 459 LOC, `TtsMode.tsx` 1 694 LOC, `bulkQueue.ts` ~1 500 LOC, all mixing UI / IPC / business logic.
- **No global state.** `useState` on top-level components; no cross-tab sync.
- **Browser-only APIs in `core/`.** `canvas`, `URL.createObjectURL`, Web Audio called directly from pipeline modules — blocks moving CPU work to Node workers.
- **Underused Electron.** `electron/main.cjs` only persisted checkpoints.

This codebase fixes all four at the boundary layer, not by patching one component at a time.

---

## 2. Migration relationship to manhwa-pipeline

**Strangler-fig with a hard cutover at v1.0.** Until v1.0:

- The React app under `../manhwa-pipeline/src/` keeps shipping bug-fixes.
- This repo grows feature-by-feature until parity for Single + Bulk + TTS modes.
- A golden-file harness verifies that the same fixture PDFs produce the same `script.txt` bytes from both apps.

At v1.0, the React tree is archived to a `legacy/` branch and `manhwa-convertor` becomes the sole product.

**Port, don't copy.** Pipeline modules in `manhwa-pipeline/src/core/` *look* portable but depend on `Blob`, `URL`, `<canvas>`, or React state. Each is rewritten via ports + adapters; nothing is `cp`'d.

---

## 3. Locked architectural decisions

These were chosen deliberately and are reflected in the current scaffolding. Do not change without explicit discussion.

| Decision               | Choice                                                            | Why                                                                                       |
|------------------------|-------------------------------------------------------------------|-------------------------------------------------------------------------------------------|
| Workspace              | Angular CLI multi-project (1 `angular.json`, 11 projects)          | Std tool, no Nx licensing/learning cost.                                                  |
| Layering               | Clean Architecture (`domain` ← `application` ← `infrastructure`)   | Keeps Gemini/IPC/file-system out of business rules; enables Node + browser reuse.         |
| UI structure           | Standalone components, feature libs, `loadComponent` lazy routes   | NgModule-free; smaller bundles; faster builds.                                            |
| State                  | NgRx Signal Store (`@ngrx/signals` 21.x)                           | Signals-native, less ceremony than classic NgRx, still has DI + devtools.                 |
| Async                  | RxJS at boundaries (HTTP, IPC streams); signals inside components  | Convert with `toSignal` at the component edge.                                            |
| HTTP                   | Angular `HttpClient` + interceptors (auth, key rotation, retry)    | Stops every call from re-implementing rotation/back-off.                                  |
| Heavy work             | Electron main + `node:worker_threads` (sharp, ffmpeg, pdfjs Node)  | Renderer stays responsive.                                                                |
| Renderer policy        | Reactive-only — no `canvas` / Web Audio / `Blob` munging           | Forces clean ports.                                                                       |
| Packager               | `electron-builder` (auto-update + code signing)                    | Replaces electron-packager; supports DMG + NSIS + delta updates.                          |
| IPC                    | Typed `contextBridge` API in `shared-ipc`, zod-validated payloads  | Renderer sees only `window.mc`; main rejects malformed input.                             |
| Module boundaries      | `eslint-plugin-boundaries` (`eslint.config.js`)                    | Lint catches forbidden imports across layers.                                             |
| Testing                | Vitest (Angular CLI default v21), Playwright for E2E               | Already wired.                                                                            |
| Strictness             | `strict: true` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` | Catch the largest class of real bugs cheap.                                       |

---

## 4. Import-direction rules (enforced by `eslint-plugin-boundaries`)

```
renderer        → feature-*, ui-kit, infrastructure, application, domain, shared-ipc
feature-*       → ui-kit, application, domain, shared-ipc
infrastructure  → domain, shared-ipc
application     → domain
domain          → (nothing in workspace)
ui-kit          → (nothing in workspace)
shared-ipc      → (nothing in workspace)
electron        → shared-ipc, domain    (Node-side; cannot import Angular code)
```

A feature library may **not** import another feature library. Cross-feature reuse goes through `ui-kit` (presentation) or `application` (logic). CI lint fails on a violation. See [`eslint.config.js`](./eslint.config.js).

---

## 5. Migration roadmap (where we are)

| # | Phase                          | Status      | Exit criteria                                                                                  |
|---|--------------------------------|-------------|------------------------------------------------------------------------------------------------|
| 0 | Scaffolding + tooling          | ✅ DONE      | `ng build` green for all 11 projects; ESLint + boundaries wired; CI runs lint + test.          |
| 1 | Domain + Application stubs     | ✅ DONE      | All entities, ports, use-case signatures defined. No adapters yet.                              |
| 2 | Electron skeleton              | ✅ DONE      | Main process boots with strict CSP + `contextBridge`. IPC handlers for `pdf:rasterise` + `image:filter` wired with zod validation. Workers (worker_threads) deferred to Phase 6 — see ADR-001 below. |
| 3 | Single mode parity             | ✅ DONE      | Full 8-stage pipeline complete (extract → filter → bible → narrate → polish → structural → accuracy → assemble). ZIP download + progress rail working. |
| 4 | Bulk mode parity               | ✅ DONE      | Master-bible threading + checkpoint resume; survives hard kill mid-chapter.                    |
| 5 | TTS mode parity                | ✅ DONE      | `Ai33Adapter` + `audio:stitch` IPC (ffmpeg) + `TtsModeStore` + full page UI implemented. Golden-file test vs. legacy WAV output deferred (non-deterministic TTS — needs live API). |
| 6 | Performance + polish           | 🚧 IN PROG  | **Done:** worker pool (ADR-001) for rasterise+filter; ESM/CJS fix so the desktop app boots (ADR-003); `build:all` lib chain + packaging fixed — `domain`→`@mc/domain`, hidden type errors, `asarUnpack` (ADR-004); `electron-builder --dir` produces a runnable app; `npm run typecheck` reworked to a real `tsc -b` (libs + renderer + specs + electron); initial bundle back under budget (jszip dynamic-imported → 404.8 kB). **Left:** IPC streaming via `MessageChannelMain`; virtual scroll >500 rows; prompt/image caching; hit p95 chapter <60 s. |
| 7 | Auto-updater + signing         |             | Notarised macOS DMG, signed Windows NSIS, update channel resolves on staging. (Note: NSIS installer currently blocked locally by a Windows winCodeSign symlink-privilege issue — needs Developer Mode/admin or a CI runner.) |
| 8 | Cutover                        |             | Legacy `manhwa-pipeline` moves to a `legacy/` branch; this becomes the sole product.           |

---

## 6. React → Angular component mapping (legacy → here)

| Legacy (React in manhwa-pipeline)                                  | Target (here)                                                                                                 |
|--------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------|
| `App.tsx`                                                          | `projects/renderer/src/app/app.ts` + `app.routes.ts`                                                          |
| `components/PdfUploader.tsx`                                       | `ui-kit/file-drop` + `feature-single-mode/upload-page`                                                        |
| `components/ApiKeyManager.tsx`                                     | `feature-settings/api-key-manager` + `infrastructure/key-rotator`                                             |
| `components/FilterSettings.tsx` / `FilterStats.tsx`                | `feature-settings/filter-settings` + `ui-kit/filter-stat-row`                                                 |
| `components/ImageGrid.tsx`                                         | `ui-kit/image-grid` (virtual scroll via `@angular/cdk/scrolling`)                                              |
| `components/ScriptOutput.tsx`                                      | `ui-kit/script-viewer`                                                                                        |
| `components/BulkMode.tsx` (2 459 LOC)                              | `feature-bulk-mode/{queue-page, chapter-row, master-bible-panel, progress-rail, store}` + use-cases           |
| `components/TtsMode.tsx` (1 694 LOC)                               | `feature-tts-mode/{script-input, voice-picker, render-page, retry-row, store}` + `tts-render-track.use-case`  |
| `components/DebugPanel.tsx`                                        | `feature-debug/debug-panel` + EventBus port                                                                   |
| `core/pdfToImages.ts` + `panelSlicer.ts`                           | `application/extract-pdf.use-case` + `electron/workers/pdf-rasteriser.worker` (pdfjs Node build)              |
| `core/filterPipeline.ts`                                           | `application/filter-pages.use-case` + `electron/workers/image-filter.worker` (sharp)                          |
| `core/characterBible.ts`                                           | `application/build-bible.use-case` + `infrastructure/gemini`                                                   |
| `core/sceneChunker.ts`                                             | `application/chunk-scenes.use-case`                                                                            |
| `core/narrator.ts` (606 LOC)                                       | `application/narrate-scene.use-case` (+ helpers in `domain/services/rolling-context.ts`)                       |
| `core/scriptPolisher.ts` / `scriptStructuralEditor.ts` / `scriptAccuracyChecker.ts` / `globalScriptPolisher.ts` | `application/polish-script`, `structural-edit`, `check-accuracy` use-cases       |
| `core/keyRotator.ts`                                               | `infrastructure/key-rotator` + Signal Store + IPC broadcaster (canonical state in main process)                |
| `core/voiceApi.ts` + `voiceAudioStitcher.ts` + `voiceSrtBuilder.ts`| `infrastructure/ai33` + `electron/workers/audio-stitcher.worker` (ffmpeg-static)                              |
| `core/storage.ts` + `sessionStore.ts` + `seriesStore.ts`           | `infrastructure/storage/{indexeddb, disk, memory}` + repositories in `domain/ports`                            |
| `core/debugLog.ts` + `stageTiming.ts`                              | `infrastructure/logging` + `EventBus` port                                                                     |
| `electron/main.cjs` (~275 LOC)                                     | `electron/main/index.ts` + `electron/main/ipc/checkpoint.ts`                                                   |

### React idiom → Angular idiom cheat-sheet

| React                                           | Angular                                                                            |
|-------------------------------------------------|------------------------------------------------------------------------------------|
| `useState`                                      | `signal()` (component) or `signalStore` field (cross-component)                     |
| `useEffect(fn, [dep])`                          | `effect(() => …)` reading the signal `dep`                                          |
| `useMemo`                                       | `computed(() => …)`                                                                 |
| `useRef`                                        | `viewChild()` for elements, plain `signal` for values                               |
| `useContext`                                    | DI `InjectionToken<T>` + `inject(TOKEN)`                                            |
| Custom hook `useFoo()`                          | Injectable service or `signalStore` returning signals                               |
| Props drilling                                  | `input()` / `output()` (signal-based v17+); hoist to a store when ≥3 levels deep    |
| `children` slot                                 | `<ng-content>` projection                                                           |
| Conditional render `{x && <C/>}`                | `@if (x()) { <c-cmp/> }`                                                            |
| `.map(item => <Row/>)`                          | `@for (item of items(); track item.id) { <row /> }`                                 |
| `useReducer`                                    | NgRx Signal Store with `withMethods`                                                |
| Error boundary                                  | `ErrorHandler` provider + `@if (error())` in shell                                  |
| Portal                                          | `@angular/cdk/portal` `CdkPortalOutlet`                                             |
| `React.memo`                                    | Standalone components are already `OnPush`; computed signals diff structurally      |

---

## 7. Coding standards

- **Strict TypeScript.** `tsconfig.json` sets `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`. No `any` outside `*.spec.ts` mocks — use `unknown` and narrow.
- **No barrel re-exports inside libraries.** Each lib has *one* `public-api.ts`; internal files import via relative paths. Deep imports across lib boundaries are blocked by lint.
- **Standalone everywhere.** No `NgModule` in new code. Provide services via `providedIn: 'root'` or component-scoped `providers`.
- **`ChangeDetectionStrategy.OnPush`** is the default for every component — set it explicitly on the decorator.
- **Signals in templates; RxJS at boundaries.** Convert via `toSignal()` at the component edge.
- **Naming.** Files kebab-case (`bulk-queue.store.ts`), classes PascalCase, interfaces `Foo` (no `IFoo`), ports suffix `Port`, adapters suffix `Adapter`, stores suffix `Store`, use-cases suffix `UseCase`, route components suffix `Page`.
- **Selector prefix.** `mc-` for all components except `app-root`. `lib-*` is reserved for placeholders only.
- **One public class per file.** Helpers can group in `*.helpers.ts`.
- **Composition over inheritance.** No abstract base components.
- **Comments.** Write a comment only when the *why* is non-obvious. Never restate the *what*.
- **Formatting.** Prettier wired in (`.prettierrc`). Run `npm run format` before commit; CI rejects non-formatted code.
- **Commits.** Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`).

---

## 8. State management (NgRx Signal Store)

One store per *bounded context*, not per component.

```ts
export const BulkQueueStore = signalStore(
  { providedIn: 'root' },                       // singleton for the renderer window
  withState<BulkQueueState>(initialState),
  withComputed(({ chapters }) => ({
    pendingCount: computed(() => chapters().filter(c => c.status === 'pending').length),
  })),
  withMethods((store, useCase = inject(RunChapterUseCase)) => ({
    enqueue(chapter: Chapter) { patchState(store, s => ({ chapters: [...s.chapters, chapter] })); },
    async runNext() {
      const next = store.chapters().find(c => c.status === 'pending');
      if (!next) return;
      patchState(store, markRunning(next.id));
      const result = await useCase.execute(next);
      patchState(store, applyResult(next.id, result));
    },
  })),
  withHooks({ onInit(store) { /* hydrate from IPC */ } }),
);
```

**Rules:**

- State stays flat and normalised. Don't nest entity arrays inside entity arrays.
- Use `withEntities` for collections.
- Use-case calls happen *inside* `withMethods`, not in components.
- Cross-store coordination goes through the `EventBus` port, not direct store-to-store imports.
- Never put `Blob`, `File`, `URL`, or DOM nodes in the store. Store IDs; resolve through the `BlobRegistryPort`.

---

## 9. API integration standards

All external HTTP goes through `HttpClient`. Plain `fetch` is banned outside Electron workers.

### Interceptor chain (order matters)

1. `AuthHeaderInterceptor` — attaches the right `Authorization` / `x-goog-api-key` per host.
2. `KeyRotationInterceptor` — picks a live key; on 401/429, throttles + retries with another.
3. `RetryInterceptor` — exponential back-off for 5xx + network errors (3 attempts, jitter).
4. `TimeoutInterceptor` — per-host max-RTT (Gemini 90 s, OpenRouter 60 s, ai33 60 s).
5. `LoggingInterceptor` — records request id, host, latency. Redacts `Authorization` + `x-goog-api-key`.
6. `ErrorMappingInterceptor` — converts `HttpErrorResponse` into typed `DomainError` subclasses.

### Adapter contract

```ts
// domain/ports.ts
export interface GeminiPort {
  narrate(req: NarrateRequest): Promise<NarrateResult>;
  buildBible(refs: readonly string[], tier: ModelTier): Promise<CharacterBible>;
  // ...
}
export const GEMINI_PORT = new InjectionToken<GeminiPort>('GeminiPort');

// infrastructure/gemini/gemini.adapter.ts
@Injectable({ providedIn: 'root' })
export class GeminiAdapter implements GeminiPort { /* uses HttpClient */ }
```

Use-cases inject the **port**, not the adapter — `inject(GEMINI_PORT)`. Tests swap a fake without changing use-case code.

### Key rotation

`KeyRotatorService` is the single source of truth. Canonical state lives in the Electron main process; renderer windows subscribe via IPC. Daily quota counters reset at local midnight.

---

## 10. Security practices

### Renderer surface

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`.
- CSP set via `webRequest.onHeadersReceived` (not `<meta>`, which injected script could replace):
  - `default-src 'self'`
  - `script-src 'self'`
  - `style-src 'self' 'unsafe-inline'` (Angular component styles)
  - `connect-src 'self' https://generativelanguage.googleapis.com https://openrouter.ai https://*.ai33.pro`
  - `img-src 'self' data: blob:`
- `setWindowOpenHandler` returns `{ action: 'deny' }`; https URLs route via `shell.openExternal`.
- `DomSanitizer.bypassSecurityTrust*` is **forbidden** in app code (blocked by lint).
- Use `[innerText]` / `{{ }}` for user data. Never `[innerHTML]`.

### IPC surface

- Every `contextBridge` method is zod-validated on the main side. Reject malformed payloads.
- IPC channel names are constants in `shared-ipc/channels.ts`, never string literals at call sites.
- Main refuses absolute paths on inputs that should be names.

### Secret handling

- API keys live in `safeStorage` (Electron) / `keytar` (fallback) — not localStorage.
- Keys never logged; `LoggingInterceptor` redacts `Authorization` + `x-goog-api-key`.
- No telemetry / crash reporting in v1.0.

### Input validation

- PDF magic-byte check (`%PDF-`) before pdfjs. Size cap 200 MB per file.
- Gemini / OpenRouter responses parsed through zod schemas → typed `LLMResponseError` on malformed.
- File names sanitised through path-sanitize before any disk write.

### Dependency security

- `npm audit --omit=dev` clean on `main`. CI gates on high/critical.
- New deps require PR rationale + license check (MIT / Apache-2.0 / BSD only).
- Electron bumped within 7 days of security release.

---

## 11. Performance

### Bundle

- Lazy-load every feature route via `loadComponent`. Initial bundle = shell + ui-kit only.
- Budget: **500 kB warning / 1 MB error** (in `angular.json`).
- Tailwind v3 is **enabled** (reversed 2026-05-26 — see ADR-002). Mitigation for the CDR concern: never bind class strings reactively in templates (no `[ngClass]` with computed string concatenation); prefer static utility classes + `[class.foo]="bar()"` for the dynamic bits. Design tokens stay in `styles.scss` (`--mc-*`) and are mapped into the tailwind theme so utilities like `bg-mc-bg-elev` resolve to the right value automatically.

### Change detection

- `OnPush` everywhere (default). Signals propagate without zone churn.
- Long lists: `@for` with a stable `track` id. Virtual scroll above 500 rows.

### Rendering

- Images: `loading="lazy"` + explicit dimensions (avoid CLS).
- Renderer thread does no image decoding past Bitmap — that's a worker's job.

### IPC

- Stream large payloads (`ArrayBuffer`) over `MessageChannelMain`, not JSON IPC.
- Workers coalesce progress at ≤30 updates/sec.

### Caching

- Gemini prompt-response in-memory LRU 200 per session.
- IndexedDB caches filtered images keyed by `(sourceHash, filterSettingsHash)`.

### Startup

- Splash window while workers spawn in parallel.
- `sharp` / `ffmpeg-static` lazy-required on first use.
- Target cold start: **<1.5 s** to interactive.

### Memory

- Workers terminate when idle >60 s; respawn on demand.
- `BlobRegistry` finalises and revokes URLs.

---

## 12. Error handling and logging

- **Typed domain errors** (`ExtractError`, `LLMResponseError`, `QuotaExceededError`, …) in `domain/errors.ts`.
- **Single `ErrorHandler`** in `app.config.ts` — surfaces to toast + logs.
- **No silent catches.** `catch (e) {}` is banned by lint.
- **Structured logger** (`{ level, ts, component, event, …fields }`). Output sinks: console (dev), userData rolling file (prod).
- **Per-stage timing** via `StageTimingService.mark('narrate.start' | 'narrate.end')` → feeds Debug panel and surfaces p50/p95 in UI.

---

## 13. Cross-platform (Windows + macOS)

- Always `path.join`; lint blocks raw `/` and `\\` in path literals.
- `.gitattributes` enforces LF in repo; Electron handles platform-native at write time.
- Native modules (`sharp`, `ffmpeg-static`): use official prebuilt npm packages. CI builds on `windows-latest` + `macos-latest`.
- `CommandOrControl` for menu accelerators.
- `dialog.showOpenDialog` only — never construct paths from text input.
- macOS: keep alive on `window-all-closed`; recreate on `activate`. Windows: quit on `window-all-closed`. (Already wired in `electron/main/index.ts`.)
- Code signing: macOS notarised DMG via `electron-builder` (`notarize: true`); Windows signed NSIS with EV cert.
- Auto-update: `electron-updater` against a static `latest.yml` published to GitHub Releases.
- Smoke matrix per release: Win11, Win10, macOS 13 Intel, macOS 14 Apple Silicon.

---

## 14. Dependencies (vs. legacy)

| Concern               | Legacy                          | This project                                       |
|-----------------------|---------------------------------|----------------------------------------------------|
| Framework             | `react@18`                      | `@angular/* @21.2`                                 |
| Build                 | `vite@5`                        | `@angular/build@21` (esbuild)                      |
| Styling               | `tailwindcss@3`                 | `tailwindcss@3` + SCSS design tokens (`--mc-*`)    |
| Icons                 | `lucide-react`                  | `@ng-icons/core` + `@ng-icons/lucide`              |
| State                 | `useState` / singletons         | `@ngrx/signals@21`                                 |
| HTTP                  | `fetch`                         | `@angular/common/http` + interceptor chain         |
| Validation            | manual                          | `zod` (IPC + LLM responses)                        |
| PDF                   | `pdfjs-dist@4` in browser       | `pdfjs-dist@5` Node build in Electron worker       |
| Audio                 | Web Audio API                   | `ffmpeg-static` in worker                          |
| Image processing      | `<canvas>` in renderer          | `sharp` in worker                                  |
| Electron shell        | `electron@33` + electron-packager | `electron@33` + `electron-builder`               |
| Native keychain       | localStorage                    | Electron `safeStorage` / `keytar`                  |
| Testing               | manual                          | `vitest` + Playwright                              |
| Lint                  | none                            | `eslint@9` + `eslint-plugin-boundaries`            |

### Dependency add policy

1. PR description must explain why a built-in or existing dep can't do it.
2. Bundle-size delta measured (`source-map-explorer` diff).
3. License: MIT / Apache-2.0 / BSD. GPL/LGPL blocked.

---

## 15. Testing strategy

| Layer            | Tool                                      | Coverage target |
|------------------|-------------------------------------------|------------------|
| `domain`         | Vitest                                    | 95%             |
| `application`    | Vitest + fake adapters                    | 90%             |
| `infrastructure` | Vitest + `msw` (recorded HTTP)            | 80%             |
| `shared-ipc`     | Vitest (zod accept/reject)                | 100%            |
| `ui-kit`         | Vitest + `@analogjs/vitest-angular`       | 85%             |
| `feature-*`      | Vitest (store) + Playwright component     | 75%             |
| Electron main    | Vitest with `electron-mocks`              | 80%             |
| E2E              | Playwright Electron                       | (scenarios)      |
| Golden file      | `tools/golden/run.ts` (custom harness)    | 3 fixtures       |

Tests live next to source (`foo.ts` + `foo.spec.ts`); E2E in `e2e/`. No snapshots for non-deterministic data — assert with schemas. No `it.skip` / `xit` on `main` (CI greps).

---

## 16. Build and deployment

### Local

```bash
npm ci
npm run start              # ng serve at http://localhost:4200 (browser-only)
npm run electron:dev       # parallel ng serve + Electron with hot reload
npm test                   # vitest
npm run lint               # eslint + boundaries
```

### Production

```bash
npm run build:all          # all libs + renderer (prod)
npm run electron:build     # tsc → dist-electron/
npm run dist               # electron-builder packages
npm run dist:win           # NSIS, signed (with certs)
npm run dist:mac           # DMG, notarised (with certs)
```

### CI/CD (GitHub Actions)

- `ci.yml`: lint + unit + golden on every PR (Ubuntu).
- `release.yml`: triggered on `v*` tag; builds on `windows-latest` + `macos-latest`, signs/notarises, publishes to GitHub Releases.
- Secrets: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.

### Environments

`projects/renderer/src/environments/` (to add):
- `environment.ts` — dev (verbose logs, debug panel on)
- `environment.prod.ts` — prod (warn logs, debug panel off)
- `environment.staging.ts` — pre-prod (prod logs + staging update channel)

Never put secrets in environment files.

---

## 17. Risk register

| # | Risk                                                            | Mitigation                                                                                            |
|---|-----------------------------------------------------------------|-------------------------------------------------------------------------------------------------------|
| 1 | Output diverges from legacy (script changes subtly)             | Golden-file harness on 3 fixture PDFs; must match before each phase exits.                            |
| 2 | Gemini API surface changes mid-migration                        | Adapter pattern isolates the change; contract test catches it; pin SDK / raw HTTP + zod.              |
| 3 | Native module mismatch on Mac ARM64                             | CI matrix on `macos-14` (ARM); universal binaries; smoke test before release.                         |
| 4 | electron-builder signing fails on first attempt                  | Stand up signing pipeline in phase 2, not phase 7.                                                    |
| 5 | NgRx Signal Store API churn                                     | Pin minor version; review release notes before bumping.                                               |
| 6 | Bundle size blows budget                                        | Per-PR `source-map-explorer` diff; budget warning gates merge.                                        |
| 7 | Users on legacy lose work during cutover                        | This app reads legacy checkpoint format on first run; migration is read-only of legacy data.          |
| 8 | Notarisation cert expires                                       | Calendar reminder 60 days before expiry; runbook in `docs/runbooks/codesigning.md`.                   |
| 9 | Electron security advisory mid-cycle                            | Renovate flags `electron` priority:high; bump within 7 days.                                          |
| 10| Bus factor 1                                                    | This file is the handoff doc. ADRs in `docs/adr/` for every non-trivial decision.                     |

---

## 18. Per-PR checklists

### Security

- [ ] No new `bypassSecurityTrust*` call.
- [ ] No `[innerHTML]` on user-influenced data.
- [ ] No `eval` / `new Function`.
- [ ] No `nodeIntegration: true` / `contextIsolation: false`.
- [ ] No new IPC channel without a zod schema in `shared-ipc/payloads.ts`.
- [ ] No new HTTP host without a `connect-src` CSP update.
- [ ] No secret logged (CI grep for `apiKey`, `Authorization`, `token` in test output).
- [ ] `npm audit --omit=dev` shows no new high/critical findings.
- [ ] New deps reviewed (downloads, age, license).
- [ ] User-supplied filenames pass through path-sanitize.

### Performance

- [ ] New components are `OnPush`.
- [ ] No Observable subscribed in a template without `toSignal`.
- [ ] No `@for` without a `track` expression.
- [ ] New routes lazy-loaded via `loadComponent`.
- [ ] Bundle delta <5 kB gz; justify if larger.
- [ ] No new sync work >16 ms on the renderer thread (use a worker).
- [ ] IPC payload size <1 MB; use a stream if larger.
- [ ] No memory growth in the 10-chapter bulk-mode soak test.

---

## 19. Day-to-day commands

```bash
npm ci                            # install (use ci, not install, for reproducibility)
npm run start                     # Angular dev server, browser-only
npm run build:libs                # build all libs (required before electron:build resolves shared-ipc)
npm run build:all                 # build:libs + renderer
npm test                          # vitest
npm run lint                      # eslint + boundaries
npm run format                    # prettier write
npm run format:check              # prettier check (CI uses this)
npm run typecheck                 # tsc -b (all libs + renderer + specs) + electron main/preload, --noEmit

npm run electron:build            # tsc → dist-electron/
npm run electron:dev              # parallel renderer + main with hot reload
npm run dist                      # electron-builder packaging
npm run dist:win                  # Windows NSIS only
npm run dist:mac                  # macOS DMG only

npx ng generate component foo --project=feature-single-mode --standalone
npx ng build domain               # build one specific lib
```

---

## 20. Anti-patterns (don't repeat these mistakes)

- **Don't `cp ../manhwa-pipeline/src/core/*.ts` into a lib here.** Those files depend on browser globals. Always port through ports + adapters.
- **Don't add a feature library that imports another feature library.** Lint will block it; refactor to `ui-kit` or `application`.
- **Don't use `NgModule` in new code.** Standalone only.
- **Don't reach for `effect(() => ...)` as a substitute for a use-case.** Effects sync reactive state to side-effects (DOM, localStorage). Business orchestration belongs in `withMethods` calling a use-case.
- **Don't put Observables in component inputs.** Inputs are signals now. Convert at the boundary.
- **Don't store Blobs/URLs in state.** Store IDs; resolve through the `BlobRegistry`.
- **Don't disable `contextIsolation` "just for debug".** There's no debug case that justifies it.
- **Don't introduce a global event bus and broadcast everything.** Use the bus for genuine cross-cutting events (e.g. `KeyRotatorUpdated`), not as a backdoor around boundaries.
- ~~**Don't add Tailwind.**~~ Reversed 2026-05-26 (ADR-002). Tailwind v3 is wired. Do still avoid reactive class-string concatenation in templates — use static utilities + `[class.foo]="bar()"` for dynamic bits.
- **Don't bump `@angular/*` minors individually.** They're versioned in lockstep.

---

## 20a. Architecture Decision Records (ADRs)

### ADR-004 — `domain` library renamed to `@mc/domain`; `npm run typecheck` reworked to `tsc -b`

**Status:** accepted, 2026-06-25.

**Context:** `build:all` (and therefore `electron-builder` packaging) failed at `ng build infrastructure` with 61 `TS2305: Module 'domain' has no exported member …` errors. Root cause: the library was named `domain`, which collides with Node's built-in `domain` module that `@types/node` declares ambiently (`declare module "domain"`). When a lib's import graph pulls in `@types/node` (infrastructure does, via a transitive `/// <reference types="node" />`), `from 'domain'` binds to Node's module — which has none of our exports. `application` built only because its graph never pulled node types. The renderer app build never hit it because the browser app has no node types.

These stayed hidden because **`npm run typecheck` used to be a no-op**: the root `tsconfig.json` has `files: []` + references but no `include`, and without `-b` tsc compiles nothing — always green. Phase-level type errors (e.g. a real `exactOptionalPropertyTypes` violation in `bulk-mode.store.ts`, and a too-narrow `TtsRenderTrackInput`) accumulated unnoticed.

**Decision:**
- The domain library's import specifier is **`@mc/domain`** (package name in `projects/domain/package.json`; `tsconfig.json` path maps it to `./dist/domain`). The angular.json project name stays `domain` (so `ng build domain` is unchanged). Never name a workspace lib after a Node builtin.
- **`npm run typecheck` is reworked to build mode:** `tsc -b tsconfig.json --noEmit && tsc -p electron/tsconfig.json --noEmit && tsc -p electron/tsconfig.preload.json --noEmit`. `-b` honours the project references, so it actually compiles every lib + the renderer app + specs (and now the Electron main/preload too). Verified it catches injected errors on both the Angular and Electron sides; `.tsbuildinfo` lands in gitignored `out-tsc`. Caveat: cross-lib types resolve via `paths → dist/*`, so run after `build:libs` for accuracy on cross-lib API changes; `build:all` remains the authoritative check (it also does Angular template type-checking via `ngc`, which plain `tsc -b` does not).

**Consequences:** All cross-lib imports use `@mc/domain`. Packaging works: `electron-builder --win --dir` produces `release/win-unpacked` with native modules (sharp, @img, @napi-rs/canvas, ffmpeg-static) `asarUnpack`'d and the full `dist-electron` (ESM main + worker + CJS preload) inside the asar. The full NSIS *installer* additionally needs electron-builder's winCodeSign cache, whose macOS `.dylib` symlinks fail to extract on Windows without Developer Mode/admin — an environment limitation, not a project bug.



### ADR-002 — Tailwind v3 and `@ng-icons/lucide` are in

**Status:** accepted, 2026-05-26.

**Context:** The original architecture stripped Tailwind (perf concern around runtime class-string churn) and planned `lucide-angular` for icons. `lucide-angular@0.460` capped at Angular 18 so we had no icon library when v0.1 of manhwa-convertor was scaffolded. The user asked to add both back.

**Decision:**
- **Styling:** Tailwind v3 is wired. CSS variables in `styles.scss` remain the source of truth for design tokens (`--mc-bg`, `--mc-accent`, …); `tailwind.config.js` maps them into the theme so utilities like `bg-mc-bg-elev`, `text-mc-accent` resolve to those vars. Dark/light still flows through `prefers-color-scheme` on `:root`.
- **Icons:** `@ng-icons/core` + `@ng-icons/lucide`. Icons are tree-shaken — they only ship when imported into `app.config.ts`'s `provideIcons({...})` registry. Add new icons there; consumers use `<ng-icon name="lucideX" size="1rem" />`.

**Why:**
- Tailwind is fastest path to consistent spacing/typography across the many small UI pieces the migration is about to add (bulk-mode queue rows, TTS retry rows, debug panel meters). Hand-rolled SCSS for each becomes a tax on iteration speed.
- The original perf concern stands but is manageable: with **static** utility classes the CDR cost is one-time at compile, not per-frame. The footgun is `[ngClass]="someComputed()"` returning a fresh string each frame — guard against that, not Tailwind itself.
- `@ng-icons` is the de-facto Angular icon ecosystem at v17+, signal-store friendly, no `NgModule` overhead.

**Consequences:**
- Initial bundle grew (Tailwind base + a small icon-runtime). Stayed under the 500 kB budget.
- Two style mechanisms now coexist (utility classes + per-component SCSS). Convention: utilities for layout/spacing/colour, component styles for animations and component-specific structure. Don't write SCSS for things tailwind already does.

### ADR-003 — ESM main + workers, CommonJS preload

**Status:** accepted, 2026-06-25.

**Context:** The Electron main process never booted. `electron/tsconfig.json` uses `module: node16`, and the source tree inherits the root `package.json`'s `type: module`, so tsc emitted ESM (`import …`). But the build script wrote `dist-electron/package.json` as `{"type":"commonjs"}`. At launch Electron loaded the main as CJS and threw `SyntaxError: Cannot use import statement outside a module` → "App threw an error during load". Every prior phase (3–5) had only ever been run via `ng serve` (browser-only), where `window.mc` is absent and all IPC adapters no-op — so the boot failure went unnoticed.

ESM output is *required*: `pdfToImages` loads pdfjs-dist v5 (ESM-only) via dynamic `import()`, which `module: node16` preserves only when emitting ESM. Downleveling to CJS would `require()` an ESM-only package and fail.

**Decision:**
- `dist-electron/package.json` → `{"type":"module"}`. Main process, workers, and services are ESM.
- **Preload is the exception** — sandboxed preloads (`sandbox: true`) only support CommonJS. It compiles via a separate `electron/tsconfig.preload.json` (`module: commonjs`) and gets its own `dist-electron/preload/package.json` → `{"type":"commonjs"}`.
- ESM-incompatible globals fixed: `__dirname` → `path.dirname(fileURLToPath(import.meta.url))` (index.ts, worker-pool.ts); `require.resolve` → `createRequire(import.meta.url)` (pdf-rasteriser.service.ts).
- `electron:build` now runs two tsc passes and writes both `package.json` markers.

**Verification:** `npx electron dist-electron/main/index.js` boots past module load and reaches renderer load (`ERR_FILE_NOT_FOUND` only because the prod renderer bundle isn't built — `electron:dev` serves it from `ng serve`).

**Consequences:** Two module systems coexist in `dist-electron/` by design. Any new preload-side code stays CJS; everything else is ESM. Packaging (Phase 7) must `asarUnpack` native modules (sharp, @napi-rs/canvas, ffmpeg-static) and confirm worker_threads load from the asar layout.

### ADR-001 — Phase-3 rasterisation ran in main process; worker pool landed Phase 6

**Status:** accepted 2026-05-26; **superseded by the Phase-6 worker pool, 2026-06-25.**

**Update (2026-06-25):** The deferred worker pool is now implemented. `electron/main/services/worker-pool.ts` runs rasterise + filter in `node:worker_threads` (lazy spawn, ≤min(cpus-1,4) workers, 60 s idle termination, crashed-worker respawn). `electron/workers/cpu.worker.ts` is the worker entry. `runCpuTask()` wraps the pool with an **inline fallback** so correctness never depends on the worker loading. Verified via a Node smoke test: worker spawns, sharp executes in-thread, correct keep/drop result, no fallback. Original Phase-3 reasoning below for history.

**Context:** The locked architecture says heavy CPU work runs in `node:worker_threads` so the renderer thread (and the Electron main message loop) stay responsive. The Phase 3 vertical needs PDF rasterisation + sharp-based filtering, both CPU-bound.

**Decision:** For the first vertical slice, rasterisation and filtering run on the Electron main process directly (synchronous w.r.t. main's event loop, async via `await` so the loop isn't blocked between page operations). No worker pool yet.

**Why:**
- Worker_threads add: a worker pool service, message-passing protocol, transferable ArrayBuffers, a separate worker tsconfig, and a small build pipeline for the worker bundles. Real benefit only materialises in **Bulk mode** (multiple PDFs in parallel).
- For Single mode, one PDF at a time, the renderer is the only window and isn't doing meaningful work while waiting on the IPC — main can afford the blocking.
- pdfjs is per-page async; sharp is libvips-backed and yields the event loop on every operation. The main loop never blocks for more than ~50ms.

**Consequences:**
- A `pdf:rasterise` IPC call holds the main loop's CPU for the duration of the rasterisation. Auto-updater pings, menu interactions, and second-window IPC are delayed.
- This will hurt at Bulk-mode scale (10+ chapters parallel). Phase 4 must refactor to a worker pool.

**Reconsider when:**
- Bulk mode lands (Phase 4).
- A single-PDF rasterisation regresses past ~30 s on the reference machine.

---

## 21. Where to look next

- **Current state of the new code:** `projects/*/src/lib/*` — entities, ports, use-case stubs.
- **Legacy app, what it does stage by stage:** `../manhwa-pipeline/src/core/scriptPipeline.ts` is the orchestrator; follow it.
- **External APIs:** Gemini docs at `https://ai.google.dev/api`; OpenRouter at `https://openrouter.ai/docs`; ai33 endpoint shapes documented inline in `../manhwa-pipeline/src/core/voiceApi.ts`.

---

*Update this file in the same PR as the change it describes. When something here proves wrong in practice, fix the doc first, then the code.*
