import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'packages/*/tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@ehsebhaly/types': path.resolve(__dirname, 'packages/types/src/index.ts'),
      '@ehsebhaly/schemas': path.resolve(__dirname, 'packages/schemas/src/index.ts'),
      '@ehsebhaly/calculations': path.resolve(__dirname, 'packages/calculations/src/index.ts'),
      '@ehsebhaly/ai': path.resolve(__dirname, 'packages/ai/src/index.ts'),
      '@': path.resolve(__dirname, 'apps/web'),
    },
  },
});
