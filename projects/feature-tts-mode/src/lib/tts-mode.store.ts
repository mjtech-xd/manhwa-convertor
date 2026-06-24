// TTS mode signal store.
// Manages voice selection, per-line render progress, and final output
// (MP3 + SRT blob refs). The actual rendering is delegated to
// TtsRenderTrackUseCase (which calls the Ai33Adapter → Electron stitch).

import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { BLOB_REGISTRY_PORT, TTS_PORT, ChapterId, type BlobRegistryPort, type TtsPort } from '@mc/domain';
import { TtsRenderTrackUseCase } from 'application';

export type LineStatus = 'pending' | 'running' | 'done' | 'failed';

export interface TtsLine {
  readonly index: number;
  readonly text: string;
  readonly status: LineStatus;
  readonly error: string | null;
}

export type RenderStatus = 'idle' | 'running' | 'done' | 'failed' | 'cancelled';

export interface TtsModeState {
  readonly script: string;
  readonly selectedVoiceId: string;
  readonly voices: readonly { id: string; name: string }[];
  readonly voicesStatus: 'idle' | 'loading' | 'ready' | 'failed';
  readonly voicesError: string | null;
  readonly lines: readonly TtsLine[];
  readonly renderStatus: RenderStatus;
  readonly cancelRequested: boolean;
  readonly mp3Ref: string | null;
  readonly srtText: string | null;
  readonly durationSec: number | null;
  readonly suggestedName: string | null;
}

const initial: TtsModeState = {
  script: '',
  selectedVoiceId: '',
  voices: [],
  voicesStatus: 'idle',
  voicesError: null,
  lines: [],
  renderStatus: 'idle',
  cancelRequested: false,
  mp3Ref: null,
  srtText: null,
  durationSec: null,
  suggestedName: null,
};

export const TtsModeStore = signalStore(
  { providedIn: 'root' },
  withState<TtsModeState>(initial),
  withComputed(({ lines }) => ({
    doneCount: computed(() => lines().filter((l) => l.status === 'done').length),
    failedCount: computed(() => lines().filter((l) => l.status === 'failed').length),
  })),
  withMethods((store) => {
    const blobs = inject(BLOB_REGISTRY_PORT) as BlobRegistryPort;
    const ttsPort = inject(TTS_PORT) as TtsPort;
    const renderUc = inject(TtsRenderTrackUseCase);

    const revoke = (): void => {
      const mp3 = store.mp3Ref();
      if (mp3) blobs.revoke(mp3);
    };

    return {
      setScript(script: string): void {
        revoke();
        patchState(store, {
          script,
          lines: [],
          renderStatus: 'idle',
          cancelRequested: false,
          mp3Ref: null,
          srtText: null,
          durationSec: null,
          suggestedName: null,
        });
      },

      selectVoice(voiceId: string): void {
        patchState(store, { selectedVoiceId: voiceId });
      },

      async loadVoices(): Promise<void> {
        if (store.voicesStatus() === 'loading') return;
        patchState(store, { voicesStatus: 'loading', voicesError: null });
        try {
          const voices = await ttsPort.listVoices();
          patchState(store, {
            voices,
            voicesStatus: 'ready',
            selectedVoiceId: store.selectedVoiceId() || (voices[0]?.id ?? ''),
          });
        } catch (err) {
          patchState(store, {
            voicesStatus: 'failed',
            voicesError: err instanceof Error ? err.message : String(err),
          });
        }
      },

      cancel(): void {
        if (store.renderStatus() === 'running') {
          patchState(store, { cancelRequested: true });
        }
      },

      reset(): void {
        revoke();
        patchState(store, initial);
      },

      async render(scriptName?: string): Promise<void> {
        if (store.renderStatus() === 'running') return;
        const script = store.script().trim();
        const voiceId = store.selectedVoiceId();
        if (!script || !voiceId) return;

        revoke();

        const rawLines = script.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
        patchState(store, {
          renderStatus: 'running',
          cancelRequested: false,
          mp3Ref: null,
          srtText: null,
          durationSec: null,
          suggestedName: null,
          lines: rawLines.map((text, i) => ({ index: i, text, status: 'pending', error: null })),
        });

        const markLine = (index: number, update: Partial<TtsLine>): void => {
          patchState(store, (s) => ({
            lines: s.lines.map((l) => (l.index === index ? { ...l, ...update } : l)),
          }));
        };

        try {
          const result = await renderUc.execute({
            chapterId: ChapterId(`tts-${Date.now().toString(36)}`),
            script,
            voiceId,
            isCancelled: () => store.cancelRequested(),
            onLine: (e) => {
              markLine(e.index, {
                status: e.status,
                error: e.error ?? null,
              });
              // Mark the next pending line as running (visual feedback).
              const lines = store.lines();
              const next = lines.find((l, i) => i > e.index && l.status === 'pending');
              if (next) markLine(next.index, { status: 'running' });
            },
          });

          // Mark all still-pending lines (shouldn't happen, but safety net).
          patchState(store, (s) => ({
            lines: s.lines.map((l) =>
              l.status === 'pending' || l.status === 'running'
                ? { ...l, status: 'failed' as LineStatus, error: 'Not reached' }
                : l,
            ),
          }));

          patchState(store, {
            renderStatus: store.cancelRequested() ? 'cancelled' : 'done',
            cancelRequested: false,
            mp3Ref: result.track.mp3Ref,
            srtText: result.track.srt,
            durationSec: result.track.durationSec,
            suggestedName: scriptName
              ? `${scriptName.replace(/\.txt$/i, '')}.mp3`
              : 'output.mp3',
          });
        } catch (err) {
          patchState(store, {
            renderStatus: store.cancelRequested() ? 'cancelled' : 'failed',
            cancelRequested: false,
          });
          // Surface the error on any still-running line.
          const msg = err instanceof Error ? err.message : String(err);
          patchState(store, (s) => ({
            lines: s.lines.map((l) =>
              l.status === 'running' ? { ...l, status: 'failed' as LineStatus, error: msg } : l,
            ),
          }));
        }
      },
    };
  }),
);
