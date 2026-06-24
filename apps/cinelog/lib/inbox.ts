import {
  ApiError,
  type AudioFormatCode,
  type HdrFormatCode,
  type MovieDetail,
  type MovieFormat,
  type MovieRefetchPreview,
  type Paginated,
} from "./catalog";

/** An alternative TMDB match the user can re-pin the entry to. */
export interface InboxCandidate {
  id: number;
  tmdb_id: string;
  title: string;
  year: number | null;
  cover_url: string;
  overview: string;
}

export interface InboxItem {
  id: number;
  barcode: string;
  status: string;
  extracted_title: string;
  extracted_director: string;
  extracted_year: number | null;
  extracted_cast: string[];
  extracted_genres: string[];
  extracted_tmdb_id: string;
  extracted_cover_url: string;
  extracted_backdrop: string;
  extracted_synopsis: string;
  extracted_trailer_url: string;
  /** Disc audio-track formats (controlled-vocab codes); best-effort, may be empty. */
  extracted_audio_formats: AudioFormatCode[];
  /** Disc HDR / dynamic-range formats (controlled-vocab codes); may be empty. */
  extracted_hdr_formats: HdrFormatCode[];
  /** Audio-track languages (English names); may be empty. */
  extracted_spoken_languages: string[];
  /** Subtitle-track languages (English names); may be empty. */
  extracted_subtitle_languages: string[];
  candidates: InboxCandidate[];
  retry_count: number;
  error_message: string;
  created: string;
  modified: string;
}

/** Editable fields the user can correct before promoting an entry to the catalog. */
export interface InboxAcceptPayload {
  title: string;
  director: string;
  year: number | null;
  /** Formats the title is available in (multi-select). */
  formats: Exclude<MovieFormat, "">[];
  synopsis: string;
  trailer_url: string;
  cover_url: string;
  /** Sent only when saving a re-fetch: source URL to re-download the wallpaper. */
  backdrop_url: string;
  tmdb_id: string;
  genres: string[];
  cast: string[];
  /** Disc audio-track formats (controlled-vocab codes). */
  audio_formats: AudioFormatCode[];
  /** Disc HDR / dynamic-range formats (controlled-vocab codes). */
  hdr_formats: HdrFormatCode[];
  /** Audio-track languages (English names; unrecognised names are dropped). */
  spoken_languages: string[];
  /** Subtitle-track languages (English names; unrecognised names are dropped). */
  subtitle_languages: string[];
}

export async function getInboxItems(page = 1): Promise<Paginated<InboxItem>> {
  const qs = page > 1 ? `?page=${page}` : "";
  const res = await fetch(`/api/catalog/inbox${qs}`);
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<Paginated<InboxItem>>;
}

export async function acceptInboxItem(
  id: number,
  payload: InboxAcceptPayload,
): Promise<MovieDetail> {
  const res = await fetch(`/api/catalog/inbox/${id}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<MovieDetail>;
}

/**
 * Re-resolve a review entry's metadata from TMDB (year-aware) with a scraper/LLM
 * fallback, using the user-corrected `title` and `year` to pin the right
 * version. Returns the resolved fields as a preview WITHOUT promoting the entry;
 * the card applies them and the user accepts or discards. Throws ApiError when
 * nothing could be found.
 */
export async function refetchInboxItem(
  id: number,
  title: string,
  year: number | null,
): Promise<MovieRefetchPreview> {
  const res = await fetch(`/api/catalog/inbox/${id}/refetch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, year }),
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<MovieRefetchPreview>;
}

/**
 * Re-pin a review entry to one of its alternative candidate matches, identified
 * by `tmdbId`. TMDB ranks search results by popularity, so the default match can
 * be the wrong film; the picker lets the user choose the right one. Resolves the
 * chosen id to full metadata and returns it as a preview WITHOUT promoting the
 * entry - the card applies the fields and the user accepts. Throws ApiError when
 * the option could not be resolved.
 */
export async function selectInboxCandidate(
  id: number,
  tmdbId: string,
): Promise<MovieRefetchPreview> {
  const res = await fetch(`/api/catalog/inbox/${id}/select`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tmdb_id: tmdbId }),
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<MovieRefetchPreview>;
}

export async function rejectInboxItem(id: number): Promise<void> {
  const res = await fetch(`/api/catalog/inbox/${id}/reject`, {
    method: "POST",
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
}
