import type { EnvironmentVariables, Language } from '@repo/helpers/types';
import getBooleanFromString from '@repo/helpers/get-boolean-from-string';

/* ------------------------------------------------------------------ */
/*  Env-reading helpers                                               */
/* ------------------------------------------------------------------ */

/**
 * Reads a trimmed string from `process.env`, checking both the given
 * {@link key} and its `NEXT_PUBLIC_` prefixed variant before falling
 * back to {@link fallback}.
 */
const readEnv = (key: string, fallback: string): string =>
  process.env[key]?.trim() ??
  process.env[`NEXT_PUBLIC_${key}`]?.trim() ??
  fallback;

/**
 * Reads a boolean environment variable.
 * Returns `true` only when the raw value (case-insensitive) equals `"true"`.
 */
const readBoolEnv = (key: string): boolean =>
  getBooleanFromString(readEnv(key, ''));

/**
 * Reads a numeric environment variable, returning {@link fallback}
 * when the variable is unset or empty.
 */
const readNumEnv = (key: string, fallback: number): number => {
  const raw =
    process.env[key]?.trim() ?? process.env[`NEXT_PUBLIC_${key}`]?.trim();
  return raw ? Number(raw) : fallback;
};

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Collects all application environment variables into a typed
 * {@link EnvironmentVariables} object.
 *
 * Each variable is resolved in order:
 * 1. `process.env.KEY`
 * 2. `process.env.NEXT_PUBLIC_KEY` (for Next.js client-side exposure)
 * 3. A built-in default value
 */
const getEnvVariables = (): EnvironmentVariables => {
  const defaultLanguage = readEnv('DEFAULT_LANGUAGE', 'en') as Language;

  return {
    /* Server */
    host: process.env.HOST?.trim() ?? '127.0.0.1',
    hostName: readEnv('HOSTNAME', 'localhost'),
    URLBase: readEnv('URL_BASE', 'http://127.0.0.1:3000'),
    K8sURLBase: readEnv('K8S_URL_BASE', 'http://127.0.0.1:3000'),
    domainURL: readEnv('DOMAIN_URL', 'http://127.0.0.1:3000'),
    redisURL: readEnv('REDIS_URL', 'redis://localhost:6379'),

    /* Localisation */
    defaultLanguage,
    language: defaultLanguage,

    /* Branding */
    logo: readEnv('LOGO', '/images/logo.png'),
    logoWidth: readNumEnv('LOGO_WIDTH', 100),
    primaryColor: readEnv('PRIMARY_COLOR', '#000'),
    secondaryColor: readEnv('SECONDARY_COLOR', '#777'),
    accentColor: readEnv('ACCENT_COLOR', ''),
    themeColor: readEnv('THEME_COLOR', '#ffffff'),

    /* Layout */
    navBarBGColor: readEnv('NAVBAR_BG_COLOR', ''),
    darkNavBar: readBoolEnv('DARK_NAVBAR'),
    footerBGColor: readEnv('FOOTER_BG_COLOR', ''),
    darkFooter: readBoolEnv('DARK_FOOTER'),
    bodyBGColor: readEnv('BODY_BG_COLOR', '#ffffff'),
    topPadding: readBoolEnv('TOP_PADDING'),
    bottomPadding: readBoolEnv('BOTTOM_PADDING'),

    /* Feature flags */
    loginEnabled: readBoolEnv('LOGIN_ENABLED'),
    cartEnabled: readBoolEnv('CART_ENABLED'),
    favoritesEnabled: readBoolEnv('FAVORITES_ENABLED'),
    ordersEnabled: readBoolEnv('ORDERS_ENABLED'),
    searchEnabled: readBoolEnv('SEARCH_ENABLED'),

    /* Open Graph / SEO */
    ogTitle: readEnv('OG_TITLE', 'My Web App'),
    ogSite: readEnv('OG_SITE', 'My web site'),
    ogImg: readEnv('OG_IMG', '/static/logo.png'),
    ogURL: readEnv('OG_URL', '/'),
    ogDescription: readEnv('OG_DESCRIPTION', 'My Web App'),

    /* Misc */
    version: readEnv('VERSION', '0.0.1'),
    favicon: readEnv('FAVICON', '/static/favicon.ico'),
    github: readEnv('GITHUB', ''),
  };
};

export default getEnvVariables;
