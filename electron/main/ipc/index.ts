import { registerPdfHandlers } from './pdf';
import { registerImageHandlers } from './image';

export function registerIpcHandlers(): void {
  registerPdfHandlers();
  registerImageHandlers();
}
