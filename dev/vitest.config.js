import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['js/**/*.js'],
      exclude: [
        'js/core/app-shell.js',      // heavy DOM shell, covered by e2e
        'js/modules/**/portfolio-ui.js',
        'js/modules/**/habits-ui.js',
        'js/modules/**/ember-ui.js',
      ],
    },
  },
});
