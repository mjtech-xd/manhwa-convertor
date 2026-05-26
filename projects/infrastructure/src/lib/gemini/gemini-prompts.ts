// Bible-extraction prompt. Ported from the legacy app
// (manhwa-pipeline/src/core/characterBible.ts) with light cleanup.
// Output is a JSON object the adapter validates with zod.

export const BIBLE_PROMPT = `
You are an expert at reading webtoon/manhwa chapters. I'm giving you the
panels from a chapter. Extract a *character bible* that another step
will use to write narration.

Return ONLY valid JSON in this exact shape — no markdown fences, no
commentary:

{
  "characters": [
    { "name": "<canonical name>", "description": "<one-sentence visual + role>", "aliases": ["<other names used>"] }
  ],
  "setting": "<one short paragraph: era, location, vibe>",
  "tone": "<one short phrase: e.g. dark fantasy, romantic comedy, brutal action>"
}

Rules:
- Include only characters that actually appear or are named in the panels.
- Aliases must include nicknames or titles used in the chapter.
- Keep descriptions short and visual-first ("tall white-haired swordsman in red coat").
- If a character's name is not shown, invent a descriptor in [brackets] ("[the masked king]").
`.trim();
