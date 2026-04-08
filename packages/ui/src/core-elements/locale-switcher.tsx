'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import './locale-switcher.css';

const DEFAULT_FLAGS: Record<string, string> = {
  de: '🇩🇪',
  en: '🇺🇸',
  es: '🇲🇽',
  fr: '🇫🇷',
  pt: '🇧🇷',
};

const DEFAULT_LABELS: Record<string, string> = {
  de: 'DE',
  en: 'EN',
  es: 'ES',
  fr: 'FR',
  pt: 'PT',
};

interface LocaleSwitcherProps {
  /** All available locale codes (e.g. ['en', 'es', 'fr']). */
  locales: readonly string[];
  /** The currently active locale code. */
  currentLocale: string;
  /**
   * Optional flag emoji overrides keyed by locale code.
   * Falls back to DEFAULT_FLAGS for known locales, then '🌐'.
   */
  flags?: Record<string, string>;
  /**
   * Optional display-label overrides keyed by locale code.
   * Falls back to DEFAULT_LABELS for known locales, then locale.toUpperCase().
   */
  labels?: Record<string, string>;
}

export function LocaleSwitcher({
  locales,
  currentLocale,
  flags,
  labels,
}: LocaleSwitcherProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  const resolvedFlags = { ...DEFAULT_FLAGS, ...flags };
  const resolvedLabels = { ...DEFAULT_LABELS, ...labels };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const switchLocale = (locale: string) => {
    const segments = pathname.split('/');
    segments[1] = locale;
    router.push(segments.join('/'));
    setOpen(false);
  };

  const currentFlag = resolvedFlags[currentLocale] ?? '🌐';
  const currentLabel =
    resolvedLabels[currentLocale] ?? currentLocale.toUpperCase();

  return (
    <div className="locale-switcher" ref={ref}>
      <button
        className="locale-switcher__trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Language: ${currentLabel}`}
        type="button"
      >
        <span className="locale-switcher__flag" aria-hidden="true">
          {currentFlag}
        </span>
        <span className="locale-switcher__label">{currentLabel}</span>
        <span className="locale-switcher__arrow" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <ul className="locale-switcher__dropdown" role="listbox">
          {locales.map((locale) => (
            <li
              key={locale}
              className={`locale-switcher__option${locale === currentLocale ? ' locale-switcher__option--active' : ''}`}
              role="option"
              aria-selected={locale === currentLocale}
              onClick={() => switchLocale(locale)}
            >
              <span className="locale-switcher__flag" aria-hidden="true">
                {resolvedFlags[locale] ?? '🌐'}
              </span>
              <span className="locale-switcher__label">
                {resolvedLabels[locale] ?? locale.toUpperCase()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
