/**
 * Native external video-player handoff for self-hosted digital copies.
 *
 * On mobile (Android / iOS) a self-hosted copy is a direct media file on a
 * personal bucket. Rather than play it in the in-app `<video>` element, we hand
 * the URL off to an installed native player (VLC, MX Player, …) via a
 * platform-specific deep link. Neither Android nor iOS lets a web page detect
 * which players are installed, so the UI presents the full list and lets the
 * user choose; tapping a player that isn't installed simply does nothing.
 *
 * Desktop has no deep-link equivalent: VLC's Windows/macOS/Linux builds never
 * registered a `vlc://` URL scheme (the `vlc-x-callback://` used above is
 * iOS-only), so there is nothing for a link to bind to. What VLC *does* claim on
 * all three platforms is the playlist MIME types, so the handoff goes through a
 * one-track XSPF file instead - see `openInDesktopPlayer`.
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

const XML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

/** Escape a string for use as XML character data. Presigned media URLs carry
 *  `&`-separated query params, so this is load-bearing, not defensive. */
function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => XML_ENTITIES[char] as string);
}

/** A one-track XSPF playlist pointing at `mediaUrl`. */
export function buildXspfPlaylist(mediaUrl: string, title: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<playlist version="1" xmlns="http://xspf.org/ns/0/">
  <title>${escapeXml(title)}</title>
  <trackList>
    <track>
      <title>${escapeXml(title)}</title>
      <location>${escapeXml(mediaUrl)}</location>
    </track>
  </trackList>
</playlist>
`;
}

/** Filesystem-safe basename derived from a movie title. */
function playlistFilename(title: string): string {
  const slug =
    title
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "stream";
  return `${slug}.xspf`;
}

/**
 * Hand `mediaUrl` off to the desktop's default media player by downloading a
 * one-track XSPF playlist. VLC registers `application/xspf+xml` on Windows,
 * macOS and Linux alike - but so do Totem and other players, and the OS opens
 * whichever currently owns the association. Hence the generic "external player"
 * wording in the UI: we cannot know, and cannot choose, which one runs.
 *
 * `.xspf` is deliberate over `.m3u`: the latter is frequently owned by a *music*
 * player (Rhythmbox, Windows Media Player), which will not show video. The
 * browser saves the file and the user opens it - a one-click launch is not
 * something the web platform permits.
 */
export function openInDesktopPlayer(mediaUrl: string, title: string): void {
  const blob = new Blob([buildXspfPlaylist(mediaUrl, title)], {
    type: "application/xspf+xml",
  });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = playlistFilename(title);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking synchronously can cancel the download before it starts; yield
  // first so the browser has taken its own reference to the blob.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}
