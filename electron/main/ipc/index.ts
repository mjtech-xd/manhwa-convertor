import { registerPdfHandlers } from './pdf.js';
import { registerImageHandlers } from './image.js';
import { registerCheckpointHandlers } from './checkpoint.js';

export function registerIpcHandlers(): void {
  registerPdfHandlers();
  registerImageHandlers();
  registerCheckpointHandlers();
}
