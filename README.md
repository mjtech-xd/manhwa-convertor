# Manhwa Convertor

Desktop app that converts manhwa chapter PDFs into YouTube-ready recap material:

- **Cleaned panel images** (margin crop, blank-page removal, perceptual-hash de-dup)
- **Gemini-generated narration script** (per-scene, with rolling context + master bible)
- **Optional voiceover** (MP3 + frame-accurate SRT via ai33.pro)

Angular 21 + Electron rewrite of [`manhwa-pipeline`](https://github.com/megashoeb/manhwa-pipeline) — same product, clean architecture, faster.

> **Status:** Phase 3 in progress. PDF → image filter → Gemini character bible works end-to-end. Remaining: chunk → narrate → polish → output ZIP. See [`CLAUDE.md`](./CLAUDE.md) for the full plan.

---

## Prerequisites

| Tool       | Required version  | Why                                                      |
|------------|-------------------|----------------------------------------------------------|
| **Node.js**| **22.x LTS** (recommended) — also accepts 24.x | Angular CLI 21 requires Node 20.19+ / 22.12+ / 24+. We pin to 22 LTS via `.nvmrc`. |
| **npm**    | **10.x or newer** (ships with Node 22)         | Workspace install + lockfile fidelity. |
| **git**    | any modern version | Cloning the repo. |

### Install Node 22

**Windows:**
- Easiest: download the LTS installer from <https://nodejs.org/> and run it.
- Or with [winget](https://learn.microsoft.com/windows/package-manager/winget/): `winget install OpenJS.NodeJS.LTS`
- Or with [nvm-windows](https://github.com/coreybutler/nvm-windows): `nvm install 22 && nvm use 22`

**macOS:**
- Easiest: download the LTS installer from <https://nodejs.org/>.
- Or with Homebrew: `brew install node@22 && brew link --overwrite --force node@22`
- Or with [nvm](https://github.com/nvm-sh/nvm): `nvm install 22 && nvm use 22` (will pick up `.nvmrc` automatically when you `cd` in).
- Or with [fnm](https://github.com/Schniz/fnm): `fnm install 22 && fnm use 22`

Verify:

```bash
node --version    # should print v22.x.x (or v24.x.x)
npm --version     # should print 10.x.x or newer
```

> **Native modules note:** `sharp` and `@napi-rs/canvas` are pulled in for image processing. Both ship **prebuilt binaries** for Windows x64, macOS x64, and macOS arm64 — no Python or C++ toolchain needed in the common case. If you're on an uncommon platform (Linux ARM, Windows ARM64, Alpine) `npm install` may fall back to source compilation and ask for a C++ toolchain.

---

## Set up on a fresh machine

### Windows (PowerShell)

```powershell
# 1. Install Node 22 (see Prerequisites above), then verify.
node --version

# 2. Clone the repo wherever you keep code.
git clone https://github.com/mjtech-xd/manhwa-convertor.git
cd manhwa-convertor

# 3. Install dependencies (~2-3 minutes the first time).
npm ci

# 4. Run the desktop app with hot reload.
npm run electron:dev
```

### macOS (Terminal)

```bash
# 1. Install Node 22 (see Prerequisites above), then verify.
node --version

# 2. Clone the repo wherever you keep code.
git clone https://github.com/mjtech-xd/manhwa-convertor.git
cd manhwa-convertor

# 3. Install dependencies (~2-3 minutes the first time).
npm ci

# 4. Run the desktop app with hot reload.
npm run electron:dev
```

The Electron window will open in a few seconds. Code changes to the Angular side hot-reload; changes to `electron/main/**` or `electron/preload/**` need a restart (`Ctrl+C`, re-run).

---

## Available scripts

```bash
# ── Development ─────────────────────────────────────────────
npm run start             # Angular dev server only at http://localhost:4200 (browser-only, no IPC)
npm run electron:dev      # Angular dev server + Electron with hot reload (the normal dev loop)
npm test                  # Vitest unit tests
npm run lint              # ESLint + clean-architecture boundary check
npm run format            # Prettier write
npm run format:check      # Prettier check (CI mode)
npm run typecheck         # tsc --noEmit on the whole workspace

# ── Building ────────────────────────────────────────────────
npm run build:libs        # Build all 10 internal libraries
npm run build:all         # build:libs + renderer (production)
npm run electron:build    # Compile electron/ with tsc → dist-electron/

# ── Distribution (signed/notarised installers) ──────────────
npm run dist              # Build for current OS
npm run dist:win          # Windows NSIS installer (.exe)
npm run dist:mac          # macOS DMG (universal: Intel + Apple Silicon)
```

---

## First-time setup inside the app

1. Launch with `npm run electron:dev`.
2. Click the **Settings** tab.
3. Add a **Gemini API key** — get a free one at <https://aistudio.google.com/apikey>.
4. Click the **Single** tab → drop a chapter PDF → watch the pipeline run.

Keys are stored in `localStorage` (browser-backed) for now — they will migrate to OS keychain (`safeStorage`) in a later phase.

---

## Building a desktop installer

For a portable / installable build to share with non-developers:

### Windows (.exe NSIS installer)

```powershell
npm run dist:win
# Output: release\Manhwa Convertor Setup <version>.exe
```

### macOS (.dmg universal)

```bash
npm run dist:mac
# Output: release/Manhwa Convertor-<version>.dmg
```

> First runs of unsigned builds will trigger Windows SmartScreen ("More info → Run anyway") and macOS Gatekeeper ("right-click → Open → Open"). Production signing + notarisation is set up in `package.json > build` but requires the certificate secrets to be present at build time — see CLAUDE.md §16.

---

## Repository layout

```
manhwa-convertor/
├─ projects/
│  ├─ renderer/            Angular shell (the app you see)
│  ├─ domain/              Pure TS: entities, value objects, ports, errors
│  ├─ application/         Use cases — pipeline orchestration
│  ├─ infrastructure/      Adapters: Gemini, OpenRouter, ai33, storage, IPC
│  ├─ shared-ipc/          IPC channel constants + zod payload schemas
│  ├─ ui-kit/              Reusable presentational components
│  ├─ feature-single-mode/ Single-chapter UI + signal store
│  ├─ feature-bulk-mode/   Bulk-queue UI + signal store
│  ├─ feature-tts-mode/    TTS render UI + signal store
│  ├─ feature-settings/    API keys, filter settings
│  └─ feature-debug/       Debug panel
├─ electron/               Main, preload, services (built with tsc → dist-electron/)
├─ CLAUDE.md               Migration & architecture guide (read this if you'll work on the code)
├─ .nvmrc                  Pinned Node version (22)
└─ package.json
```

---

## Troubleshooting

**`npm ci` fails with "Unsupported engine"**
You're not on Node 22+. Run `node --version`; install Node 22 LTS (see Prerequisites).

**`npm ci` is slow or hangs the first time**
First install is ~400 MB (Angular CLI + Electron + sharp/canvas prebuilt binaries). Subsequent installs are cached.

**Electron window is blank**
The Angular dev server might not be ready yet. `npm run electron:dev` waits for `http://localhost:4200` to come up — give it 10-15 seconds on first start.

**`npm run electron:dev` says "window.mc is not available"**
You ran `npm run start` (browser-only), not `npm run electron:dev`. The browser-only mode skips the IPC bridge by design so you can iterate on layout — pipeline calls will throw a clear error.

**Native module errors on Linux ARM / Alpine**
You're on a platform without prebuilt binaries for `sharp` or `@napi-rs/canvas`. Install a C++ toolchain (`apt install build-essential python3` on Debian/Ubuntu) and re-run `npm ci`.

**macOS: "Manhwa Convertor.app is damaged"**
Unsigned build. Either:
```bash
xattr -cr "/Applications/Manhwa Convertor.app"
```
…or right-click the app → Open → Open Anyway.

**Windows: SmartScreen blocks the installer**
Unsigned build. Click "More info" → "Run anyway".

---

## License

ISC (personal-use).
