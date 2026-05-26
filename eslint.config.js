// Flat ESLint config (ESLint 9+).
// Enforces clean-architecture layering via eslint-plugin-boundaries.
// Layer order (lower may NOT import higher):
//   domain → shared-ipc → ui-kit → application → infrastructure → feature-* → renderer
// Feature libs may not import other feature libs.

import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';
import boundaries from 'eslint-plugin-boundaries';

export default tseslint.config(
  {
    files: ['projects/**/*.ts', 'electron/**/*.ts'],
    extends: [
      ...tseslint.configs.recommended,
      ...tseslint.configs.stylistic,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'domain',         pattern: 'projects/domain' },
        { type: 'shared-ipc',     pattern: 'projects/shared-ipc' },
        { type: 'ui-kit',         pattern: 'projects/ui-kit' },
        { type: 'application',    pattern: 'projects/application' },
        { type: 'infrastructure', pattern: 'projects/infrastructure' },
        { type: 'feature',        pattern: 'projects/feature-*', capture: ['name'] },
        { type: 'renderer',       pattern: 'projects/renderer' },
        { type: 'electron',       pattern: 'electron' },
      ],
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'warn',
      '@angular-eslint/component-class-suffix': ['error', { suffixes: ['Component', 'Page'] }],
      '@angular-eslint/prefer-standalone': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='DomSanitizer'][callee.property.name=/^bypassSecurityTrust/]",
          message: 'bypassSecurityTrust* is forbidden. File a ticket — there is always a safer alternative.',
        },
        {
          selector: "NewExpression[callee.name='Function']",
          message: 'new Function() is banned (CSP / supply-chain risk).',
        },
      ],
      'no-eval': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            // Domain depends on nothing.
            { from: 'domain', allow: [] },
            // Shared-ipc depends on nothing.
            { from: 'shared-ipc', allow: [] },
            // UI kit is presentational only.
            { from: 'ui-kit', allow: [] },
            // Application orchestrates the domain.
            { from: 'application', allow: ['domain'] },
            // Infrastructure implements ports.
            { from: 'infrastructure', allow: ['domain', 'shared-ipc'] },
            // Feature libraries: own UI + business orchestration. May not import another feature.
            { from: 'feature', allow: ['domain', 'application', 'shared-ipc', 'ui-kit'] },
            // Renderer (the shell) wires everything together.
            { from: 'renderer', allow: ['feature', 'ui-kit', 'infrastructure', 'application', 'domain', 'shared-ipc'] },
            // Electron may share types with shared-ipc only (no Angular code).
            { from: 'electron', allow: ['shared-ipc', 'domain'] },
          ],
        },
      ],
    },
  },
  {
    files: ['projects/**/*.html'],
    extends: [
      ...angular.configs.templateRecommended,
      ...angular.configs.templateAccessibility,
    ],
  },
  {
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'boundaries/element-types': 'off',
    },
  },
  {
    ignores: ['dist/**', 'dist-electron/**', 'release/**', 'node_modules/**', '.angular/**'],
  },
);
