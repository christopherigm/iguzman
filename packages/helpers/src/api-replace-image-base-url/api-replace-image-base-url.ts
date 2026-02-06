const NODE_ENV = process.env.NODE_ENV ?? 'development';

/**
 * Returns the public-facing API base URL.
 *
 * In non-production environments the URL defaults to `http://127.0.0.1:8000`.
 * In production the value is read from `process.env.URL_BASE`.
 */
const getBaseUrl = (): string => {
  if (NODE_ENV !== 'production') {
    return 'http://127.0.0.1:8000';
  }
  return process.env.URL_BASE ?? '';
};

/**
 * Returns the internal Kubernetes service base URL.
 *
 * In non-production environments the URL defaults to `http://127.0.0.1:8000`.
 * In production the value is read from `process.env.K8S_URL_BASE`, falling
 * back to `process.env.URL_BASE` when the K8s-specific variable is not set.
 */
const getK8sBaseUrl = (): string => {
  if (NODE_ENV !== 'production') {
    return 'http://127.0.0.1:8000';
  }
  return process.env.K8S_URL_BASE ?? process.env.URL_BASE ?? '';
};

/**
 * Replaces all occurrences of the internal Kubernetes base URL with the
 * public-facing API base URL in the given string.
 *
 * This is typically used to rewrite image/asset URLs returned by internal
 * services so that they are accessible from the public internet.
 *
 * @param img - The string (usually a URL) to process.
 * @returns The string with all internal URLs replaced by the public URL,
 *          or an empty string if `img` is falsy.
 */
export const apiReplaceImageBaseUrl = (img: string = ''): string => {
  if (!img) {
    return '';
  }
  const publicBaseUrl = getBaseUrl();
  const k8sBaseUrl = getK8sBaseUrl();
  return img.replaceAll(k8sBaseUrl, publicBaseUrl);
};
