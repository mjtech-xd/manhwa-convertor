import { Injectable, inject } from '@angular/core';
import { TTS_PORT, type ChapterId, type TtsLineEvent, type VoiceTrack } from '@mc/domain';

export interface TtsRenderTrackInput {
  readonly chapterId: ChapterId;
  readonly script: string;
  readonly voiceId: string;
  /** Milliseconds of silence inserted between lines. */
  readonly silenceMs?: number;
  /** Fired after each line completes (success or fail). */
  readonly onLine?: (event: TtsLineEvent) => void;
  /** Checked between lines; returning true aborts cleanly. */
  readonly isCancelled?: () => boolean;
}

export interface TtsRenderTrackOutput {
  readonly track: VoiceTrack;
}

@Injectable({ providedIn: 'root' })
export class TtsRenderTrackUseCase {
  private readonly tts = inject(TTS_PORT);

  async execute(input: TtsRenderTrackInput): Promise<TtsRenderTrackOutput> {
    const track = await this.tts.render(input);
    return { track };
  }
}
