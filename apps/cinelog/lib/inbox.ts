import {
  ApiError,
  type MovieDetail,
  type MovieFormat,
  type Paginated,
} from "./catalog";

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
  format: MovieFormat;
  cover_url: string;
  tmdb_id: string;
  genres: string[];
  cast: string[];
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

export async function rejectInboxItem(id: number): Promise<void> {
  const res = await fetch(`/api/catalog/inbox/${id}/reject`, {
    method: "POST",
  });
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data);
  }
}
