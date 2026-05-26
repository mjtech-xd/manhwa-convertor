import type { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'single' },
  {
    path: 'single',
    loadComponent: () => import('feature-single-mode').then((m) => m.SingleModePage),
    title: 'Single — Manhwa Convertor',
  },
  {
    path: 'bulk',
    loadComponent: () => import('feature-bulk-mode').then((m) => m.BulkModePage),
    title: 'Bulk — Manhwa Convertor',
  },
  {
    path: 'tts',
    loadComponent: () => import('feature-tts-mode').then((m) => m.TtsModePage),
    title: 'TTS — Manhwa Convertor',
  },
  {
    path: 'settings',
    loadComponent: () => import('feature-settings').then((m) => m.SettingsPage),
    title: 'Settings — Manhwa Convertor',
  },
  {
    path: 'debug',
    loadComponent: () => import('feature-debug').then((m) => m.DebugPage),
    title: 'Debug — Manhwa Convertor',
  },
  { path: '**', redirectTo: 'single' },
];
