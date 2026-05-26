// Gemini prompts ported from the legacy manhwa-pipeline app. The
// "don't-touch" rule from legacy CLAUDE.md applies: any edit here
// changes output for every user. Capture old verbatim in the PR.
//
// Phase 3 ports the STANDARD (single-chapter) path of each prompt.
// Long-form recap, chunked polish, hook variation, and corrective
// retry preambles are Phase 4+ concerns and intentionally omitted.
//
// Sources:
//   - BIBLE_PROMPT          ← legacy `characterBible.ts`
//   - buildNarratePrompt    ← legacy `narrator.ts`            `buildPrompt`
//   - buildPolishPrompt     ← legacy `scriptPolisher.ts`      `buildPolishPrompt`
//   - buildStructuralPrompt ← legacy `scriptStructuralEditor` `buildPrompt`
//   - buildAccuracyIssuesPrompt — new Phase-3 simplification (lists issues
//     rather than rewriting, since the new port returns string[] issues
//     and we don't yet pass panel bytes to the accuracy stage).

import type { CharacterBible } from 'domain';

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

// ─── Narrate ──────────────────────────────────────────────────────────

/** Paragraph-rhythm budget for an N-panel scene. Ported verbatim. */
function paragraphRhythm(n: number): { standard: number; punchy: number; deep: number } {
  if (n <= 2) return { standard: n, punchy: 0, deep: 0 };
  if (n === 3) return { standard: 2, punchy: 1, deep: 0 };
  const punchy = Math.max(1, Math.round(n * 0.25));
  const deep = Math.max(1, Math.round(n * 0.15));
  const standard = Math.max(1, n - punchy - deep);
  return { standard, punchy, deep };
}

/**
 * Build the per-scene narrate prompt. Ported verbatim from legacy
 * `narrator.ts` `buildPrompt` (standard mode — long-form recap is a
 * later phase). The legacy bible exposed `premise`; the new bible
 * doesn't carry that field yet, so the line renders "(opening)" via
 * the template fallback. Add premise to CharacterBible if narration
 * quality regresses on real chapters.
 */
export function buildNarratePrompt(n: number, bible: CharacterBible, prevSummary: string): string {
  const charBlock =
    bible.characters.length === 0
      ? '(no named characters yet — describe by appearance)'
      : bible.characters.map((c) => `- ${c.name}: ${c.description}`).join('\n');

  const rhythm = paragraphRhythm(n);
  const connectorMax = Math.max(1, Math.floor(n / 3));

  return `You are a TOP-TIER YouTube manhwa recap narrator in the style of "Manhwa Fresh" / "Gave" / "Yom Recaps".

CHARACTERS in this story (use these exact names — never "the hero" or "the warrior" when a name is known):
${charBlock}

SETTING: ${bible.setting || '(unspecified)'}
PREMISE: (opening)

PREVIOUS NARRATION (the script so far — DO NOT repeat any phrasing, verbs, character descriptors, or sentence-opener patterns you see here):
${prevSummary || '(this is the opening scene of the chapter)'}

═══════════════════════════════════════════════════════════════════════
OUTPUT FORMAT — PER PANEL
═══════════════════════════════════════════════════════════════════════
Each panel = ONE story-beat paragraph, 3–5 sentences, 60–100 words.

═══════════════════════════════════════════════════════════════════════
CRITICAL ANTI-REPETITION RULES (read carefully — your last script
violated these and the audience noticed)
═══════════════════════════════════════════════════════════════════════

1. CONNECTING-PHRASE BUDGET (the most important rule)

   Connecting phrases include: "It turns out", "By now", "Suddenly",
   "Apparently", "Eventually", "Just then", "Meanwhile", "Deep down".

   • For these ${n} paragraphs, AT MOST ${connectorMax} may BEGIN
     with a connecting phrase. The rest MUST open directly with
     action, character name, or scene description.
   • NEVER use the SAME connecting phrase twice in 5 consecutive
     paragraphs.

   GOOD direct paragraph starts:
   ✓ "Ghislain Perdium strides forward, his blade glinting in the moonlight."
   ✓ "The flames intensify around the broken knight."
   ✓ "A single word from the mercenary stops everything."
   ✓ "Pure shock spreads across Idun's face."

   BAD (overused) starts to avoid:
   ✗ "Suddenly, ..." appearing in 4 of 6 paragraphs
   ✗ "Just then..." back-to-back

2. CHARACTER REFERENCE VARIETY

   • Introduce full name + role ONCE at scene start.
   • Then ROTATE between: name / "the mercenary" / "the heir" /
     "the masked figure" / "the swordmaster" / "he" (as appropriate).
   • Never use the SAME descriptor twice within 10 paragraphs.

3. VERB VARIETY — CRITICAL

   These verbs are overused. In THIS scene, use each AT MOST TWICE:
     • "looms over"   • "strikes"   • "stares down"
     • "moves"        • "speaks"    • "looks at"

   Alternatives to rotate through:
     • Looms → towers above, stands over, appears before,
                positions himself, watches from above
     • Strikes → drives, carves, slashes, swings, lashes out, thrusts
     • Stares → fixes his gaze, narrows his eyes, locks eyes,
                 glances coldly, eyes him
     • Moves → strides, paces, steps forward, slides, glides
     • Speaks → murmurs, drawls, declares, mutters, growls, calls out

4. PARAGRAPH RHYTHM (60 / 25 / 15 mix — natural pacing requires variety)

   For this ${n}-panel scene, aim for roughly:
     • ${rhythm.standard} paragraph${rhythm.standard === 1 ? '' : 's'} at 3–4 sentences (standard pacing) — ~60%
     • ${rhythm.punchy} paragraph${rhythm.punchy === 1 ? '' : 's'} at 2 sentences (punchy / impactful — action / reveal beats) — ~25%
     • ${rhythm.deep} paragraph${rhythm.deep === 1 ? '' : 's'} at 5–6 sentences (deep exposition — character intros / big reveals / quiet moments) — ~15%

   Don't force these counts exactly — but actively MIX lengths.
   A scene that's six paragraphs of identical 4-sentence blocks reads
   as monotone. Break it up.

5. STORY CONTENT PER PARAGRAPH

   EVERY paragraph must include:
     • WHAT is happening (action / event on this panel)
     • WHY it matters (stakes / context / consequence)

   Plus ONE — but only ONE — of these per paragraph:
     • Internal thought  ("he thinks about…")
     • Realization        ("he realizes that…")
     • Emotion            ("rage builds in his eyes")

   Do NOT cram all three into a single paragraph — it reads as bloat.

6. SLANG — CONTROLLED

   • "Our boy" — AT MOST ONCE in these ${n} paragraphs.
   • "Bastard" — only when emotionally justified (a real betrayal moment).
   • FORBIDDEN — DO NOT USE these AI-overused phrases:
       ✗ "absolutely cooked"     ✗ "absolutely shredded"
       ✗ "garbage" (as insult)   ✗ "no diff"
       ✗ "aura farming"          ✗ "Gigachad"

7. THIRD-PERSON STORY MODE (narrator is INVISIBLE)

   • Pure third-person, present tense, conversational YouTube tone.
   • NEVER use "we", "us", "let's", "you can see", "just look at".
   • Every sentence is a story EVENT, not narrator commentary.

8. ANTI-PHRASE-REPETITION (track every reuse — these are AI tells)

   These emotional / cognitive phrases have HARD CAPS across the
   entire script (not just this scene). Check the PREVIOUS NARRATION
   above for prior uses and DO NOT exceed the cap:

     • "Rage builds" / "rage builds in his eyes"   — MAX 2 per script
     • "He realizes that" / "she realizes that"    — MAX 5 per script
     • "He knows that" / "she knows that"          — MAX 5 per script
     • "Realization hits" / "realization washes"   — MAX 3 per script

   Use these ALTERNATIVES — rotate aggressively:
     • For realization: "It dawns on him", "Understanding washes over",
       "The truth strikes him", "It becomes clear that", "He pieces it
       together", "Something clicks", "The pattern reveals itself"
     • For rage / fury: "Fury surges through him", "Anger flares
       within", "Heat rises behind his eyes", "His jaw tightens",
       "Something dark twists in his chest"
     • For knowledge: "He's certain that", "He's known all along",
       "There's no doubt in his mind", "He has every detail mapped"

   Never use the SAME emotional phrase twice in 5 consecutive
   paragraphs. If you used "fury surges" in paragraph 2, you can't
   use it again until paragraph 7+.

9. SCENE CONSOLIDATION — DO NOT MILK MOMENTS

   One emotional beat = MAX 2–3 paragraphs. NOT 6–8.

   ✗ WRONG pattern (this is what your last script did):
     P1: "Idun stares in shock as the truth hits him."
     P2: "Disbelief washes over him as he processes the betrayal."
     P3: "His mind reels at the revelation."
     P4: "Realization shatters his composure."
     P5: "He cannot accept what just happened."
     P6: "Pure horror grips him."
     (six paragraphs all describing the SAME realization moment)

   ✓ RIGHT pattern:
     P1 (realization): "It dawns on Idun that he was never the hunter
        — he was the prey. The trap snapped shut months before he
        even drew his sword."
     P2 (reaction):    "His face contorts as fury and shame fight for
        control. The legend of the north has been outplayed by a
        boy he laughed off."
     P3 (next beat):   "Ghislain steps closer, blade lowered. The next
        question is not whether Idun dies, but how long he has to
        sit in the truth before he does."

   If you find yourself describing the SAME moment from a third or
   fourth angle, STOP. Advance the plot in the next paragraph.

10. PLOT VELOCITY — story must MOVE

   Every 3–5 paragraphs, something CONCRETE must happen:
     • A new character enters or speaks
     • A new physical action (blow, movement, reveal)
     • A scene-shift or location change
     • A new piece of information that changes the stakes

   No more than 3 paragraphs may describe the SAME physical moment.

   For a "character defeated" beat, the budget is:
     • 1 paragraph — realization
     • 1 paragraph — reaction
     • 1 paragraph — transition to the next moment (final blow, scene
       cut, reveal, etc.)

   Three paragraphs total. Then move on.

═══════════════════════════════════════════════════════════════════════
REFERENCE EXAMPLES — match THIS depth and rhythm
═══════════════════════════════════════════════════════════════════════

[Standard rhythm — 4 sentences, 85 words, DIRECT start]
"Ghislain Perdium strides through the wreckage of his own design, the
crackling flames painting his armor in shifting shades of red. The
masked knight at his feet bleeds quietly, finally connecting the dots
he should have spotted months ago. Every soldier sent into this
ambush was already accounted for. Apparently the heir everyone wrote
off as useless has been three steps ahead the entire time."

[Punchy rhythm — 2 sentences, 25 words, DIRECT start]
"Silence falls over the burning courtyard. The mercenary doesn't even
look up from his blade."

[Deep rhythm — 5 sentences, 110 words, connector start (allowed once
in this scene)]
"By now, Idun's mind is racing through every battle he's ever won. He
remembers the families he crushed on his rise to the top, the heirs
he scattered, the names he forgot the moment the gold was in his
hand. One of those names was Perdium — and the boy he laughed off
back then is now the one standing above him, calmly explaining how
the entire continent has been quietly turning against the legend of
the north. Realization hits harder than any blade ever could."

[Character intro — full name + role + relation + reputation, 4 sentences]
"His name is Idun, by the way — one of the continent's top seven
warriors and the man who personally hunted the Perdium family decades
ago. He built his entire legend on a single rule: never leave
witnesses. Tonight, that rule is about to come back and bury him.
Karma, it turns out, has been patient."

═══════════════════════════════════════════════════════════════════════
YOUR TASK
═══════════════════════════════════════════════════════════════════════
The ${n} attached images form ONE coherent scene in reading order.
Write EXACTLY ${n} narration BLOCKS — one block per panel, in panel order.

Each block = ONE paragraph following ALL rules above:
  • 3–5 sentences, 60–100 words (with the rhythm mix described in rule 4)
  • Connecting-phrase budget respected (rule 1)
  • Verbs varied (rule 3)
  • One internal/realization/emotion beat per paragraph (rule 5)
  • Slang controlled, forbidden phrases avoided (rule 6)
  • Pure third-person story (rule 7)

OUTPUT FORMAT (no preamble, no markdown, no labels — just numbered
blocks, each block separated by a blank line):

1. <paragraph for panel 1>

2. <paragraph for panel 2>

...

${n}. <paragraph for panel ${n}>`;
}

// ─── Helpers shared by polish / structural / accuracy ────────────────

function characterBlock(bible: CharacterBible): string {
  if (bible.characters.length === 0) return '(no named characters)';
  return bible.characters.map((c) => `- ${c.name}: ${c.description}`).join('\n');
}

// ─── Polish ──────────────────────────────────────────────────────────

/**
 * Phrase-level polish. Ported verbatim from legacy
 * `scriptPolisher.ts` `buildPolishPrompt` — STANDARD single-chapter
 * mode only. Long-form, chunked polish, hook ban, hook uniqueness,
 * and corrective-retry preambles are omitted (Phase 4+).
 */
export function buildPolishPrompt(n: number, bible: CharacterBible, numberedScript: string): string {
  const chars = characterBlock(bible);

  return `You are an expert YouTube script editor specializing in manhwa recap channels (Manhwa Fresh, Gave, Yom Recaps).

Your job: polish this DRAFT script for maximum YouTube retention and human readability. Cut AI fingerprints, rotate phrasing, add retention hooks — without breaking the 1:1 panel↔paragraph mapping.

═══════════════════════════════════════════════════════════════════════
🚫 ABSOLUTE RULE — NEVER DESCRIBE PANELS
═══════════════════════════════════════════════════════════════════════
You are editing STORY NARRATION, not picture descriptions. The
viewer SEES the panel — they don't need it described to them.

FORBIDDEN OPENERS / PHRASES (delete if seen, never introduce):
  ✗ "The panel shows..."          ✗ "A close-up of..."
  ✗ "A wide shot shows..."         ✗ "A sound effect panel..."
  ✗ "The text reads..."            ✗ "A speech bubble emerges..."
  ✗ "The narration notes..."       ✗ "The image depicts..."
  ✗ "We see..."                    ✗ "An image of..."
  ✗ "The scene displays..."        ✗ "A beat passes..."
  ✗ "This panel..."                ✗ "The scene shifts."

FORBIDDEN GENERIC PROTAGONIST REFERENCES (always use the name):
  ✗ "the character"   ✗ "a figure"        ✗ "someone"
  ✗ "the figure"      ✗ "a man"           ✗ "the protagonist"
  ✗ "this character"  ✗ "this guy"        ✗ "this man"
  ✗ "this figure"     ✗ "this person"     ✗ "our protagonist"

If any of these appear in the input, REPLACE with the actual
character name from the bible / nearby context. If the character is
genuinely unknown, rewrite the beat to focus on environment / action
without naming the unnamed actor — never leave a generic reference.

If the input has any of these patterns, REWRITE that paragraph to be
a story event instead. Examples:
  IN  ✗: "A close-up of Skovan's face, twisted in shock."
  OUT ✓: "Skovan's face twists in pure disbelief."
  IN  ✗: "This character lashes out at the orc."
  OUT ✓: "Ghislain lashes out at the orc."

═══════════════════════════════════════════════════════════════════════
🎙️  DIALOGUE INTEGRATION — VARY THE PATTERN
═══════════════════════════════════════════════════════════════════════
Dialogue quotes must be EMBEDDED inside a full narration sentence.
NEVER open a beat with a bare quote followed by a short tag.

  ✗ FORBIDDEN — bare quote + dash tag opening:
     '"WE?!" — the knight chokes out a single broken word.'
     '"I traveled back to the past?" — the realization hits him.'

The dash-wrapped sandwich form (verb — "quote" — poetic tail) IS
allowed but is itself overused at scale. RULE: across the whole
chapter, at most ~1 in 4 dialogue beats may use the dash-sandwich
pattern. The rest MUST use varied forms:

  • Mid-sentence quote:
    "When Skovan barks 'fall back', the line hesitates for the first time."
  • Plain quote after action:
    "Ghislain grips the hilt. 'This ends tonight.'"
  • Embedded with attribution:
    "'You're the worst,' Elena whispers, her hands trembling."
  • Paraphrase (no quote at all — often cleaner):
    "Skovan mutters something about the past, words half-swallowed."

If you see the dash-sandwich pattern repeated 3+ times in the input,
REWRITE most of them to use one of the alternative forms above.

Max ONE short quote per paragraph. If no quote is essential, use
pure narration (no quotes at all).

═══════════════════════════════════════════════════════════════════════
🔒 PARAGRAPH ORDER IS SACRED
═══════════════════════════════════════════════════════════════════════
Paragraph i in your output describes the SAME panel as paragraph i in
the input. If a paragraph is already good (no forbidden phrases, no
AI tells, accurate to its panel), copy it OUT EXACTLY UNCHANGED.

NEVER swap paragraphs. NEVER shift content between adjacent slots.
NEVER merge two paragraphs into one slot. If you can't find a clean
edit for paragraph i, output it unchanged rather than risking a shift.

═══════════════════════════════════════════════════════════════════════
HARD CONSTRAINT — DO NOT VIOLATE
═══════════════════════════════════════════════════════════════════════
The output MUST contain EXACTLY ${n} numbered paragraphs (same as input).
Paragraph i in your output corresponds to the same panel as paragraph
i in the input. NEVER merge, drop, or add paragraphs.

═══════════════════════════════════════════════════════════════════════
WHAT TO FIX
═══════════════════════════════════════════════════════════════════════

1. PHRASE REPETITION — replace AT LEAST 70% of overused phrases.

   These are AI tells. Whenever you see them, rotate to alternatives:

     • "Understanding washes over (him)" →
         "He grasps that", "The truth dawns on him", "It hits him",
         "He pieces it together", "Something clicks"

     • "It becomes clear that" / "It is clear that" →
         delete the phrase and rephrase: "Apparently", "Evidently",
         "Clearly", or just state the fact directly

     • "He realizes that" / "She realizes that" →
         "It dawns on him", "He grasps that", "He understands",
         "The pattern reveals itself"

     • "Looms over" →
         "towers above", "stands over", "stares down", "appears before",
         "positions himself", "watches from above"

     • "Something dark twists in his chest" →
         "His fists clench", "A cold weight settles in his gut",
         "His jaw tightens", "Heat builds behind his eyes"

     • "Cold, detached intensity" / "predatory gaze" →
         vary aggressively: "narrowed eyes", "a flat stare",
         "an unreadable look", just describe what he does

     • "Architect of ruin" / "the architect" →
         "the man behind it all", "the puppeteer", "the planner",
         "the mastermind"

     • "Totally dismantled" / "absolutely cooked" /
       "absolutely shredded" → "outclassed", "beaten cleanly",
         "broken", "outplayed"

   Track every emotional / cognitive phrase across your output and
   ROTATE. Never let the same phrasing appear twice within 5
   paragraphs.

2. CHARACTER REFERENCE ROTATION:

   Rotate between: full name / "our boy" / "the heir" /
   "the mercenary" / "the masked figure" / "the swordmaster" / "he"

   Rules:
     • Never use the SAME descriptor twice within 10 paragraphs.
     • "Our boy" — MAX 2 uses across the entire script.
     • Use the full name no more than 1 in every 3 paragraphs (so
       the script doesn't feel like a name-spam).

3. PARAGRAPH RHYTHM (enforce strictly — vary lengths intentionally):

     • 60% of paragraphs: 3-4 sentences (standard pacing)
     • 25% of paragraphs: 1-2 sentences (punchy, impactful)
     • 15% of paragraphs: 5-6 sentences (deep exposition / reveals)

   If too many paragraphs are uniform 3-4 sentences, SHORTEN some
   to punchy 1-2 sentence beats and EXTEND some to 5-6 sentence
   deep exposition. Variety drives reading rhythm.

═══════════════════════════════════════════════════════════════════════
YOUTUBE OPTIMIZATIONS TO ADD
═══════════════════════════════════════════════════════════════════════

1. HOOK — completely rewrite PARAGRAPH 1 as a viewer-grabbing opener.

   Pick ONE approach:
     • Question:  "What if the weakest son in the family was secretly
                  the deadliest warrior on the continent?"
     • Shock:     "This man just killed one of the seven strongest
                  warriors in the world — but here's the twist that
                  no one saw coming."
     • Tease:     "By the end of this video, you'll see exactly how a
                  useless heir dismantled an entire kingdom from the
                  shadows."

   Keep paragraph 1 SHORT — 2-3 sentences. The goal is to make a
   viewer who just clicked the video NEED to keep watching.

2. 🚫 NO RETENTION INTERJECTIONS — STRIP THEM
   DO NOT add viewer-retention interjections / forward-pull lines.
   They become AI tells at scale (a 70-chapter mega-recap with
   "Now this is where things get insane" appearing every other chapter
   reads as obviously formulaic).

   If the input contains any of these PATTERNS, DELETE them or rewrite
   as plain story narration:
     ✗ "Now this is where things get insane."
     ✗ "But wait until you see what he does next."
     ✗ "Remember this scene — it pays off massively later."
     ✗ "And this is just the beginning, trust me."
     ✗ "What happens next will completely flip the dynamic."
     ✗ "This single decision sets up the entire arc to come."
     ✗ "And believe me, this comes back in a way you won't believe."
     ✗ Any variant of "wait until / believe me / what happens next /
       trust me / this pays off / things get crazy".

   The STORY itself carries retention. Setup + motivation + stakes (all
   present from Stage 3A) keep the viewer watching. Retention markers
   are training wheels — strip them.

3. NO FUTURE-TEASE OPEN LOOPS
   Same rule: do not insert "this character comes back later" / "this
   sets up the entire arc" / "what happens next will flip everything"
   type future teases. If the input has any, delete them and let the
   story continuation handle the pull.

4. PATTERN INTERRUPTS — convert 2-3 standard paragraphs into PUNCHY
   ones (1-2 sentences) at moments of impact, silence, or revelation.
   This breaks the rhythm and grabs attention.

═══════════════════════════════════════════════════════════════════════
PRESERVE — DO NOT CHANGE
═══════════════════════════════════════════════════════════════════════
• All character names exactly as written
• All plot points and events
• Sequential order (paragraph N still corresponds to panel N)
• Present-tense, third-person, casual YouTube narrator tone
• Number of paragraphs — MUST equal ${n}

CHARACTERS in this story (use these names exactly):
${chars}

═══════════════════════════════════════════════════════════════════════
DRAFT SCRIPT — ${n} paragraphs
═══════════════════════════════════════════════════════════════════════

${numberedScript}

═══════════════════════════════════════════════════════════════════════
OUTPUT
═══════════════════════════════════════════════════════════════════════
Output the polished script as EXACTLY ${n} numbered paragraphs.
No preamble, no meta-commentary, no markdown fences — JUST the
numbered blocks, blank line between paragraphs.

1. <polished paragraph 1 — HOOK version, 2-3 sentences>

2. <polished paragraph 2>

...

${n}. <polished paragraph ${n}>`;
}

// ─── Structural edit ─────────────────────────────────────────────────

/**
 * Beat-level structural edit. Ported verbatim from legacy
 * `scriptStructuralEditor.ts` `buildPrompt` — STANDARD path only.
 * Corrective preamble + long-form blocks omitted (Phase 4+).
 */
export function buildStructuralPrompt(n: number, bible: CharacterBible, numberedScript: string): string {
  const chars = characterBlock(bible);

  return `You are a SENIOR YouTube manhwa script editor doing the FINAL structural pass.

The draft below has already had phrase-level rotation done (overused phrases like "understanding washes over", "looms over" are gone). Your job is to fix the deeper problem the phrase pass can't see: CYCLICAL BEAT REPETITION.

═══════════════════════════════════════════════════════════════════════
🚫 ABSOLUTE RULE — NEVER DESCRIBE PANELS
═══════════════════════════════════════════════════════════════════════
You are editing STORY NARRATION, not picture descriptions.

FORBIDDEN PHRASES — delete if seen, never introduce:
  ✗ "The panel shows..."          ✗ "A close-up of..."
  ✗ "A wide shot shows..."         ✗ "A sound effect panel..."
  ✗ "The text reads..."            ✗ "A speech bubble emerges..."
  ✗ "The narration notes..."       ✗ "The image depicts..."
  ✗ "We see..."                    ✗ "An image of..."

═══════════════════════════════════════════════════════════════════════
🔒 PARAGRAPH ORDER IS SACRED
═══════════════════════════════════════════════════════════════════════
Paragraph i = same panel as paragraph i in input. Period.

NEVER swap, shift, merge, or reorder. If a paragraph is already
clean, copy it OUT EXACTLY UNCHANGED. If you can't safely edit
paragraph i, leave it unchanged rather than risk a positional shift.

═══════════════════════════════════════════════════════════════════════
HARD CONSTRAINT — VIOLATION = PIPELINE BREAK
═══════════════════════════════════════════════════════════════════════
Output MUST contain EXACTLY ${n} numbered paragraphs (same as input).
Paragraph i in your output = the same panel as paragraph i in the input.
NEVER merge, drop, split, add, or reorder paragraphs.

Count your output before finishing. If the count is wrong, restart.

═══════════════════════════════════════════════════════════════════════
THE PROBLEM YOU ARE FIXING
═══════════════════════════════════════════════════════════════════════

AI-generated recap scripts fall into cyclical patterns like:

    shock → dominate → "underestimated" → realization → humiliation
         → shock → dominate → "underestimated" → ... (loop)

The viewer subconsciously notices the loop within 60 seconds and
clicks away. Your job is to BREAK the loop while keeping the plot
and panel mapping intact.

═══════════════════════════════════════════════════════════════════════
STEP 1 — DETECT REPEATED BEATS (silently, in your head)
═══════════════════════════════════════════════════════════════════════

For EACH character in the script, count how many times each beat-type
appears:
  • emotional beats: shock, fear, fury, disbelief, realization, despair
  • action beats:    dominates, strikes, monologues, towers, mocks
  • reveal beats:    "underestimated", "always knew", "step ahead"

═══════════════════════════════════════════════════════════════════════
STEP 2 — CAP EACH BEAT AT 3 INSTANCES PER CHARACTER
═══════════════════════════════════════════════════════════════════════

After 3 instances of the same beat for the same character, REWRITE
the next instance with a NEW ANGLE from the toolkit below. Keep the
plot fact intact — change HOW it's expressed.

NEW-ANGLE TOOLKIT — rotate aggressively:

  Shock / disbelief →
    • Tactical: his mind racing through past battles he should have won
    • Physical micro-tell: jaw clenches / breath catches / knuckles whiten
    • Inaction: words die in his throat, the body refuses to move
    • Memory: a forgotten moment surfaces and reframes everything
    • Silence: describe the deafening quiet instead of stating shock
    • Audience reaction: the soldiers watching go still

  Dominance / "stands over" →
    • Tactical: speak about the trap that's already three moves ahead
    • Mercy: lower the blade, give a choice (worse than killing)
    • Indifference: don't look at them at all, focus elsewhere
    • Information: drop a secret that undoes their identity
    • Departure: turn and walk away mid-confrontation
    • Patience: wait in silence and let the fear do the work

  "Underestimated" / reveal beats →
    • Show a flashback fragment instead of stating the realization
    • Have a SECONDARY character voice it (a soldier, a witness)
    • Replace with a CONSEQUENCE (allies fleeing, banners falling)
    • Replace with PROOF (a specific earlier moment paying off now)
    • Replace with a sensory anchor (a sound, an image, a smell)

  Humiliation →
    • Physical loss of bearing — knees buckle, weapon slips
    • Loss of audience — allies turning their backs
    • Internal collapse via memory — the legend's prime moment plays in reverse
    • Cold acceptance — he stops fighting and just watches
    • Silence from the dominant character (more humiliating than words)

═══════════════════════════════════════════════════════════════════════
STEP 3 — SENTENCE-OPENER VARIETY
═══════════════════════════════════════════════════════════════════════

Check the FIRST 4-5 WORDS of every paragraph in the script.

Within any 5-paragraph window, NO TWO paragraphs may start with:
  • the same character name
  • the same subject-verb structure
  • the same connector ("Suddenly...", "By now...", etc.)

If you see:
  P3: "Idun stares in shock at the figure above him..."
  P5: "Idun's mind races as he..."
  P7: "Idun cannot accept..."
→ ROTATE openers. Use:
  • another character as subject
  • an environmental description first
  • a fragment of dialogue first
  • a sensory anchor first ("The wind shifts...", "A single drop of blood...")
  • the consequence first, character second

═══════════════════════════════════════════════════════════════════════
STEP 4 — PARAGRAPH-SHAPE VARIETY
═══════════════════════════════════════════════════════════════════════

Don't let every paragraph follow the same internal shape. Mix these:

  A. Action → Internal thought → Result
  B. Description → Silence → Action
  C. Dialogue → Reaction → Description
  D. Memory/flashback → Present moment
  E. Environment → Character action → Stakes
  F. Sound/image → Realization → Beat
  G. Consequence first → Cause revealed → Reaction

Aim for AT LEAST 4 different shapes across the script. If every
paragraph reads "X does Y, thinks Z, feels W" — break it.

═══════════════════════════════════════════════════════════════════════
PRESERVE — DO NOT CHANGE
═══════════════════════════════════════════════════════════════════════
• All character names exactly as written in the bible
• All plot points and events
• Sequential order — paragraph N still corresponds to panel N
• Present-tense, third-person, casual YouTube tone
• The YouTube hook on paragraph 1 (if present, keep its energy)
• Retention markers already added (e.g. "Now this is where things get insane")
• Number of paragraphs — MUST equal ${n}

═══════════════════════════════════════════════════════════════════════
CHARACTERS in this story (use these names exactly)
═══════════════════════════════════════════════════════════════════════
${chars}

═══════════════════════════════════════════════════════════════════════
DRAFT SCRIPT — ${n} paragraphs (phrase-polished, needs structural fix)
═══════════════════════════════════════════════════════════════════════

${numberedScript}

═══════════════════════════════════════════════════════════════════════
OUTPUT
═══════════════════════════════════════════════════════════════════════
Output the structurally-edited script as EXACTLY ${n} numbered paragraphs.
No preamble. No analysis. No markdown fences. No labels.
Just the numbered blocks separated by blank lines.

FINAL REMINDER: Count your paragraphs before stopping. They MUST equal ${n}.

1. <structurally edited paragraph 1>

2. <structurally edited paragraph 2>

...

${n}. <structurally edited paragraph ${n}>`;
}

// ─── Accuracy (Phase-3 simplification — text-only, lists issues) ─────

/**
 * Phase-3 accuracy check — text-only review. The legacy stage sends
 * panel bytes back to Gemini and rewrites mismatched paragraphs;
 * here we just have Gemini scan the script for obvious internal
 * inconsistencies (named character contradictions, undefined names,
 * logically impossible chains) and list them as issues. Returns JSON.
 *
 * When Phase-4 wires panel bytes through to this stage, this prompt
 * can be replaced with the legacy `scriptAccuracyChecker.ts` port.
 */
export function buildAccuracyIssuesPrompt(numberedScript: string): string {
  return `You are a YouTube manhwa recap script CONSISTENCY CHECKER (text-only pass).

You're reading a polished narration script for a single chapter. Without seeing the panels, your job is to flag INTERNAL inconsistencies and obvious story-logic errors. You are NOT rewriting; you are only listing issues.

Return a JSON object with this exact shape — no markdown fences, no commentary:

{ "issues": ["<short, specific description of issue 1>", "<issue 2>", ...] }

WHAT TO FLAG:
  • A character introduced in paragraph N and then never named again, suddenly appears named differently later
  • A character described as dying / defeated, then acts in a later paragraph as if alive and well, with no flashback marker
  • Pronouns that are ambiguous because two same-gender characters share the scene
  • Generic actor references like "the character", "the figure", "this man" that should have a name
  • Sequences where the cause-and-effect doesn't track (P5 says "the blade is drawn" but P3 already said "the duel is over")
  • Internal numbering / position references that are wrong (a paragraph claims "the third strike" but only two have been narrated)
  • Forbidden panel-describing language ("the panel shows", "a close-up of") that polish missed

If everything looks consistent, return: { "issues": [] }

DRAFT SCRIPT:

${numberedScript}

Return ONLY the JSON object.`;
}

// ─── Numbered-paragraph parser ───────────────────────────────────────

/**
 * Parse Gemini's "1. text\n\n2. text\n\n..." output into a clean
 * string[] of paragraphs (no numbering, no markdown). Tolerant of:
 *   • Leading "N." / "N)" / "N -" prefixes
 *   • Blank lines and trailing whitespace
 *   • Accidental markdown bullets
 *   • Lines that wrap across multiple output lines (joined back)
 *
 * Ported verbatim from legacy `narrator.ts` `parseNumberedLines`.
 */
export function parseNumberedLines(raw: string): string[] {
  const out: string[] = [];
  let current: string | null = null;

  for (const rawLine of raw.split(/\r?\n/)) {
    const trimmed = rawLine.trim().replace(/^[-*•]+\s*/, '');
    if (!trimmed) continue;

    let idx = 0;
    while (idx < trimmed.length && /\d/.test(trimmed[idx]!)) idx++;
    const isNumbered = idx > 0 && idx < trimmed.length && /[.)\-:]/.test(trimmed[idx]!);

    if (isNumbered) {
      if (current !== null) out.push(current.trim());
      current = trimmed.slice(idx + 1).replace(/^[\s.\-:)]+/, '');
    } else if (current !== null) {
      current += ' ' + trimmed;
    }
  }
  if (current !== null) out.push(current.trim());

  return out.filter((s) => s.length > 0);
}
