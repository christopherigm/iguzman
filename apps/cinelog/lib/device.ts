/**
 * Server-side client (device) classification from the request User-Agent.
 *
 * Used to decide how to play an inline media stream. Desktop clients play a
 * self-hosted copy in the in-app modal player. Mobile clients hand the direct
 * URL off to a native video player (VLC, MX Player, …) via a platform-specific
 * deep link, so we split mobile into "android" and "ios" to pick the right
 * scheme. Viewport width can't answer this - a desktop browser resized narrow
 * is still a desktop that would *download* the file rather than play it - so we
 * read the actual OS from the UA instead.
 */

export type DeviceType = "android" | "ios" | "desktop";

// OS markers. iPadOS 13+ reports a desktop "Macintosh" UA, so such iPads fall
// through to "desktop" - harmless, they just get the in-app modal player (which
// works everywhere) instead of the native deep-link handoff. Non-Android/iOS
// mobiles also fall through to "desktop" for the same safe reason.
const ANDROID_UA = /android/i;
const IOS_UA = /iphone|ipad|ipod/i;

/** Classify the request's User-Agent. Defaults to "desktop" (the universally
 *  safe path - always the in-app modal) when the UA is missing or is neither
 *  Android nor iOS. */
export function detectDeviceType(userAgent: string | null): DeviceType {
  if (!userAgent) return "desktop";
  if (ANDROID_UA.test(userAgent)) return "android";
  if (IOS_UA.test(userAgent)) return "ios";
  return "desktop";
}
