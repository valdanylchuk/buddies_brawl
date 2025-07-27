// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // This line is the magic!
    environment: 'jsdom',
  },
});