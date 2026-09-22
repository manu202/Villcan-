import { defineConfig } from 'vitest/config';
import path from 'path';

// Separate config for tests/integration/**: real @supabase/supabase-js
// clients against the local Supabase stack (no jsdom, no component mocks).
// Run with: npm run test:integration
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
