export interface Language {
  code: string;
  name: string;
  nativeName: string;
}

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'zh-Hans', name: 'Chinese (Mandarin)', nativeName: '中文（简体）' },
];

export const SUPPORTED_LOCALE_CODES = SUPPORTED_LANGUAGES.map((l) => l.code);
