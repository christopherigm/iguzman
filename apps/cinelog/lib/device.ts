/**
 * Server-side client (device) classification from the request User-Agent.
 *
 * Used to decide how to play an inline media stream: mobile clients (Android /
 * iOS) hand off the direct URL to the OS-native video player, while desktop
 * clients play in the in-app modal player. Viewport width can't answer this -
 * a desktop browser resized narrow is still a desktop that would *download*
 * the file rather than play it - so we read the actual OS from the UA instead.
 */

export type DeviceType = "mobile" | "desktop";

// Mobile OS / browser markers. iPadOS 13+ reports a desktop "Macintosh" UA, so
// such iPads fall through to "desktop" - harmless, they just get the in-app
// modal player (which works everywhere) instead of the native handoff.
const MOBILE_UA =
  /android|iphone|ipad|ipod|iemobile|blackberry|opera mini|mobile/i;

/** Classify the request's User-Agent. Defaults to "desktop" (the universally
 *  safe path - always the in-app modal) when the UA is missing. */
export function detectDeviceType(userAgent: string | null): DeviceType {
  return userAgent && MOBILE_UA.test(userAgent) ? "mobile" : "desktop";
}
