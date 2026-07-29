"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "@repo/i18n/navigation";
import "./locale-switcher.css";

const DEFAULT_FLAGS: Record<string, string> = {
  de: "🇩🇪",
  en: "🇺🇸",
  es: "🇲🇽",
  fr: "🇫🇷",
  pt: "🇧🇷",
};

const DEFAULT_LABELS: Record<string, string> = {
  de: "DE",
  en: "EN",
  es: "ES",
  fr: "FR",
  pt: "PT",
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
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /**
   * ⚠ **This must go through next-intl's router, not `next/navigation`'s.**
   *
   * This used to rewrite path segment 1 by hand and `router.push` the result.
   * It navigated correctly, but it skipped next-intl's `syncLocaleCookie` -
   * the client-side write of `NEXT_LOCALE` that only its own `Link`/`useRouter`
   * perform. The middleware does not cover for it either: `syncCookie` ignores
   * any request whose `Sec-Fetch-Dest` is not `document`, and a soft navigation
   * fetches RSC with `Sec-Fetch-Dest: empty`.
   *
   * So the URL became `/es` while the cookie stayed `en`, and every locale-less
   * href on the page then resolved through that stale cookie (`resolveLocale`
   * prio 2) and redirected the reader back to `/en`. Hence `replace(pathname,
   * { locale })`: `pathname` here is already locale-less - it comes from
   * next-intl's `usePathname` - and the router writes both the prefix and the
   * cookie.
   */
  const switchLocale = (locale: string) => {
    router.replace(pathname, { locale });
    setOpen(false);
  };

  const currentFlag = resolvedFlags[currentLocale] ?? "🌐";
  const currentLabel =
    resolvedLabels[currentLocale] ?? currentLocale.toUpperCase();

  return (
    <div className="locale-switcher" ref={ref}>
      <button
        className="locale-switcher__trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-label={`Language: ${currentLabel}`}
        type="button"
        {...(open !== undefined ? { "aria-expanded": open } : {})}
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
        <ul
          className="locale-switcher__dropdown"
          role="listbox"
          aria-label={`Language: ${currentLabel}`}
        >
          {locales.map((locale) => (
            <li
              key={locale}
              className={`locale-switcher__option${locale === currentLocale ? " locale-switcher__option--active" : ""}`}
              role="option"
              onClick={() => switchLocale(locale)}
              {...(locale === currentLocale
                ? { "aria-selected": true }
                : { "aria-selected": false })}
            >
              <span className="locale-switcher__flag" aria-hidden="true">
                {resolvedFlags[locale] ?? "🌐"}
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
