/**
 * Test-time stub for `src/i18n/i18n.ts`.
 *
 * Mapped in `jest.config.js` via `moduleNameMapper`. Production consumers
 * import the real module, which eagerly loads @formatjs/* polyfills using
 * ESM syntax that Jest's default transform can't parse. In the test
 * environment we replace the whole module with the already-initialized
 * i18next instance (set up by `src/test-utils/i18nSetup.ts`).
 */
import i18next from 'i18next';

export default i18next;
