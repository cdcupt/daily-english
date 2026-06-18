import { defineConfig } from 'vitest/config';

/**
 * Hermetic test setup. setupFiles run before any test module (and therefore
 * before src/env.ts is first evaluated), so OAuth client ids are present as the
 * allowed JWT audiences when the verifier tests mint + check tokens. No network.
 */
export default defineConfig({
  test: {
    setupFiles: ['./test/setup.ts'],
  },
});
