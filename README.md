# Manhwa Convertor

Desktop app that converts manhwa chapter PDFs into YouTube-ready recap material:

- **Cleaned panel images** (margin crop, blank-page removal, perceptual-hash de-dup)
- **Gemini-generated narration script** (per-scene, with rolling context + master bible)
- **Optional voiceover** (MP3 + frame-accurate SRT via ai33.pro)

Angular 21 + Electron rewrite of [`manhwa-pipeline`](../manhwa-pipeline) — same product, clean architecture, faster.

> **Status:** scaffolding only. See [`CLAUDE.md`](./CLAUDE.md) for the full migration plan and what's next.

## Quick start

```bash
npm ci
npm run start              # Angular dev server at http://localhost:4200 (browser-only)
npm run electron:dev       # Electron desktop app with hot reload
```

## Build a desktop release

```bash
npm run dist:win           # signed NSIS installer (Windows)
npm run dist:mac           # notarised DMG (macOS, universal)
```

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
├─ electron/               Main, preload, workers (built with tsc)
└─ CLAUDE.md               Migration & architecture guide
```

## License

ISC (personal-use).
