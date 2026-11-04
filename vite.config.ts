import { defineConfig } from 'vite';


export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        content: 'src/extension/content.ts',
        'service-worker': 'src/extension/service-worker.ts'
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true
  }
});
