import { apiReplaceImageBaseUrl } from './api-replace-image-base-url';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/** A single resource identifier (the minimal `{ id, type }` reference). */
export interface JsonApiResourceIdentifier {
  id: string;
  type: string;
}

/** Attributes dictionary — values may be any JSON-serialisable type. */
export type JsonApiAttributes = Record<string, unknown>;

/** A relationship value: either a single reference or an array of references. */
export interface JsonApiRelationshipData {
  data: JsonApiResourceIdentifier | JsonApiResourceIdentifier[] | null;
}

/** Map of relationship names to their data. */
export type JsonApiRelationships = Record<string, JsonApiRelationshipData>;

/** A full JSON:API resource object with optional attributes & relationships. */
export interface JsonApiResource extends JsonApiResourceIdentifier {
  attributes?: JsonApiAttributes;
  relationships?: JsonApiRelationships;
}

/**
 * Top-level JSON:API response envelope.
 *
 * `data` may be a single resource, an array of resources, or `null`.
 * `included` carries the side-loaded resources used for denormalization.
 */
export interface JsonApiResponse {
  data: JsonApiResource | JsonApiResource[] | null;
  included?: JsonApiResource[];
}

/**
 * A relationship item as it appears before resolution — it may carry the
 * reference inside a nested `data` wrapper **or** directly at the top level.
 */
interface RelationshipItem {
  id?: string;
  type?: string;
  data?: JsonApiResource | JsonApiResource[] | null;
  attributes?: JsonApiAttributes;
  relationships?: JsonApiRelationships;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Returns a deep-enough clone of a {@link JsonApiAttributes} object so that
 * mutations to the clone never affect the original.
 */
const cloneAttributes = (attributes: JsonApiAttributes): JsonApiAttributes => ({
  ...attributes,
});

/**
 * Replaces internal K8s image URLs with public URLs in every **string** value
 * of the given attributes object.  Returns a new object — the original is
 * never mutated.
 *
 * @param attributes - The attributes dictionary to process.
 * @returns A new attributes object with URLs replaced.
 */
const replaceImageUrlsInAttributes = (
  attributes: JsonApiAttributes,
): JsonApiAttributes => {
  const result = cloneAttributes(attributes);

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'string') {
      result[key] = apiReplaceImageBaseUrl(value);
    }
  }

  return result;
};

/**
 * Walks a resource (or relationship wrapper) and replaces internal image URLs
 * in all `attributes` dictionaries it finds.  Returns a **new** object — the
 * original is never mutated.
 *
 * Handles three shapes:
 * 1. `{ attributes }` — top-level resource
 * 2. `{ data: { attributes } }` — relationship wrapper with a single resource
 * 3. `{ data: [{ attributes }, …] }` — relationship wrapper with an array
 *
 * @param rawItem - The resource or relationship wrapper to process.
 * @returns A shallow copy of `rawItem` with all image URLs replaced.
 */
export const replaceImageUrls = <T extends RelationshipItem>(rawItem: T): T => {
  const item = { ...rawItem };

  if (item.attributes) {
    item.attributes = replaceImageUrlsInAttributes(item.attributes);
  }

  if (item.data && typeof item.data === 'object' && !Array.isArray(item.data)) {
    const resource = item.data as JsonApiResource;
    if (resource.attributes) {
      item.data = {
        ...resource,
        attributes: replaceImageUrlsInAttributes(resource.attributes),
      };
    }
  }

  if (Array.isArray(item.data)) {
    item.data = item.data.map((entry) =>
      entry.attributes
        ? {
            ...entry,
            attributes: replaceImageUrlsInAttributes(entry.attributes),
          }
        : { ...entry },
    );
  }

  return item;
};

/* ------------------------------------------------------------------ */
/*  Core denormalization                                              */
/* ------------------------------------------------------------------ */

/**
 * Extracts the `{ id, type }` pair from a relationship item, regardless of
 * whether the values sit at the top level or inside a `.data` wrapper.
 */
const extractIdentifier = (
  item: RelationshipItem,
): { id: string | null; type: string | null } => {
  const id =
    item.id ??
    (item.data && !Array.isArray(item.data) ? item.data.id : null) ??
    null;
  const type =
    item.type ??
    (item.data && !Array.isArray(item.data) ? item.data.type : null) ??
    null;
  return { id, type };
};

/**
 * Resolves a single relationship item against the `included` array.
 *
 * If a matching resource is found in `included`, the item is replaced (or its
 * `.data` is replaced) with the full resource.  Nested relationships on the
 * resolved resource are recursively denormalized as well.
 *
 * The original `item` is **never** mutated — all work is done on copies.
 *
 * @param item     - The relationship item to resolve.
 * @param included - The pool of side-loaded resources.
 * @returns The resolved (and URL-rewritten) relationship item.
 */
const resolveIncludedResource = (
  item: RelationshipItem,
  included: JsonApiResource[],
): RelationshipItem => {
  if (!included.length) return item;

  let resolved: RelationshipItem = { ...item };
  const { id, type } = extractIdentifier(resolved);

  if (!id || !type) return resolved;

  const match = included.find((inc) => inc.id === id && inc.type === type);

  if (match) {
    if (resolved.id) {
      resolved = { ...match };
    } else {
      resolved = { ...resolved, data: { ...match } };
    }
  }

  // Recursively denormalize nested relationships.
  if (resolved.relationships) {
    resolved = denormalizeResource(resolved as JsonApiResource, included);
  } else if (
    resolved.data &&
    !Array.isArray(resolved.data) &&
    resolved.data.relationships
  ) {
    resolved = {
      ...resolved,
      data: denormalizeResource(resolved.data as JsonApiResource, included),
    };
  }

  return replaceImageUrls(resolved);
};

/**
 * Denormalizes a single JSON:API resource by resolving all of its
 * `relationships` against the `included` pool.
 *
 * Returns a **new** resource — the original is never mutated.
 *
 * @param rawResource - The resource whose relationships should be resolved.
 * @param included    - The pool of side-loaded resources.
 * @returns A new resource with denormalized relationships and rewritten URLs.
 */
const denormalizeResource = (
  rawResource: JsonApiResource,
  included: JsonApiResource[],
): JsonApiResource => {
  const resource = replaceImageUrls({ ...rawResource });

  if (!resource.relationships) return resource;

  const resolvedRelationships: JsonApiRelationships = {};

  for (const [name, rel] of Object.entries(resource.relationships)) {
    if (Array.isArray(rel.data)) {
      resolvedRelationships[name] = {
        data: rel.data.map(
          (ref) =>
            resolveIncludedResource({ ...ref }, included) as JsonApiResource,
        ),
      };
    } else {
      resolvedRelationships[name] = resolveIncludedResource(
        { ...rel },
        included,
      ) as JsonApiRelationshipData;
    }
  }

  return { ...resource, relationships: resolvedRelationships };
};

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Denormalizes a full JSON:API response by resolving every resource's
 * `relationships` against the `included` side-loaded resources and rewriting
 * internal K8s image URLs to their public equivalents.
 *
 * The original response object is **never** mutated.
 *
 * @param response - The raw JSON:API response envelope.
 * @returns A new response object with all resources fully denormalized.
 *
 * @example
 * ```ts
 * const raw = await fetch('/api/articles?include=author').then(r => r.json());
 * const denormalized = rebuildJsonApiResponse(raw);
 * ```
 */
export const rebuildJsonApiResponse = (
  response: JsonApiResponse,
): JsonApiResponse => {
  const included = response.included ?? [];

  if (Array.isArray(response.data)) {
    return {
      ...response,
      data: response.data.map((resource) =>
        denormalizeResource({ ...resource }, included),
      ),
    };
  }

  if (response.data) {
    return {
      ...response,
      data: denormalizeResource({ ...response.data }, included),
    };
  }

  return { ...response };
};
