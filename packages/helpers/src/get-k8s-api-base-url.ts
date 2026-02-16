import getEnvVariables from '@iguzman/helpers/get-env-variables';

/** Default API base URL used in non-production environments. */
const DEV_API_URL = 'http://127.0.0.1:8000';

/**
 * Resolves the Kubernetes-internal base URL for backend API requests.
 *
 * - In **non-production** (`NODE_ENV !== "production"`): returns {@link DEV_API_URL}.
 * - In **production**: prefers the `K8sURLBase` environment variable (the
 *   cluster-internal service address), falling back to the public `URLBase`
 *   when `K8sURLBase` is not set.
 *
 * @returns The absolute base URL to prefix server-side API requests with
 *
 * @example
 * ```ts
 * // development
 * getK8sApiBaseUrl(); // → "http://127.0.0.1:8000"
 *
 * // production (K8sURLBase = "http://api-svc.default.svc.cluster.local")
 * getK8sApiBaseUrl(); // → "http://api-svc.default.svc.cluster.local"
 * ```
 */
const getK8sApiBaseUrl = (): string => {
  if (process.env.NODE_ENV !== 'production') return DEV_API_URL;

  const { K8sURLBase, URLBase } = getEnvVariables();
  return K8sURLBase ?? URLBase ?? '';
};

export default getK8sApiBaseUrl;
