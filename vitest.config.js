import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: [
      'tests/cloud-rescue/**/*.test.js',
      'tests/flappy-cloud-game/**/*.test.js',
    ],
    setupFiles: ['tests/cloud-rescue/setup.js'],
    clearMocks: true,
    restoreMocks: false,
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
