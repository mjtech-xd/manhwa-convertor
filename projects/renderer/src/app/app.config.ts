import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import {
  lucideBug,
  lucideCheck,
  lucideDownload,
  lucideEye,
  lucideEyeOff,
  lucideFileText,
  lucideFolder,
  lucideKey,
  lucideLayers,
  lucideMic,
  lucideRefreshCcw,
  lucideSettings,
  lucideTrash2,
  lucideTriangleAlert,
  lucideUpload,
  lucideX,
} from '@ng-icons/lucide';
import { provideInfrastructure } from 'infrastructure';

import { routes } from './app.routes';

// Single registry of icons available across the whole app. Add new ones
// here when a feature first needs them — keeps the bundle tree-shakeable.
const ICONS = {
  lucideBug,
  lucideCheck,
  lucideDownload,
  lucideEye,
  lucideEyeOff,
  lucideFileText,
  lucideFolder,
  lucideKey,
  lucideLayers,
  lucideMic,
  lucideRefreshCcw,
  lucideSettings,
  lucideTrash2,
  lucideTriangleAlert,
  lucideUpload,
  lucideX,
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideIcons(ICONS),
    provideInfrastructure(),
  ],
};
