/**
 * Native external video-player deep links for self-hosted digital copies.
 *
 * On mobile (Android / iOS) a self-hosted copy is a direct media file on a
 * personal bucket. Rather than play it in the in-app `<video>` element, we hand
 * the URL off to an installed native player (VLC, MX Player, …) via a
 * platform-specific deep link. Neither Android nor iOS lets a web page detect
 * which players are installed, so the UI presents the full list and lets the
 * user choose; tapping a player that isn't installed simply does nothing.
 */

import type { DeviceType } from "./device";

export interface ExternalPlayer {
  /** Stable id (also the React key). */
  id: string;
  /** Brand name shown on the picker button (a proper noun - not translated). */
  label: string;
  /** Deep-link URL that launches the player with the media pre-loaded. */
  href: string;
}

// Android players, keyed by their install package. The order here is the order
// shown in the picker.
const ANDROID_PLAYERS: { id: string; label: string; pkg: string }[] = [
  { id: "vlc", label: "VLC", pkg: "org.videolan.vlc" },
  { id: "mxPlayer", label: "MX Player", pkg: "com.mxtech.videoplayer.ad" },
  {
    id: "mxPlayerPro",
    label: "MX Player Pro",
    pkg: "com.mxtech.videoplayer.pro",
  },
];

/**
 * Build an Android `intent://` URI that opens `mediaUrl` in a specific package
 * with a video MIME hint. The media URL's own scheme is lifted into the
 * intent's `scheme=` field so the host/path/query (e.g. an S3 presigned
 * signature) ride through untouched after the `intent://` prefix.
 */
function androidIntent(mediaUrl: string, pkg: string): string {
  const { protocol } = new URL(mediaUrl);
  const scheme = protocol.replace(/:$/, "");
  const rest = mediaUrl.slice(protocol.length + 2); // strip "<scheme>://"
  return `intent://${rest}#Intent;scheme=${scheme};package=${pkg};type=video/*;end`;
}

/** iOS players, using each app's registered custom URL scheme. */
function iosPlayers(mediaUrl: string): ExternalPlayer[] {
  const encoded = encodeURIComponent(mediaUrl);
  return [
    {
      id: "vlc",
      label: "VLC",
      href: `vlc-x-callback://x-callback-url/stream?url=${encoded}`,
    },
    {
      id: "infuse",
      label: "Infuse",
      href: `infuse://x-callback-url/play?url=${encoded}`,
    },
    // Outplayer expects the full source URL appended verbatim after its scheme.
    { id: "outplayer", label: "Outplayer", href: `outplayer://${mediaUrl}` },
  ];
}

/**
 * The native players to offer for `mediaUrl` on the given device. Returns an
 * empty list on desktop (which uses the in-app modal player instead) and on a
 * malformed URL.
 */
export function externalPlayersFor(
  deviceType: DeviceType,
  mediaUrl: string,
): ExternalPlayer[] {
  try {
    if (deviceType === "android") {
      return ANDROID_PLAYERS.map(({ id, label, pkg }) => ({
        id,
        label,
        href: androidIntent(mediaUrl, pkg),
      }));
    }
    if (deviceType === "ios") return iosPlayers(mediaUrl);
  } catch {
    // Malformed media URL - offer nothing rather than a broken deep link.
  }
  return [];
}
