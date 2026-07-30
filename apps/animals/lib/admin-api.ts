/**
 * Authenticated fetch for the admin CMS.
 *
 * Every call goes to the same-origin `/api/admin/*` route handler, which
 * attaches the bearer token from the HTTP-only cookie and transparently
 * refreshes it on a 401 - so there is no token for this module (or any other
 * browser code) to hold.
 *
 * Two things this client does **not** do, unlike website's:
 *
 * * There is no `system` query param on anything. animals-api is single-tenant,
 *   so a list is simply the list.
 * * `include_disabled=true` is on every list read here. The CMS is where an
 *   author finds the draft they have not published yet; the API ignores the
 *   param for anyone who is not an administrator, so it cannot leak.
 */

async function adminFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(path.replace(/^\/api\//, '/api/admin/'), {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });

  // A 401 here means the refresh token is gone or rejected too: genuinely
  // logged out. The session lives in the cookie the server already cleared, so
  // a full navigation to /auth is all that is needed - there is no client store
  // to purge.
  if (res.status === 401 && typeof window !== 'undefined') {
    window.location.href = '/auth';
  }

  return res;
}

export class AdminApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: Record<string, unknown>,
  ) {
    super('Admin API request failed');
  }
}

async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new AdminApiError(res.status, data);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

type Row = Record<string, unknown>;

/**
 * The five CRUD calls every catalog resource shares, bound to one API path.
 *
 * animals-api's `core/views.py` gives every resource the same eight methods
 * behind the same URL shape, so the client that talks to it has no reason to
 * spell out five near-identical functions per model the way website's does -
 * that file is 900 lines of the same four bodies.
 */
function resource(path: string) {
  return {
    list: async (query = ''): Promise<Row[]> => {
      const separator = query ? '&' : '';
      const res = await adminFetch(`/api/${path}/?include_disabled=true${separator}${query}`);
      return parseResponse<Row[]>(res);
    },
    get: async (pk: number): Promise<Row> =>
      parseResponse<Row>(await adminFetch(`/api/${path}/${pk}/`)),
    create: async (data: Row): Promise<Row> =>
      parseResponse<Row>(
        await adminFetch(`/api/${path}/`, { method: 'POST', body: JSON.stringify(data) }),
      ),
    update: async (pk: number, data: Row): Promise<Row> =>
      parseResponse<Row>(
        await adminFetch(`/api/${path}/${pk}/`, { method: 'PATCH', body: JSON.stringify(data) }),
      ),
    remove: async (pk: number): Promise<void> =>
      parseResponse<void>(await adminFetch(`/api/${path}/${pk}/`, { method: 'DELETE' })),
  };
}

// ---- Site settings ----------------------------------------------------------
// No pk: `System` is a singleton in this backend (see core/system_views.py).

export async function getSystem(): Promise<Row> {
  return parseResponse<Row>(await adminFetch('/api/system/'));
}

export async function updateSystem(data: Row): Promise<Row> {
  return parseResponse<Row>(
    await adminFetch('/api/system/', { method: 'PATCH', body: JSON.stringify(data) }),
  );
}

// ---- Catalog ----------------------------------------------------------------

export const categories = resource('catalog/categories');
export const species = resource('catalog/species');
export const seasons = resource('catalog/seasons');
export const weatherConditions = resource('catalog/weather-conditions');
export const locations = resource('catalog/locations');

/**
 * The geography lookups a place is filed under. Lightweight by design - a name
 * pair, a slug and an order, plus a country's ISO code, and no photographs - so
 * unlike every other catalog resource these have no `*Images` child collection
 * beside them.
 *
 * The chain is `country -> state -> county -> location`, and each level stores
 * only its own parent: a **location stores only its county**, so the state comes
 * back on the payload as `state`/`state_name` read through that county, and the
 * country as `country`/`country_name` read one link further up. Neither is
 * writable on a location. So a form that lets an author pick a state or a country
 * is picking a filter, not a field - the one geography control on the location
 * form is the county picker.
 *
 * Both FKs going up *are* writable and required on their own resource: a state
 * must name its country and a county its state, and the API answers 400 without
 * one.
 */
export const countries = resource('catalog/countries');
export const states = resource('catalog/states');
export const counties = resource('catalog/counties');

// ---- Journal ----------------------------------------------------------------

/**
 * The sightings feed **paginates** - it grows with every outing - so its `list`
 * overrides the shared one to unwrap `{count, limit, offset, results}`. It asks
 * for one large page (100, the API's own cap): an author scanning for an entry
 * wants to scroll, not to page.
 */
export const sightings = {
  ...resource('journal/sightings'),
  list: async (query = ''): Promise<Row[]> => {
    const res = await adminFetch(
      `/api/journal/sightings/?include_disabled=true&limit=100${query ? `&${query}` : ''}`,
    );
    const page = await parseResponse<{ results?: Row[] }>(res);
    return page.results ?? [];
  },
};

// ---- Child collections ------------------------------------------------------
// A record's photos and a sighting's media. Both hang off their parent's URL
// rather than having a collection of their own.

/**
 * The four CRUD calls a child collection at `/api/<parent>/<pk>/<name>/` shares.
 *
 * Every gallery in this API has the same shape, so the same reason the parent
 * resources go through `resource()` applies here - six hand-written copies of
 * these bodies is six places for a path to drift.
 */
function childResource(parentPath: string, name = 'images') {
  const base = (parentId: number) => `/api/${parentPath}/${parentId}/${name}/`;
  return {
    list: async (parentId: number): Promise<Row[]> =>
      parseResponse<Row[]>(await adminFetch(base(parentId))),
    create: async (parentId: number, data: Row): Promise<Row> =>
      parseResponse<Row>(
        await adminFetch(base(parentId), { method: 'POST', body: JSON.stringify(data) }),
      ),
    update: async (parentId: number, pk: number, data: Row): Promise<Row> =>
      parseResponse<Row>(
        await adminFetch(`${base(parentId)}${pk}/`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        }),
      ),
    remove: async (parentId: number, pk: number): Promise<void> =>
      parseResponse<void>(await adminFetch(`${base(parentId)}${pk}/`, { method: 'DELETE' })),
  };
}

export type ChildResource = ReturnType<typeof childResource>;

/**
 * The photo galleries. **Row order decides the record's main image** - the API
 * publishes a record's `image` as its own column if set and otherwise the first
 * of these, and the CMS never writes that column. So a re-arrange here is a
 * cover change, which is why `EntityGallery` PATCHes `sort_order` on every row.
 */
export const categoryImages = childResource('catalog/categories');
export const speciesImages = childResource('catalog/species');
export const seasonImages = childResource('catalog/seasons');
export const weatherImages = childResource('catalog/weather-conditions');
export const locationImages = childResource('catalog/locations');

/**
 * A sighting's gallery: photos, uploaded clips and video links in one ordered
 * list (a `SightingMedia` row carries a `kind`). The photo half is edited by the
 * same `EntityGallery` every catalog record uses - `kind: 'image'` is the create
 * default - and the first photo is the entry's cover.
 */
export const sightingMedia = {
  ...childResource('journal/sightings', 'media'),
  /**
   * Upload a video file. **Not** through `adminFetch`: a video is far past the
   * API's 10 MB JSON-body limit, so it goes as multipart to its own endpoint,
   * which Django streams to a temp file. That endpoint is not on the admin
   * proxy's allowlist either, for the same reason the restore upload is not -
   * the proxy would destroy the multipart boundary.
   */
  uploadVideo: async (sightingId: number, form: FormData): Promise<Row> => {
    const res = await fetch(`/api/journal/sightings/${sightingId}/media/video/`, {
      method: 'POST',
      body: form,
    });
    return parseResponse<Row>(res);
  },
};

// ---- Users ------------------------------------------------------------------

export interface AdminUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  is_admin: boolean;
  is_staff: boolean;
  date_joined: string;
  last_login: string | null;
}

export async function listUsers(): Promise<AdminUser[]> {
  return parseResponse<AdminUser[]>(await adminFetch('/api/auth/admin/users/'));
}

export async function updateUser(pk: number, data: Row): Promise<AdminUser> {
  return parseResponse<AdminUser>(
    await adminFetch(`/api/auth/admin/users/${pk}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  );
}

// ---- Backups ----------------------------------------------------------------

/**
 * The sections the CMS offers, in the order they are shown. `images` is not a
 * data section: it decides whether the media files of the *selected* sections
 * travel with them. Must match `core/backup.py`'s `ALL_SECTIONS`.
 */
export const BACKUP_SECTIONS = ['settings', 'catalog', 'journal', 'images'] as const;
export type BackupSection = (typeof BACKUP_SECTIONS)[number];

export interface SiteBackup {
  id: number;
  name: string;
  sections: BackupSection[];
  size_bytes: number;
  total_records: number;
  media_files: number;
  created: string;
  created_by_email: string | null;
}

export async function listBackups(): Promise<SiteBackup[]> {
  return parseResponse<SiteBackup[]>(await adminFetch('/api/backups/'));
}

export async function createBackup(
  name: string,
  sections: BackupSection[],
): Promise<SiteBackup> {
  return parseResponse<SiteBackup>(
    await adminFetch('/api/backups/', {
      method: 'POST',
      body: JSON.stringify({ name, sections }),
    }),
  );
}

export async function deleteBackup(pk: number): Promise<void> {
  return parseResponse<void>(await adminFetch(`/api/backups/${pk}/`, { method: 'DELETE' }));
}

export type RestoreMode = 'replace' | 'merge';

export interface RestoreResult {
  mode: RestoreMode;
  sections: BackupSection[];
  /** Per model label: how many rows were created, updated and skipped. */
  results: Record<string, { created: number; updated: number; skipped: number }>;
  manifest: { site_name?: string; created_at?: string; sections?: BackupSection[] };
}

/**
 * Upload an archive back. Goes to its own handler rather than the admin proxy:
 * the proxy re-encodes every body as JSON, which destroys the multipart
 * boundary the file rides in.
 */
export async function restoreBackup({
  file,
  sections,
  mode,
}: {
  file: File;
  sections: BackupSection[];
  mode: RestoreMode;
}): Promise<RestoreResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('mode', mode);
  sections.forEach((section) => form.append('sections', section));

  const res = await fetch('/api/backups/restore/', { method: 'POST', body: form });
  return parseResponse<RestoreResult>(res);
}
