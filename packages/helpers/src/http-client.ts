/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  rebuildJsonApiResponse,
  type JsonApiResponse,
} from '@iguzman/helpers/json-api-rebuild';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type QueryParamValue = string | number | boolean | undefined;

export type QueryParams = Record<string, QueryParamValue>;

export interface HttpRequestOptions {
  baseUrl?: string;
  url: string;
  token?: string;
  jsonapi?: boolean;
  timeoutMs?: number;
}

export interface HttpRequestWithBodyOptions extends HttpRequestOptions {
  body: unknown;
}

export interface HttpRequestWithQueryOptions extends HttpRequestOptions {
  query?: QueryParams;
}

export type HttpGetOptions = HttpRequestWithQueryOptions;
export type HttpDeleteOptions = HttpRequestWithQueryOptions;
export type HttpPostOptions = HttpRequestWithBodyOptions;
export type HttpPutOptions = HttpRequestWithBodyOptions;
export type HttpPatchOptions = HttpRequestWithBodyOptions;

export interface HttpClientResult<T> {
  status: number;
  statusText: string;
  data: T;
  headers: Record<string, string>;
}

/* ------------------------------------------------------------------ */
/*  Error                                                             */
/* ------------------------------------------------------------------ */

export class HttpClientError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly url: string;
  readonly data: unknown;

  constructor(status: number, statusText: string, url: string, data: unknown) {
    super(`HTTP ${status} ${statusText} — ${url}`);
    this.name = 'HttpClientError';
    this.status = status;
    this.statusText = statusText;
    this.url = url;
    this.data = data;
  }
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                  */
/* ------------------------------------------------------------------ */

const resolveBaseUrl = (baseUrl?: string): string => {
  const resolved = baseUrl ?? process.env.BASE_URL;
  if (!resolved) {
    throw new Error(
      'http-client: no baseUrl provided and process.env.BASE_URL is not set.',
    );
  }
  return resolved;
};

const buildUrl = (
  baseUrl: string,
  path: string,
  query?: QueryParams,
): string => {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${base}${normalizedPath}`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
};

const buildHeaders = (
  token: string | undefined,
  jsonapi: boolean,
  hasBody: boolean,
): Record<string, string> => {
  const mediaType = jsonapi ? 'application/vnd.api+json' : 'application/json';
  const headers: Record<string, string> = {
    Accept: mediaType,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (hasBody) {
    headers['Content-Type'] = mediaType;
  }

  return headers;
};

const headersToRecord = (headers: Headers): Record<string, string> => {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
};

const executeRequest = async <T>(
  method: HttpMethod,
  options: HttpRequestOptions,
  body?: unknown,
  query?: QueryParams,
): Promise<HttpClientResult<T>> => {
  const { url: path, token, jsonapi = false, baseUrl, timeoutMs } = options;

  if (!path) throw new Error('http-client: url is required.');

  const resolvedBase = resolveBaseUrl(baseUrl);
  const fullUrl = buildUrl(resolvedBase, path, query);
  const headers = buildHeaders(token, jsonapi, body !== undefined);

  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  let controller: AbortController | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (timeoutMs !== undefined) {
    controller = new AbortController();
    init.signal = controller.signal;
    timeoutId = setTimeout(() => controller!.abort(), timeoutMs);
  }

  let response: Response;
  try {
    response = await fetch(fullUrl, init);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let errorData: unknown = null;
    try {
      errorData = await response.json();
    } catch {
      // response body is not JSON — leave as null
    }
    throw new HttpClientError(
      response.status,
      response.statusText,
      fullUrl,
      errorData,
    );
  }

  if (response.status === 204) {
    return {
      status: response.status,
      statusText: response.statusText,
      data: null as T,
      headers: headersToRecord(response.headers),
    };
  }

  let data: T = await response.json();

  if (jsonapi) {
    data = rebuildJsonApiResponse(
      data as unknown as JsonApiResponse,
    ) as unknown as T;
  }

  return {
    status: response.status,
    statusText: response.statusText,
    data,
    headers: headersToRecord(response.headers),
  };
};

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

// --- httpGet ---

export function httpGet<T = unknown>(
  options: HttpGetOptions & { jsonapi: true },
): Promise<HttpClientResult<JsonApiResponse>>;
export function httpGet<T = unknown>(
  options: HttpGetOptions,
): Promise<HttpClientResult<T>>;
export function httpGet<T = unknown>(
  options: HttpGetOptions,
): Promise<HttpClientResult<T>> {
  return executeRequest<T>('GET', options, undefined, options.query);
}

// --- httpPost ---

export function httpPost<T = unknown>(
  options: HttpPostOptions & { jsonapi: true },
): Promise<HttpClientResult<JsonApiResponse>>;
export function httpPost<T = unknown>(
  options: HttpPostOptions,
): Promise<HttpClientResult<T>>;
export function httpPost<T = unknown>(
  options: HttpPostOptions,
): Promise<HttpClientResult<T>> {
  return executeRequest<T>('POST', options, options.body);
}

// --- httpPut ---

export function httpPut<T = unknown>(
  options: HttpPutOptions & { jsonapi: true },
): Promise<HttpClientResult<JsonApiResponse>>;
export function httpPut<T = unknown>(
  options: HttpPutOptions,
): Promise<HttpClientResult<T>>;
export function httpPut<T = unknown>(
  options: HttpPutOptions,
): Promise<HttpClientResult<T>> {
  return executeRequest<T>('PUT', options, options.body);
}

// --- httpPatch ---

export function httpPatch<T = unknown>(
  options: HttpPatchOptions & { jsonapi: true },
): Promise<HttpClientResult<JsonApiResponse>>;
export function httpPatch<T = unknown>(
  options: HttpPatchOptions,
): Promise<HttpClientResult<T>>;
export function httpPatch<T = unknown>(
  options: HttpPatchOptions,
): Promise<HttpClientResult<T>> {
  return executeRequest<T>('PATCH', options, options.body);
}

// --- httpDelete ---

export function httpDelete<T = unknown>(
  options: HttpDeleteOptions & { jsonapi: true },
): Promise<HttpClientResult<JsonApiResponse>>;
export function httpDelete<T = unknown>(
  options: HttpDeleteOptions,
): Promise<HttpClientResult<T>>;
export function httpDelete<T = unknown>(
  options: HttpDeleteOptions,
): Promise<HttpClientResult<T>> {
  return executeRequest<T>('DELETE', options, undefined, options.query);
}
