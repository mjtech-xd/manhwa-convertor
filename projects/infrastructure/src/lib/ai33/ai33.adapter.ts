// ai33.pro TTS adapter — implements TtsPort.
// ai33.pro is an ElevenLabs-compatible aggregator with async TTS tasks:
//   POST /v1/text-to-speech/{voiceId} → {task_id}
//   GET  /v1/task/{taskId}            → {status, metadata.audio_url}
//   GET  /v2/voices                   → {voices: [...]}
//
// For stitching: audio URLs go to the Electron main process (which has
// no CSP restrictions) via bridge.audio.stitch(). The main process
// fetches, concatenates with ffmpeg, and returns raw mp3 bytes.

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';
import {
  BLOB_REGISTRY_PORT,
  TtsRenderError,
  type BlobRegistryPort,
  type ChapterId,
  type TtsLineEvent,
  type TtsPort,
  type TtsRenderRequest,
  type VoiceTrack,
} from '@mc/domain';
import type { AudioStitchResponse } from 'shared-ipc';
import { requireBridge } from '../ipc/bridge';
import { KeyRotatorService } from '../key-rotator/key-rotator.service';

const BASE_URL = 'https://api.ai33.pro';
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000;

const VoiceListSchema = z.union([
  z.object({ voices: z.array(z.object({ voice_id: z.string(), name: z.string() })) }),
  z.array(z.object({ voice_id: z.string(), name: z.string() })),
]);

const TaskSchema = z.object({
  status: z.string(),
  error_message: z.string().nullish(),
  metadata: z.object({ audio_url: z.string().optional() }).optional(),
});

@Injectable({ providedIn: 'root' })
export class Ai33Adapter implements TtsPort {
  private readonly http = inject(HttpClient);
  private readonly blobs: BlobRegistryPort = inject(BLOB_REGISTRY_PORT);
  private readonly keys = inject(KeyRotatorService);

  async listVoices(): Promise<readonly { id: string; name: string }[]> {
    const apiKey = this.keys.pickAi33Key();
    const raw = await firstValueFrom(
      this.http.get(`${BASE_URL}/v2/voices`, {
        headers: { 'xi-api-key': apiKey.secret },
      }),
    );
    const parsed = VoiceListSchema.parse(raw);
    const voices = Array.isArray(parsed) ? parsed : parsed.voices;
    return voices.map((v) => ({ id: v.voice_id, name: v.name }));
  }

  async render(req: TtsRenderRequest): Promise<VoiceTrack> {
    const lines = splitLines(req.script);
    if (lines.length === 0) throw new TtsRenderError('Script has no renderable lines');

    const silenceMs = req.silenceMs ?? 400;
    const audioUrls: string[] = [];
    const successTexts: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (req.isCancelled?.()) throw new TtsRenderError('TTS render cancelled');
      const line = lines[i]!;
      try {
        const url = await this.renderLine(req.voiceId, line);
        audioUrls.push(url);
        successTexts.push(line);
        req.onLine?.({ index: i, total: lines.length, status: 'done' } satisfies TtsLineEvent);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        req.onLine?.({ index: i, total: lines.length, status: 'failed', error: msg });
        // Non-fatal: skip failed lines rather than aborting the whole render.
      }
    }

    if (audioUrls.length === 0) throw new TtsRenderError('All lines failed to render');

    const bridge = requireBridge();
    let stitched: AudioStitchResponse;
    try {
      stitched = (await bridge.audio.stitch({
        segmentUrls: audioUrls,
        sentenceTexts: successTexts,
        silenceMs,
      })) as AudioStitchResponse;
    } catch (err) {
      throw new TtsRenderError('Audio stitch failed', err);
    }

    const mp3Ref = this.blobs.put(stitched.mp3Bytes, 'audio/mpeg');
    return {
      chapterId: req.chapterId as ChapterId,
      voiceId: req.voiceId,
      mp3Ref,
      srt: stitched.srt,
      durationSec: stitched.durationSec,
    };
  }

  private async renderLine(voiceId: string, text: string): Promise<string> {
    const apiKey = this.keys.pickAi33Key();
    const url = `${BASE_URL}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
    const created = await firstValueFrom(
      this.http.post<{ task_id?: string }>(url, {
        text,
        model_id: 'eleven_multilingual_v2',
      }, {
        headers: { 'xi-api-key': apiKey.secret },
      }),
    );
    if (!created.task_id) throw new TtsRenderError('TTS task creation returned no task_id');
    return this.pollTask(created.task_id, apiKey.secret);
  }

  private async pollTask(taskId: string, apiKey: string): Promise<string> {
    const start = Date.now();
    while (Date.now() - start < POLL_TIMEOUT_MS) {
      await delay(POLL_INTERVAL_MS);
      const raw = await firstValueFrom(
        this.http.get(`${BASE_URL}/v1/task/${encodeURIComponent(taskId)}`, {
          headers: { 'xi-api-key': apiKey },
        }),
      );
      const task = TaskSchema.parse(raw);
      if (task.status === 'done') {
        const audioUrl = task.metadata?.audio_url;
        if (!audioUrl) throw new TtsRenderError(`Task ${taskId} done but no audio_url`);
        return audioUrl;
      }
      if (task.status === 'failed') {
        throw new TtsRenderError(task.error_message ?? `Task ${taskId} failed`);
      }
    }
    throw new TtsRenderError(`Task ${taskId} timed out after ${POLL_TIMEOUT_MS / 1000}s`);
  }
}

function splitLines(script: string): string[] {
  return script.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
