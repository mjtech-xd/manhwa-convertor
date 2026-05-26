import { Injectable, inject } from '@angular/core';
import { TTS_PORT, type ChapterId, type VoiceTrack } from 'domain';

export interface TtsRenderTrackInput {
  readonly chapterId: ChapterId;
  readonly script: string;
  readonly voiceId: string;
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
