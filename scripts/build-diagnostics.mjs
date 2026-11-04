import { build } from 'vite';
await build({ configFile: false, publicDir: false, build: {
  outDir: 'tests/manual/generated', emptyOutDir: false,
  lib: { entry: 'tests/manual/clipboard-diagnostic.ts', name: 'PasteFitDiagnostic', formats: ['iife'], fileName: () => 'clipboard-diagnostic.js' }
} });
