/**
 * Minimal i18n setup for the Jest test environment.
 *
 * Initializes i18next with the English translation bundle so that
 * component tests render real English text (not raw translation keys).
 * Import this file early — either in a jest setup file or at the top
 * of individual test files that render i18n-aware components.
 */

import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from '../i18n/locales/en.json';

if (!i18next.isInitialized) {
  i18next.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}
