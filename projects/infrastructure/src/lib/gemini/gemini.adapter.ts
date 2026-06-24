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

  async buildBible(
    panelBytesRefs: readonly string[],
    tier: ModelTier,
  ): Promise<CharacterBible> {
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

    const key = this.keys.pickGeminiKey();
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${MODEL_BY_TIER[tier]}:generateContent?key=${encodeURIComponent(key.secret)}`;

    const body: GeminiRequest = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    };

    let raw: GeminiResponse;
    try {
      raw = await firstValueFrom(this.http.post<GeminiResponse>(url, body));
    } catch (err) {
      throw new LLMResponseError('Gemini buildBible call failed', err);
    }

    const text = raw.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new LLMResponseError('Gemini returned empty bible response');

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

    const key = this.keys.pickGeminiKey();
    const model = MODEL_BY_TIER[req.tier];
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${model}:generateContent?key=${encodeURIComponent(key.secret)}`;

    const body: GeminiRequest = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.85,
        topP: 0.95,
      },
    };

    let raw: GeminiResponse;
    try {
      raw = await firstValueFrom(this.http.post<GeminiResponse>(url, body));
    } catch (err) {
      throw new LLMResponseError('Gemini narrate call failed', err);
    }

    const text = raw.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new LLMResponseError('Gemini returned empty narrate response');

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

    const key = this.keys.pickGeminiKey();
    const model = MODEL_BY_TIER[tier];
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${model}:generateContent?key=${encodeURIComponent(key.secret)}`;

    const body: GeminiRequest = {
      contents: [{ role: 'user', parts: [{ text: buildAccuracyIssuesPrompt(numbered) }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.4,
        topP: 0.9,
      },
    };

    let raw: GeminiResponse;
    try {
      raw = await firstValueFrom(this.http.post<GeminiResponse>(url, body));
    } catch (err) {
      throw new LLMResponseError('Gemini checkAccuracy call failed', err);
    }

    const text = raw.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new LLMResponseError('Gemini returned empty accuracy response');

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

    const key = this.keys.pickGeminiKey();
    const model = MODEL_BY_TIER[opts.tier];
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${model}:generateContent?key=${encodeURIComponent(key.secret)}`;

    const body: GeminiRequest = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: opts.temperature, topP: opts.topP },
    };

    let raw: GeminiResponse;
    try {
      raw = await firstValueFrom(this.http.post<GeminiResponse>(url, body));
    } catch (err) {
      throw new LLMResponseError(`Gemini ${opts.stageName} call failed`, err);
    }

    const text = raw.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new LLMResponseError(`Gemini returned empty ${opts.stageName} response`);

    const rewritten = parseNumberedLines(text);
    // SRT-sync invariant: if Gemini drifted on paragraph count, fall
    // back to the input rather than break panel↔paragraph alignment.
    if (rewritten.length !== paragraphs.length || rewritten.some((p) => p.trim().length === 0)) {
      return opts.script;
    }
    return rewritten.join('\n\n');
  }
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
