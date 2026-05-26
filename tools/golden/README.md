# Golden-file harness

Compares manhwa-convertor's output against legacy manhwa-pipeline's
output for the same input PDF.

Phase 3 ships this in skeleton form. The comparison runs against
extracted ZIP directories the user produces manually from both apps.
Phase 4+ extensions can drive both pipelines programmatically and
diff in-memory.

## Layout

```
tools/golden/
├── README.md              ← this file
├── compare-outputs.mjs    ← Node script that diffs two output directories
├── fixtures/              ← chapter PDFs used as harness inputs
├── baselines/             ← extracted ZIPs produced by legacy app
└── outputs/               ← extracted ZIPs produced by manhwa-convertor
```

## How to use

1. Drop a chapter PDF into `fixtures/` (e.g. `fixtures/chapter-01.pdf`).
2. Run that PDF through legacy **manhwa-pipeline**; save the exported
   ZIP, extract it, and place the extracted directory at
   `baselines/chapter-01-legacy/`.
3. Run the same PDF through **manhwa-convertor**; save its ZIP, extract,
   place at `outputs/chapter-01-new/`.
4. Run the comparison:

   ```
   node tools/golden/compare-outputs.mjs \
     tools/golden/baselines/chapter-01-legacy \
     tools/golden/outputs/chapter-01-new
   ```

## What it checks

- `script.txt` + `script.srt` + `manifest.json` present in both.
- Panel JPEG count matches (the SRT-sync invariant — paragraph count
  must equal panel count).
- `script.txt` paragraph count matches between the two outputs.
- `script.txt` total size within 30% of legacy (catches large
  deviations from prompt drift).

Exit code: `0` on full match, `1` on any failed check.

## Fixture coverage

Start with three chapter PDFs that span the breadth of inputs:

1. **Short chapter** (~15 panels, simple cast) — sanity check.
2. **Long chapter** (~40 panels, multi-character) — exercises rolling
   context across narrate scenes + polish anti-repetition.
3. **Webtoon-strip chapter** (long vertical scrolls, dense paneling)
   — exercises the panel-slicer + dedup stages.
