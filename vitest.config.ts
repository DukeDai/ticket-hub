import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Vitest configuration.
 *
 * Design notes:
 *  - Default environment is node. Strategy/service/schema tests do not need DOM.
 *  - Component tests can switch per file with a happy-dom env comment.
 *  - The alias mirrors tsconfig.json paths so source imports resolve in tests.
 *  - Coverage excludes barrelled index files and test files themselves.
 *  - setupFiles sets MONGODB_URI placeholder so db.ts does not throw at module eval time;
 *    real URI (in-memory server) injected by setupTestDB() in each test file.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./test-setup.ts'],
    hookTimeout: 300000,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/*.spec.ts', 'src/**/*.spec.tsx'],
    exclude: ['node_modules', '.next', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      include: [
        'src/lib/strategies/**',
        'src/lib/validation/**',
        'src/lib/middleware/**',
        'src/lib/services/**',
        'src/lib/auth/**',
        'src/lib/utils/**',
        'src/models/**',
      ],
      exclude: [
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.spec.ts',
        '**/*.spec.tsx',
        '**/index.ts',
        'src/__tests__/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
