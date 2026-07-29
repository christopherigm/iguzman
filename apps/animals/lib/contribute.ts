/**
 * The browser half of the public contribute flow.
 *
 * Both calls go to the same-origin `/api/contribute/*` route handler, which
 * attaches the bearer token from the HTTP-only cookie and refreshes it on a 401 -
 * so, exactly as in `lib/admin-api.ts`, there is no token for this module (or any
 * other browser code) to hold.
 *
 * What it does **not** share with `admin-api.ts`:
 *
 * * There is no `resource()` factory and no CRUD. A contributor creates; they
 *   never list, update or delete through here. Two functions is the whole surface,
 *   and it should stay that way - a "contribute update" endpoint would mean a
 *   pending record editable after review had started.
 * * A 401 does **not** bounce the browser to `/auth`. The CMS can do that because
 *   an author lands there having navigated to a page they were already signed in
 *   for; a contributor may have spent ten minutes on a three-stage form, and a
 *   redirect would throw the whole draft away. The caller shows the error and
 *   leaves the form standing.
 */

/** The photos in a submission, in order. `photos[0]` becomes the record's cover. */
export type ContributePhotos = string[];

export interface SpeciesSubmission {
  /** The category being filed under - locked to the page the FAB was pressed on. */
  category: number;
  name: string;
  scientific_name?: string;
  family?: string;
  description?: string;
  short_description?: string;
  photos: ContributePhotos;
}

export interface SightingSubmission {
  species: number;
  /** The entry's optional title; the API falls back to the species name. */
  name?: string;
  description?: string;
  short_description?: string;
  /** `YYYY-MM-DD`. The API derives the season from it. */
  date: string;
  time?: string;
  location?: number;
  latitude?: number;
  longitude?: number;
  weather?: number;
  temperature_c?: number;
  individuals?: number;
  /** The credit line. Cleared by the API when `author_anonymous` is true. */
  author_name?: string;
  author_anonymous?: boolean;
  photos: ContributePhotos;
}

/**
 * What the API answers with, of the parts the confirmation stage renders.
 *
 * The endpoints return the record's **normal** read payload, so this is a subset
 * rather than a shape of its own - which is what lets the flow link straight to
 * the record once an administrator has published it.
 */
export interface ContributeResult {
  id: number;
  slug: string;
  enabled: boolean;
}

export class ContributeError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: Record<string, unknown>,
  ) {
    super("Contribution failed");
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/contribute/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    throw new ContributeError(res.status, data);
  }
  return res.json() as Promise<T>;
}

/** Propose a species. Lands pending; an administrator publishes it. */
export function contributeSpecies(
  submission: SpeciesSubmission,
): Promise<ContributeResult> {
  return post<ContributeResult>("catalog/species/contribute", submission);
}

/** File a journal entry. Lands pending; an administrator publishes it. */
export function contributeSighting(
  submission: SightingSubmission,
): Promise<ContributeResult> {
  return post<ContributeResult>("journal/sightings/contribute", submission);
}

/**
 * The API's most useful sentence out of a DRF error body, or `null`.
 *
 * DRF answers `{field: ["message"], ...}` for a validation error and
 * `{detail: "…"}` for everything else, and the flow's stages are not the API's
 * fields - a rejected `species` belongs to stage 1 while a rejected `latitude`
 * belongs to stage 2 - so a per-field mapping would be a second copy of the form's
 * structure. The first message wins, prefixed with nothing: it is shown beside a
 * generic "could not save" line the caller translates.
 */
export function firstErrorMessage(error: unknown): string | null {
  if (!(error instanceof ContributeError)) return null;

  const flatten = (value: unknown): string | null => {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = flatten(item);
        if (found) return found;
      }
      return null;
    }
    if (value && typeof value === "object") {
      for (const item of Object.values(value)) {
        const found = flatten(item);
        if (found) return found;
      }
    }
    return null;
  };

  return flatten(error.data.detail ?? error.data);
}

/**
 * How many photos one submission may carry.
 *
 * Mirrors `MAX_CONTRIBUTION_PHOTOS` in animals-api's `core/contributions.py`. The
 * API is what enforces it; this is so the picker can refuse the eleventh file with
 * a sentence rather than letting the whole submission 400 after the upload.
 */
export const MAX_PHOTOS = 10;

/**
 * The largest file the picker accepts, per photo.
 *
 * The real ceiling is Django's `DATA_UPLOAD_MAX_MEMORY_SIZE` (10 MB) applied to
 * the **whole** JSON body, and base64 inflates a file by about a third - so ten
 * photos at 4 MB would be refused as one 53 MB request no matter what each file
 * weighed. Photos are therefore downscaled in the browser before they are encoded
 * (see `components/contribute/photo-picker.tsx`); this only rejects a file too
 * large to be worth decoding at all.
 */
export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
