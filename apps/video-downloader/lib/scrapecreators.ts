import { isFacebook, isInstagram, isTiktok } from "@repo/helpers/checkers";

const BASE_URL = "https://api.scrapecreators.com";

export interface NormalizedComment {
  id: string;
  text: string;
  timestamp?: number;
  author?: string;
  author_id?: string;
  author_thumbnail?: string;
  parent?: string;
  like_count?: number;
}

export interface CommentCountResult {
  count: number | null;
  creditsRemaining: number | null;
}

/* ── Internal API types ─────────────────────────────── */

interface TikTokComment {
  cid: string;
  text: string;
  create_time: number;
  digg_count: number;
  user: {
    uid: string;
    nickname: string;
    avatar_thumb?: { url_list?: string[] };
  };
}

interface TikTokResponse {
  comments: TikTokComment[];
  cursor: number;
  has_more: number;
  total: number;
  // Credits field name may vary - update if ScrapeCreators changes it
  credits_remaining?: number;
}

interface InstagramComment {
  id: string;
  text: string;
  created_at: string;
  comment_like_count: number;
  user: { id: string; username: string; profile_pic_url?: string };
}

interface InstagramResponse {
  success: boolean;
  comments: InstagramComment[];
  cursor?: string;
  credits_remaining?: number;
}

interface FacebookComment {
  id: string;
  text: string;
  created_at: string;
  reaction_count: number;
  author: { id: string; name: string };
}

interface FacebookResponse {
  success: boolean;
  comments: FacebookComment[];
  cursor?: string;
  has_next_page: boolean;
  credits_remaining?: number;
}

/* ── Helpers ────────────────────────────────────────── */

function envApiKey(): string | null {
  return process.env.SCRAPECREATORS_API_KEY ?? null;
}

function resolveKey(override?: string): string | null {
  return override ?? envApiKey();
}

async function apiFetch<T>(
  path: string,
  params: Record<string, string>,
  key: string,
): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE_URL}${path}?${qs}`, {
    headers: { "x-api-key": key },
  });
  if (!res.ok) throw new Error(`ScrapeCreators ${path} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

function toUnix(value: string | number): number {
  if (typeof value === "number") return value;
  return Math.floor(new Date(value).getTime() / 1000);
}

/* ── Platform detection ─────────────────────────────── */

export function isScrapeCreatorsPlatform(url: string): boolean {
  return isFacebook(url) || isInstagram(url) || isTiktok(url);
}

/* ── Per-platform fetchers ──────────────────────────── */

async function fetchTikTok(
  url: string,
  max: number,
  key: string,
): Promise<{ comments: NormalizedComment[]; creditsRemaining: number | null }> {
  const data = await apiFetch<TikTokResponse>(
    "/v1/tiktok/video/comments",
    { url },
    key,
  );
  const comments: NormalizedComment[] = (data.comments ?? [])
    .slice(0, max)
    .map((c) => ({
      id: c.cid,
      text: c.text,
      timestamp: c.create_time,
      author: c.user.nickname,
      author_id: c.user.uid,
      author_thumbnail: c.user.avatar_thumb?.url_list?.[0],
      like_count: c.digg_count,
      parent: "root",
    }));
  return { comments, creditsRemaining: data.credits_remaining ?? null };
}

async function fetchInstagram(
  url: string,
  max: number,
  key: string,
): Promise<{ comments: NormalizedComment[]; creditsRemaining: number | null }> {
  const data = await apiFetch<InstagramResponse>(
    "/v2/instagram/post/comments",
    { url },
    key,
  );
  if (!data.success)
    return { comments: [], creditsRemaining: data.credits_remaining ?? null };
  const comments: NormalizedComment[] = (data.comments ?? [])
    .slice(0, max)
    .map((c) => ({
      id: c.id,
      text: c.text,
      timestamp: toUnix(c.created_at),
      author: c.user.username,
      author_id: c.user.id,
      author_thumbnail: c.user.profile_pic_url,
      like_count: c.comment_like_count,
      parent: "root",
    }));
  return { comments, creditsRemaining: data.credits_remaining ?? null };
}

async function fetchFacebook(
  url: string,
  max: number,
  key: string,
): Promise<{ comments: NormalizedComment[]; creditsRemaining: number | null }> {
  const data = await apiFetch<FacebookResponse>(
    "/v1/facebook/post/comments",
    { url },
    key,
  );
  if (!data.success)
    return { comments: [], creditsRemaining: data.credits_remaining ?? null };
  const comments: NormalizedComment[] = (data.comments ?? [])
    .slice(0, max)
    .map((c) => ({
      id: c.id,
      text: c.text,
      timestamp: toUnix(c.created_at),
      author: c.author.name,
      author_id: c.author.id,
      like_count: c.reaction_count,
      parent: "root",
    }));
  return { comments, creditsRemaining: data.credits_remaining ?? null };
}

/* ── Public API ─────────────────────────────────────── */

/**
 * Fetches a single page to get an approximate comment count and remaining API
 * credits. The `keyOverride` (browser-supplied via `x-scrapecreators-key`
 * header) takes precedence over the `SCRAPECREATORS_API_KEY` env var.
 */
export async function fetchSocialCommentCount(
  url: string,
  keyOverride?: string,
): Promise<CommentCountResult> {
  const key = resolveKey(keyOverride);
  if (!key) return { count: null, creditsRemaining: null };
  try {
    if (isTiktok(url)) {
      const data = await apiFetch<TikTokResponse>(
        "/v1/tiktok/video/comments",
        { url },
        key,
      );
      return {
        count: data.total ?? data.comments?.length ?? null,
        creditsRemaining: data.credits_remaining ?? null,
      };
    }
    if (isInstagram(url)) {
      const data = await apiFetch<InstagramResponse>(
        "/v2/instagram/post/comments",
        { url },
        key,
      );
      return {
        count: data.success ? (data.comments?.length ?? null) : null,
        creditsRemaining: data.credits_remaining ?? null,
      };
    }
    if (isFacebook(url)) {
      const data = await apiFetch<FacebookResponse>(
        "/v1/facebook/post/comments",
        { url },
        key,
      );
      return {
        count: data.success ? (data.comments?.length ?? null) : null,
        creditsRemaining: data.credits_remaining ?? null,
      };
    }
    return { count: null, creditsRemaining: null };
  } catch {
    return { count: null, creditsRemaining: null };
  }
}

/* ── Social metadata types ──────────────────────────── */

export interface SocialMetadataResult {
  name: string | null;
  fulltitle: string | null;
  uploader: string | null;
  uploader_id: string | null;
  uploader_url: string | null;
  description: string | null;
  uploadTimestamp: number | null;
  tags: string[] | null;
  creditsRemaining: number | null;
}

interface FacebookPostResponse {
  success?: boolean;
  description?: string;
  creation_time?: string;
  author?: { id?: string; name?: string; url?: string };
  credits_remaining?: number;
}

interface InstagramPostResponse {
  data?: {
    xdt_shortcode_media?: {
      edge_media_to_caption?: {
        edges?: Array<{ node?: { text?: string } }>;
      };
      owner?: { username?: string; full_name?: string };
      taken_at_timestamp?: number;
    };
  };
  credits_remaining?: number;
}

interface TikTokVideoDetailResponse {
  aweme_detail?: {
    desc?: string;
    author?: { nickname?: string; unique_id?: string };
    create_time?: number;
  };
  credits_remaining?: number;
}

/**
 * Fetches post/video metadata (title, author, description, timestamp) for a
 * Facebook, Instagram, or TikTok URL using ScrapeCreators.
 */
export async function fetchSocialMetadata(
  url: string,
  keyOverride?: string,
): Promise<SocialMetadataResult> {
  const key = resolveKey(keyOverride);
  if (!key) throw new Error("No ScrapeCreators API key available");

  if (isFacebook(url)) {
    const data = await apiFetch<FacebookPostResponse>(
      "/v1/facebook/post",
      { url },
      key,
    );
    const description = data.description ?? null;
    const authorName = data.author?.name ?? null;
    const authorId = data.author?.id ?? null;
    const authorUrl = data.author?.url ?? null;
    const uploadTimestamp = data.creation_time
      ? Math.floor(new Date(data.creation_time).getTime() / 1000)
      : null;
    return {
      name: description ? description.slice(0, 100) : null,
      fulltitle: description,
      uploader: authorName,
      uploader_id: authorId,
      uploader_url: authorUrl,
      description,
      uploadTimestamp,
      tags: null,
      creditsRemaining: data.credits_remaining ?? null,
    };
  }

  if (isInstagram(url)) {
    const data = await apiFetch<InstagramPostResponse>(
      "/v1/instagram/post",
      { url },
      key,
    );
    const media = data.data?.xdt_shortcode_media;
    const caption =
      media?.edge_media_to_caption?.edges?.[0]?.node?.text ?? null;
    const username = media?.owner?.username ?? null;
    const fullName = media?.owner?.full_name ?? null;
    const uploadTimestamp = media?.taken_at_timestamp ?? null;
    return {
      name: caption ? caption.slice(0, 100) : null,
      fulltitle: caption,
      uploader: fullName,
      uploader_id: username
        ? username.startsWith("@")
          ? username
          : `@${username}`
        : null,
      uploader_url: username ? `https://www.instagram.com/${username}/` : null,
      description: caption,
      uploadTimestamp,
      tags: null,
      creditsRemaining: data.credits_remaining ?? null,
    };
  }

  if (isTiktok(url)) {
    const data = await apiFetch<TikTokVideoDetailResponse>(
      "/v2/tiktok/video",
      { url },
      key,
    );
    const detail = data.aweme_detail;
    const desc = detail?.desc ?? null;
    const nickname = detail?.author?.nickname ?? null;
    const uniqueId = detail?.author?.unique_id ?? null;
    return {
      name: desc ? desc.slice(0, 100) : null,
      fulltitle: desc,
      uploader: nickname,
      uploader_id: uniqueId
        ? uniqueId.startsWith("@")
          ? uniqueId
          : `@${uniqueId}`
        : null,
      uploader_url: uniqueId
        ? `https://www.tiktok.com/@${uniqueId.replace(/^@/, "")}`
        : null,
      description: desc,
      uploadTimestamp: detail?.create_time ?? null,
      tags: null,
      creditsRemaining: data.credits_remaining ?? null,
    };
  }

  throw new Error("fetchSocialMetadata: unsupported platform");
}

/**
 * Fetches up to `maxComments` comments from a social media URL using
 * ScrapeCreators. The `keyOverride` (browser-supplied) takes precedence over
 * the `SCRAPECREATORS_API_KEY` env var.
 */
export async function fetchAllSocialComments(
  url: string,
  maxComments: number,
  keyOverride?: string,
): Promise<{ comments: NormalizedComment[]; creditsRemaining: number | null }> {
  const key = resolveKey(keyOverride);
  if (!key) throw new Error("No ScrapeCreators API key available");
  if (isTiktok(url)) return fetchTikTok(url, maxComments, key);
  if (isInstagram(url)) return fetchInstagram(url, maxComments, key);
  if (isFacebook(url)) return fetchFacebook(url, maxComments, key);
  throw new Error("fetchAllSocialComments: unsupported platform");
}
