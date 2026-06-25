// Gemini adapter — implements GeminiPort. Phase 3 covers all five
// methods (buildBible, narrate, polishScript, structuralEdit,
// checkAccuracy). Long-form, chunked polish, hook variation, and
// corrective retries are Phase 4+ — see the prompt-builder file.

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';
import {
  BLOB_REGISTRY_PORT,
  LLMResponseError,
  type BlobRegistryPort,
  type CharacterBible,
  type GeminiPort,
  type ModelTier,
  type NarrateRequest,
  type NarrateResult,
  type Scene,
} from '@mc/domain';
import { KeyRotatorService } from '../key-rotator/key-rotator.service';
import { LruCache } from '../cache/lru-cache';
import {
  BIBLE_PROMPT,
  buildAccuracyIssuesPrompt,
  buildNarratePrompt,
  buildPolishPrompt,
  buildStructuralPrompt,
  parseNumberedLines,
} from './gemini-prompts';

const BibleSchema = z.object({
  characters: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      aliases: z.array(z.string()).default([]),
    }),
  ),
  setting: z.string(),
  tone: z.string(),
});

const MODEL_BY_TIER: Record<ModelTier, string> = {
  flash: 'gemini-2.0-flash',
  'flash-lite': 'gemini-2.0-flash-lite',
  pro: 'gemini-2.5-pro',
};

@Injectable({ providedIn: 'root' })
export class GeminiAdapter implements GeminiPort {
  private readonly http = inject(HttpClient);
  private readonly keys = inject(KeyRotatorService);
  private readonly blobs: BlobRegistryPort = inject(BLOB_REGISTRY_PORT);

  // Per-session prompt→response cache (§11). A cache hit short-circuits
  // the HTTP call *and* the key pick, so resumed/retried runs spend no
  // quota re-deriving identical bibles, polishes, or narrations.
  private readonly cache = new LruCache<string>(200);

  async buildBible(panelBytesRefs: readonly string[], tier: ModelTier): Promise<CharacterBible> {
    const parts: GeminiContentPart[] = [{ text: BIBLE_PROMPT }];
    for (const ref of panelBytesRefs.slice(0, 30)) {
      const buf = await this.blobs.get(ref);
      if (!buf) continue;
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: arrayBufferToBase64(buf),
        },
      });
    }

    const body: GeminiRequest = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    };

    const text = await this.generate(MODEL_BY_TIER[tier], body, 'buildBible', 'bible');

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new LLMResponseError('Gemini bible response was not valid JSON', err);
    }

    const result = BibleSchema.safeParse(parsed);
    if (!result.success) {
      throw new LLMResponseError('Gemini bible response did not match schema', result.error);
    }
    return result.data;
  }

  async narrate(req: NarrateRequest): Promise<NarrateResult> {
    const prompt = buildNarratePrompt(req.panelBytesRefs.length, req.bible, req.previousScript);

    const parts: GeminiContentPart[] = [{ text: prompt }];
    for (const ref of req.panelBytesRefs) {
      const buf = await this.blobs.get(ref);
      if (!buf) continue;
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: arrayBufferToBase64(buf),
        },
      });
    }

    const model = MODEL_BY_TIER[req.tier];
    const body: GeminiRequest = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.85,
        topP: 0.95,
      },
    };

    const text = await this.generate(model, body, 'narrate', 'narrate');
    return { narration: text, modelUsed: model, tokensIn: 0, tokensOut: 0 };
  }
  async polishScript(script: string, bible: CharacterBible, tier: ModelTier): Promise<string> {
    return this.rewriteParagraphs({
      script,
      stageName: 'polish',
      buildPrompt: (n, numbered) => buildPolishPrompt(n, bible, numbered),
      tier,
      temperature: 0.7,
      topP: 0.92,
    });
  }

  async structuralEdit(script: string, bible: CharacterBible, tier: ModelTier): Promise<string> {
    return this.rewriteParagraphs({
      script,
      stageName: 'structuralEdit',
      buildPrompt: (n, numbered) => buildStructuralPrompt(n, bible, numbered),
      tier,
      temperature: 0.85,
      topP: 0.95,
    });
  }

  async checkAccuracy(
    script: string,
    _scenes: readonly Scene[],
    tier: ModelTier,
  ): Promise<{ issues: readonly string[] }> {
    const paragraphs = splitParagraphs(script);
    if (paragraphs.length === 0) return { issues: [] };
    const numbered = paragraphs.map((p, i) => `${i + 1}. ${p}`).join('\n\n');

    const body: GeminiRequest = {
      contents: [{ role: 'user', parts: [{ text: buildAccuracyIssuesPrompt(numbered) }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.4,
        topP: 0.9,
      },
    };

    const text = await this.generate(MODEL_BY_TIER[tier], body, 'checkAccuracy', 'accuracy');

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new LLMResponseError('Gemini accuracy response was not valid JSON', err);
    }
    const result = AccuracyIssuesSchema.safeParse(parsed);
    if (!result.success) {
      throw new LLMResponseError('Gemini accuracy response did not match schema', result.error);
    }
    return { issues: result.data.issues };
  }

  private async rewriteParagraphs(opts: {
    script: string;
    stageName: 'polish' | 'structuralEdit';
    buildPrompt: (n: number, numbered: string) => string;
    tier: ModelTier;
    temperature: number;
    topP: number;
  }): Promise<string> {
    const paragraphs = splitParagraphs(opts.script);
    if (paragraphs.length === 0) return opts.script;
    const numbered = paragraphs.map((p, i) => `${i + 1}. ${p}`).join('\n\n');
    const prompt = opts.buildPrompt(paragraphs.length, numbered);

    const body: GeminiRequest = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: opts.temperature, topP: opts.topP },
    };

    const text = await this.generate(
      MODEL_BY_TIER[opts.tier],
      body,
      opts.stageName,
      opts.stageName,
    );

    const rewritten = parseNumberedLines(text);
    // SRT-sync invariant: if Gemini drifted on paragraph count, fall
    // back to the input rather than break panel↔paragraph alignment.
    if (rewritten.length !== paragraphs.length || rewritten.some((p) => p.trim().length === 0)) {
      return opts.script;
    }
    return rewritten.join('\n\n');
  }

  /**
   * Single HTTP path for every Gemini call. Checks the per-session
   * cache first; on a miss it picks a live key, POSTs, extracts the
   * candidate text, and caches it. `callLabel` shapes the failure
   * message, `emptyNoun` the empty-response message — both preserve the
   * original per-stage wording.
   */
  private async generate(
    model: string,
    body: GeminiRequest,
    callLabel: string,
    emptyNoun: string,
  ): Promise<string> {
    const cacheKey = cacheKeyFor(model, body);
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) return cached;

    const key = this.keys.pickGeminiKey();
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${model}:generateContent?key=${encodeURIComponent(key.secret)}`;

    let raw: GeminiResponse;
    try {
      raw = await firstValueFrom(this.http.post<GeminiResponse>(url, body));
    } catch (err) {
      throw new LLMResponseError(`Gemini ${callLabel} call failed`, err);
    }

    const text = raw.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new LLMResponseError(`Gemini returned empty ${emptyNoun} response`);

    this.cache.set(cacheKey, text);
    return text;
  }
}

/**
 * Stable cache key for a request. The request body carries the prompt,
 * generation config, and (for image stages) base64 panel bytes, so a
 * hash over its JSON uniquely identifies the call. Two independent
 * hashes plus the byte length make a false hit astronomically unlikely
 * for a 200-entry session cache, without retaining the megabytes of
 * base64 the raw key would.
 */
function cacheKeyFor(model: string, body: GeminiRequest): string {
  const json = JSON.stringify(body);
  return `${model}:${json.length}:${fnv1a(json)}:${sdbm(json)}`;
}

function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function sdbm(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h, 65599) + str.charCodeAt(i);
    h |= 0;
  }
  return (h >>> 0).toString(36);
}

const AccuracyIssuesSchema = z.object({
  issues: z.array(z.string()),
});

/**
 * Split a multi-scene script into a flat paragraph list. Each scene's
 * Gemini response is already "1. p1\n\n2. p2\n\n..." but the numbers
 * reset per scene; parseNumberedLines strips and flattens them.
 *
 * Tolerates scripts that have already been re-joined (post-polish):
 * if no numbered blocks are detected, falls back to splitting on
 * blank lines.
 */
function splitParagraphs(script: string): string[] {
  const numbered = parseNumberedLines(script);
  if (numbered.length > 0) return numbered;
  return script
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

// ─── Wire types ───────────────────────────────────────────────────────

interface GeminiContentPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}
interface GeminiRequest {
  contents: readonly { role: 'user' | 'model'; parts: readonly GeminiContentPart[] }[];
  generationConfig?: { responseMimeType?: string; temperature?: number; topP?: number };
}
interface GeminiResponse {
  candidates?: readonly {
    content?: { parts?: readonly { text?: string }[] };
  }[];
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
