import { isFacebook, isInstagram, isTiktok } from '@repo/helpers/checkers';

const BASE_URL = 'https://api.scrapecreators.com';

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
  // Credits field name may vary — update if ScrapeCreators changes it
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
    headers: { 'x-api-key': key },
  });
  if (!res.ok) throw new Error(`ScrapeCreators ${path} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

function toUnix(value: string | number): number {
  if (typeof value === 'number') return value;
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
    '/v1/tiktok/video/comments',
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
      parent: 'root',
    }));
  return { comments, creditsRemaining: data.credits_remaining ?? null };
}

async function fetchInstagram(
  url: string,
  max: number,
  key: string,
): Promise<{ comments: NormalizedComment[]; creditsRemaining: number | null }> {
  const data = await apiFetch<InstagramResponse>(
    '/v2/instagram/post/comments',
    { url },
    key,
  );
  if (!data.success) return { comments: [], creditsRemaining: data.credits_remaining ?? null };
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
      parent: 'root',
    }));
  return { comments, creditsRemaining: data.credits_remaining ?? null };
}

async function fetchFacebook(
  url: string,
  max: number,
  key: string,
): Promise<{ comments: NormalizedComment[]; creditsRemaining: number | null }> {
  const data = await apiFetch<FacebookResponse>(
    '/v1/facebook/post/comments',
    { url },
    key,
  );
  if (!data.success) return { comments: [], creditsRemaining: data.credits_remaining ?? null };
  const comments: NormalizedComment[] = (data.comments ?? [])
    .slice(0, max)
    .map((c) => ({
      id: c.id,
      text: c.text,
      timestamp: toUnix(c.created_at),
      author: c.author.name,
      author_id: c.author.id,
      like_count: c.reaction_count,
      parent: 'root',
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
        '/v1/tiktok/video/comments',
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
        '/v2/instagram/post/comments',
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
        '/v1/facebook/post/comments',
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
  if (!key) throw new Error('No ScrapeCreators API key available');
  if (isTiktok(url)) return fetchTikTok(url, maxComments, key);
  if (isInstagram(url)) return fetchInstagram(url, maxComments, key);
  if (isFacebook(url)) return fetchFacebook(url, maxComments, key);
  throw new Error('fetchAllSocialComments: unsupported platform');
}
