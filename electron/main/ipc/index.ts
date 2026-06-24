import { registerPdfHandlers } from './pdf.js';
import { registerImageHandlers } from './image.js';
import { registerAudioHandlers } from './audio.js';
import { registerCheckpointHandlers } from './checkpoint.js';

export function registerIpcHandlers(): void {
  registerPdfHandlers();
  registerImageHandlers();
  registerAudioHandlers();
  registerCheckpointHandlers();
}
