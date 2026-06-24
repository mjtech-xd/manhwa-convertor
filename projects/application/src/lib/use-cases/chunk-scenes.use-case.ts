import { Injectable } from '@angular/core';
import { SceneId, type FilteredPage } from '@mc/domain';

export interface ChunkScenesInput {
  readonly pages: readonly FilteredPage[];
  readonly targetPanelsPerScene?: number;     // default 6
}

export interface SceneChunk {
  readonly id: ReturnType<typeof SceneId>;
  readonly panelIndices: readonly number[];
}

export interface ChunkScenesOutput {
  readonly scenes: readonly SceneChunk[];
}

@Injectable({ providedIn: 'root' })
export class ChunkScenesUseCase {
  execute(input: ChunkScenesInput): ChunkScenesOutput {
    const target = input.targetPanelsPerScene ?? 6;
    const kept = input.pages.filter((p) => p.kept);
    const scenes: SceneChunk[] = [];
    for (let i = 0; i < kept.length; i += target) {
      const slice = kept.slice(i, i + target);
      scenes.push({
        id: SceneId(`scene-${i / target}`),
        panelIndices: slice.map((p) => p.index),
      });
    }
    return { scenes };
  }
}
