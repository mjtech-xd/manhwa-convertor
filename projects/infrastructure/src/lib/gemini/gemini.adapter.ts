// Gemini adapter — implements GeminiPort.
// Phase 3 covers only buildBible(); narrate/polish/structural/accuracy
// follow in later phases. Method shells throw so use-cases compile.

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
} from 'domain';
import { KeyRotatorService } from '../key-rotator/key-rotator.service';
import { BIBLE_PROMPT } from './gemini-prompts';

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

  async narrate(_req: NarrateRequest): Promise<NarrateResult> {
    throw new LLMResponseError('GeminiAdapter.narrate() is not implemented in Phase 3.');
  }
  async polishScript(_script: string, _tier: ModelTier): Promise<string> {
    throw new LLMResponseError('GeminiAdapter.polishScript() is not implemented in Phase 3.');
  }
  async structuralEdit(_script: string, _tier: ModelTier): Promise<string> {
    throw new LLMResponseError('GeminiAdapter.structuralEdit() is not implemented in Phase 3.');
  }
  async checkAccuracy(
    _script: string,
    _scenes: readonly Scene[],
    _tier: ModelTier,
  ): Promise<{ issues: readonly string[] }> {
    throw new LLMResponseError('GeminiAdapter.checkAccuracy() is not implemented in Phase 3.');
  }
}

// ─── Wire types ───────────────────────────────────────────────────────

interface GeminiContentPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}
interface GeminiRequest {
  contents: readonly { role: 'user' | 'model'; parts: readonly GeminiContentPart[] }[];
  generationConfig?: { responseMimeType?: string; temperature?: number };
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
