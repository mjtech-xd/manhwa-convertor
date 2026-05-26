// Single entry point the renderer's app.config.ts calls to wire every
// port to its adapter. Keeps the shell free of infrastructure imports.

import { type EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  BLOB_REGISTRY_PORT,
  EVENT_BUS_PORT,
  GEMINI_PORT,
  IMAGE_FILTER_PORT,
  PDF_RASTERISER_PORT,
} from 'domain';
import { BlobRegistryService } from './blob-registry/blob-registry.service';
import { EventBusService } from './event-bus/event-bus.service';
import { GeminiAdapter } from './gemini/gemini.adapter';
import { errorMappingInterceptor } from './interceptors/error-mapping.interceptor';
import { ImageFilterAdapter } from './ipc/image-filter.adapter';
import { PdfRasteriserAdapter } from './ipc/pdf-rasteriser.adapter';

export function provideInfrastructure(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideHttpClient(withInterceptors([errorMappingInterceptor])),
    { provide: BLOB_REGISTRY_PORT, useExisting: BlobRegistryService },
    { provide: EVENT_BUS_PORT, useExisting: EventBusService },
    { provide: PDF_RASTERISER_PORT, useExisting: PdfRasteriserAdapter },
    { provide: IMAGE_FILTER_PORT, useExisting: ImageFilterAdapter },
    { provide: GEMINI_PORT, useExisting: GeminiAdapter },
  ]);
}
