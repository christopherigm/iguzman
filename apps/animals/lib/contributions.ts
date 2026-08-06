/**
 * The browser half of "My contributions" - what a signed-in reader has filed,
 * and the only place they may correct or withdraw it.
 *
 * The other direction of `lib/contribute.ts`. That module deliberately had two
 * functions and a note saying it should stay that way, because "a contribute
 * update endpoint would mean a pending record editable after review had
 * started". This is that decision revisited rather than ignored, and the thing
 * that makes it safe is on the API side: an edit **un-publishes** the record
 * (animals-api's `ContributionUpdateSerializer`), so a correction to something
 * already on the site goes back into the review queue instead of going live
 * unreviewed. See `CONTRIBUTION_STATUSES` below.
 *
 * Every call goes to the same-origin `/api/contributions/*` route handlers,
 * which attach the bearer token from the HTTP-only cookie and refresh it on a
 * 401 - so, exactly as in `lib/contribute.ts` and `lib/admin-api.ts`, there is
 * no token for this module to hold.
 */

import { ContributeError } from "@/lib/contribute";

/**
 * The three record types the contribute flow can create. The values are the URL
 * segments animals-api uses (`/api/contributions/<type>/<pk>/`) and this app's
 * own detail route (`/contributions/<type>/<id>`), so one string serves both.
 */
export const CONTRIBUTION_TYPES = ["sightings", "species", "locations"] as const;
export type ContributionType = (typeof CONTRIBUTION_TYPES)[number];

/** What one row calls itself on a payload - the singular of the type above. */
export type ContributionKind = "sighting" | "species" | "location";

/** The URL segment for a payload's `type`. The two differ only for a sighting. */
export const TYPE_FOR_KIND: Record<ContributionKind, ContributionType> = {
  sighting: "sightings",
  species: "species",
  location: "locations",
};

export function isContributionType(
  value: string | undefined,
): value is ContributionType {
  return CONTRIBUTION_TYPES.includes(value as ContributionType);
}

/**
 * The three states a contribution can be in.
 *
 * ⚠ `pending` and `in_review` are the **same row state** on the API - both are
 * `enabled: false` - and are told apart by `was_published`. The distinction is
 * the whole reason that column exists, and it is not cosmetic:
 *
 * - `pending` - filed, never yet published. Nothing has been lost by waiting.
 * - `published` - live on the public site.
 * - `in_review` - was live; its author edited it, so it has come **off** the
 *   public site until the edit is approved.
 *
 * A reader has to be told the third apart from the first, or editing a
 * published entry looks like it silently deleted their page.
 */
export const CONTRIBUTION_STATUSES = [
  "pending",
  "published",
  "in_review",
] as const;
export type ContributionStatus = (typeof CONTRIBUTION_STATUSES)[number];

export function isContributionStatus(
  value: string | undefined,
): value is ContributionStatus {
  return CONTRIBUTION_STATUSES.includes(value as ContributionStatus);
}

/**
 * One tile in the contributions grid.
 *
 * Deliberately **not** the record's full read payload: a grid of 24 tiles does
 * not need 24 galleries and 24 descriptions, so animals-api hand-builds this
 * shape (`core/my_contributions.py` → `_card`). The per-type fields below are
 * optional for that reason rather than because they are sometimes missing - a
 * sighting always has `date`, a species never does.
 */
export interface ContributionCard {
  type: ContributionKind;
  id: number;
  slug: string;
  name: string | null;
  en_name: string | null;
  status: ContributionStatus;
  enabled: boolean;
  was_published: boolean;
  created: string;
  modified: string;
  image: string | null;
  icon?: string | null;
  /** A sighting's day. `null` on the two catalog records. */
  date: string | null;

  // Sighting only.
  species_name?: string | null;
  species_en_name?: string | null;
  location_name?: string | null;
  location_en_name?: string | null;
  has_video?: boolean;

  // Species only.
  scientific_name?: string | null;
  category_name?: string | null;
  category_en_name?: string | null;

  // Location only.
  place_type?: string | null;
  county_name?: string | null;
}

export interface ContributionPage {
  count: number;
  limit: number;
  offset: number;
  results: ContributionCard[];
}

/**
 * A record's full read payload, as the edit form prefills from.
 *
 * It **is** the record's normal read shape - the same one every other read of
 * that resource gives - plus the three contribution fields. Typed loosely
 * because the three records have genuinely different shapes and each form reads
 * only its own; the alternative is a discriminated union repeating three
 * payloads that `lib/catalog.ts` and `lib/journal.ts` already describe.
 */
export type ContributionDetail = Record<string, unknown> & {
  id: number;
  slug: string;
  type: ContributionKind;
  contribution_status: ContributionStatus;
  was_published: boolean;
};

/**
 * One entry in a `photos` edit: keep a stored row, or add a new photograph.
 *
 * ⚠ **The list is the gallery afterwards, not the additions to it** - a stored
 * row left out is deleted, and `sort_order` is the index in the array, so
 * `photos[0]` is the cover. See animals-api's `photos_patch_field`; it is what
 * lets the edit form keep the filing form's single Submit button instead of
 * turning one intention into three requests that can each half-fail.
 */
/**
 * What turns one of the three contribute forms from a filing form into an edit
 * form.
 *
 * The forms are shared rather than duplicated because a contributor correcting a
 * sighting should meet the form they filled in, not a different one - which was
 * the explicit brief for this page. So each form takes this prop plus its own
 * `initial…` values, and everything else about it is unchanged: the same stages,
 * the same fields, the same validation.
 *
 * Absent, the form files a new record. Present, it PATCHes this one.
 */
export interface ContributionEdit {
  id: number;
  /** Where the record stands *now* - what decides whether to warn before saving. */
  status: ContributionStatus;
  /**
   * Called after a successful save, with the status the record now has.
   *
   * ⚠ It is passed the status **from the response**, not the one above: saving a
   * `published` record makes it `in_review`, and the page has to be able to say
   * so. Never assume the status survived the save.
   */
  onSaved: (status: ContributionStatus) => void;
}

export type PhotoPatch = { id: number } | { image: string };

/**
 * The `photos` diff for a picker's current tiles, in their current order.
 *
 * A tile that came off the record keeps its row (`{id}`); one the contributor
 * just picked is sent as a data URL. So an edit that only re-orders uploads
 * nothing at all - it sends three ids in a new order - which is the difference
 * between changing a cover instantly and re-uploading a whole gallery over
 * cellular data.
 */
export function photoPatch(
  photos: { id?: number; dataUrl: string }[],
): PhotoPatch[] {
  return photos.map((photo) =>
    photo.id !== undefined ? { id: photo.id } : { image: photo.dataUrl },
  );
}

/**
 * A record's stored gallery as picker tiles.
 *
 * `dataUrl` holds the **stored** URL here rather than a data URL - the picker
 * only ever renders it, and `PickedPhoto.id` is what tells the two apart when
 * the diff is built. `name` falls back to the record's own so the alt text is
 * never empty; a gallery row's caption is optional and usually absent.
 */
export function galleryAsPhotos(
  rows: { id: number; image: string | null; name?: string | null }[] | undefined,
  fallbackName: string,
): { key: string; dataUrl: string; name: string; id: number }[] {
  return (rows ?? [])
    .filter((row): row is typeof row & { image: string } => Boolean(row.image))
    .map((row) => ({
      key: `stored-${row.id}`,
      dataUrl: row.image,
      name: row.name?.trim() || fallbackName,
      id: row.id,
    }));
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/contributions/${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!res.ok) {
    const data: Record<string, unknown> = await res.json().catch(() => ({}));
    // The same error type the filing flow raises, so `firstErrorMessage` works
    // on both and a form does not need two catch branches.
    throw new ContributeError(res.status, data);
  }
  // 204 from a withdrawal - there is no body to parse.
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Everything this account has filed, newest first across all three types. */
export function listContributions(params: {
  type?: ContributionType;
  status?: ContributionStatus;
  limit?: number;
  offset?: number;
} = {}): Promise<ContributionPage> {
  const query = new URLSearchParams();
  if (params.type) query.set("type", params.type);
  if (params.status) query.set("status", params.status);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));

  const suffix = query.toString();
  return request<ContributionPage>(suffix ? `?${suffix}` : "");
}

/** One record, in the shape its edit form prefills from. */
export function getContribution(
  type: ContributionType,
  id: number,
): Promise<ContributionDetail> {
  return request<ContributionDetail>(`${type}/${id}`);
}

/**
 * Correct a record.
 *
 * ⚠ **This un-publishes a published record.** The response's
 * `contribution_status` is what actually happened - read it rather than assuming
 * the record stayed as it was.
 */
export function updateContribution(
  type: ContributionType,
  id: number,
  body: Record<string, unknown>,
): Promise<ContributionDetail> {
  return request<ContributionDetail>(`${type}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/**
 * Withdraw a record.
 *
 * May be refused with a **409**: a published species that other people's
 * sightings now reference is protected on the API side, which is what stops one
 * withdrawal taking somebody else's journal entries with it.
 */
export function deleteContribution(
  type: ContributionType,
  id: number,
): Promise<void> {
  return request<void>(`${type}/${id}`, { method: "DELETE" });
}
