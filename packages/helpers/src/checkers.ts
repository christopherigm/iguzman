/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/** Platform identifiers returned by {@link detectPlatform}. */
export type Platform =
  | 'facebook'
  | 'instagram'
  | 'pinterest'
  | 'rednote'
  | 'tidal'
  | 'tiktok'
  | 'x'
  | 'youtube'
  | 'unknown';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

/**
 * Maps each platform to the set of hostnames it is known to use.
 *
 * Hostnames are matched against the URL's `hostname` property, so
 * protocol, path, and query-string differences are ignored.
 */
const PLATFORM_HOSTNAMES: Record<Exclude<Platform, 'unknown'>, Set<string>> = {
  facebook: new Set([
    'facebook.com',
    'www.facebook.com',
    'fb.com',
    'www.fb.com',
    'fb.watch',
  ]),
  instagram: new Set([
    'instagram.com',
    'www.instagram.com',
    'ig.com',
    'www.ig.com',
  ]),
  pinterest: new Set([
    'pin.it',
    'www.pinterest.com',
    'pinterest.com',
  ]),
  rednote: new Set([
    'xhslink.com',
    'www.xhslink.com',
    'xiaohongshu.com',
    'www.xiaohongshu.com',
  ]),
  tidal: new Set([
    'tidal.com',
    'www.tidal.com',
  ]),
  tiktok: new Set([
    'tiktok.com',
    'www.tiktok.com',
    'vm.tiktok.com',
    'vt.tiktok.com',
  ]),
  x: new Set([
    'twitter.com',
    'www.twitter.com',
    'x.com',
    'www.x.com',
  ]),
  youtube: new Set([
    'youtube.com',
    'www.youtube.com',
    'youtu.be',
    'www.youtu.be',
  ]),
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Extracts the hostname from a URL string.
 *
 * Returns `null` when the string cannot be parsed as a valid URL.
 */
const extractHostname = (url: string): string | null => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
};

/**
 * Creates a platform checker that tests whether a URL belongs to a
 * given platform by comparing its hostname against the platform's
 * known hosts.
 */
const createPlatformChecker =
  (platform: Exclude<Platform, 'unknown'>) =>
  (url: string): boolean => {
    const hostname = extractHostname(url);
    if (!hostname) return false;
    return PLATFORM_HOSTNAMES[platform].has(hostname);
  };

/* ------------------------------------------------------------------ */
/*  Email                                                             */
/* ------------------------------------------------------------------ */

/** Basic email format pattern (not an exhaustive RFC 5322 check). */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Returns `true` when the string looks like a valid email address.
 *
 * Uses a simple heuristic: no spaces, exactly one `@`, and at least
 * one `.` in the domain part.
 */
export const isEmailValid = (email: string): boolean =>
  EMAIL_PATTERN.test(email);

/* ------------------------------------------------------------------ */
/*  iOS browser detection                                             */
/* ------------------------------------------------------------------ */

/**
 * Returns `true` when the current browser is running on an iOS device.
 *
 * Covers iPhone, iPad (including iPadOS 13+ which reports as "Mac"),
 * and iPod.
 *
 * @see https://stackoverflow.com/questions/9038625/detect-if-device-is-ios
 */
export const isIOSBrowser = (): boolean => {
  const iosDevices = [
    'iPad Simulator',
    'iPhone Simulator',
    'iPod Simulator',
    'iPad',
    'iPhone',
    'iPod',
  ];

  return (
    iosDevices.includes(navigator.platform) ||
    (navigator.userAgent.includes('Mac') && 'ontouchend' in document)
  );
};

/* ------------------------------------------------------------------ */
/*  Platform checkers                                                 */
/* ------------------------------------------------------------------ */

/** Returns `true` when the URL points to Facebook. */
export const isFacebook = createPlatformChecker('facebook');

/** Returns `true` when the URL points to Instagram. */
export const isInstagram = createPlatformChecker('instagram');

/** Returns `true` when the URL points to Pinterest. */
export const isPinterest = createPlatformChecker('pinterest');

/** Returns `true` when the URL points to RedNote (Xiaohongshu). */
export const isRedNote = createPlatformChecker('rednote');

/** Returns `true` when the URL points to Tidal. */
export const isTidal = createPlatformChecker('tidal');

/** Returns `true` when the URL points to TikTok. */
export const isTiktok = createPlatformChecker('tiktok');

/** Returns `true` when the URL points to X (formerly Twitter). */
export const isX = createPlatformChecker('x');

/** @deprecated Use {@link isX} instead. */
export const isTwitter = isX;

/** Returns `true` when the URL points to YouTube. */
export const isYoutube = createPlatformChecker('youtube');

/* ------------------------------------------------------------------ */
/*  Generic detector                                                  */
/* ------------------------------------------------------------------ */

/**
 * Detects which platform a URL belongs to.
 *
 * Returns `"unknown"` when no known platform matches.
 */
export const detectPlatform = (url: string): Platform => {
  const hostname = extractHostname(url);
  if (!hostname) return 'unknown';

  for (const [platform, hosts] of Object.entries(PLATFORM_HOSTNAMES)) {
    if (hosts.has(hostname)) return platform as Platform;
  }

  return 'unknown';
};
