import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import en from './messages/en.json';
import es from './messages/es.json';

const MESSAGES = { en, es } as const;
type Locale = keyof typeof MESSAGES;

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() =>
    navigator.language.startsWith('es') ? 'es' : 'en',
  );

  const value = useMemo<I18nContextValue>(() => {
    const dict = MESSAGES[locale] as Record<string, string>;
    return { locale, setLocale, t: (key: string) => dict[key] ?? key };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useT must be used within <I18nProvider>');
  return ctx;
}
