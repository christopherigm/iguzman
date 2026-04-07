/**
 * Generates favicon and PWA manifest icons from a logo image.
 *
 * Runs entirely in the browser using the Canvas API — do **not** import this
 * in a Node.js / server-side context.
 */

export interface LogoAssets {
  /** 32×32 ICO (single embedded PNG) for use as `img_favicon`. */
  img_favicon: string;
  /** 1080×1080 PNG for use as `img_manifest_1080`. */
  img_manifest_1080: string;
  /** 512×512 PNG for use as `img_manifest_512`. */
  img_manifest_512: string;
  /** 256×256 PNG for use as `img_manifest_256`. */
  img_manifest_256: string;
  /** 192×192 PNG for use as `img_manifest_192`. */
  img_manifest_192: string;
  /** 128×128 PNG for use as `img_manifest_128`. */
  img_manifest_128: string;
}

/** Loads a base64 / data-URI string into an HTMLImageElement. */
const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load logo image'));
    img.src = src;
  });

/**
 * Draws the logo letter-boxed (centered, aspect-ratio preserved) on a
 * transparent square canvas and returns a PNG data URI.
 */
const logoToSquarePng = (img: HTMLImageElement, size: number): string => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight);
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const x = Math.round((size - w) / 2);
  const y = Math.round((size - h) / 2);
  ctx.drawImage(img, x, y, w, h);

  return canvas.toDataURL('image/png');
};

/**
 * Wraps a PNG data URI inside a single-image ICO binary (format version 1).
 *
 * Modern browsers and operating systems accept ICO files that embed a raw
 * PNG payload, which avoids lossy BMP conversion.
 */
const pngDataUrlToIco = (pngDataUrl: string): string => {
  const base64 = pngDataUrl.replace(/^data:[^;]+;base64,/, '');
  const pngBinary = atob(base64);
  const pngBytes = new Uint8Array(pngBinary.length);
  for (let i = 0; i < pngBinary.length; i++) {
    pngBytes[i] = pngBinary.charCodeAt(i);
  }

  // ICONDIR (6 bytes) + ICONDIRENTRY (16 bytes) = 22 bytes header
  const buffer = new ArrayBuffer(22 + pngBytes.length);
  const view = new DataView(buffer);

  // ICONDIR
  view.setUint16(0, 0, true); // reserved — must be 0
  view.setUint16(2, 1, true); // type: 1 = ICO
  view.setUint16(4, 1, true); // number of images

  // ICONDIRENTRY
  view.setUint8(6, 32); // width  (32 px)
  view.setUint8(7, 32); // height (32 px)
  view.setUint8(8, 0); // color count (0 = no palette / true-color)
  view.setUint8(9, 0); // reserved
  view.setUint16(10, 1, true); // color planes
  view.setUint16(12, 32, true); // bits per pixel
  view.setUint32(14, pngBytes.length, true); // size of image data
  view.setUint32(18, 22, true); // offset to image data (right after header)

  new Uint8Array(buffer).set(pngBytes, 22);

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return `data:image/x-icon;base64,${btoa(binary)}`;
};

/**
 * Derives a complete set of favicon and PWA manifest icons from a logo.
 *
 * Each output image is square with the logo letter-boxed on a transparent
 * background.  The favicon is a valid single-image ICO file with an embedded
 * 32×32 PNG payload.
 *
 * @param logoBase64 - Base64 data URI of the source logo (any image format
 *   accepted by `HTMLImageElement`, e.g. PNG, JPEG, WEBP, SVG).
 * @returns A {@link LogoAssets} object containing data URIs for all five
 *   derived assets.
 *
 * @example
 * ```ts
 * import logoToAssets from '@repo/helpers/logo-to-assets';
 *
 * const assets = await logoToAssets(logoDataUrl);
 * // assets.img_favicon        → data:image/x-icon;base64,...
 * // assets.img_manifest_1080  → data:image/png;base64,...
 * // assets.img_manifest_512   → data:image/png;base64,...
 * // assets.img_manifest_256   → data:image/png;base64,...
 * // assets.img_manifest_192   → data:image/png;base64,...
 * // assets.img_manifest_128   → data:image/png;base64,...
 * ```
 */
const logoToAssets = async (logoBase64: string): Promise<LogoAssets> => {
  const img = await loadImage(logoBase64);
  const favicon32 = logoToSquarePng(img, 32);

  return {
    img_favicon: pngDataUrlToIco(favicon32),
    img_manifest_1080: logoToSquarePng(img, 1080),
    img_manifest_512: logoToSquarePng(img, 512),
    img_manifest_256: logoToSquarePng(img, 256),
    img_manifest_192: logoToSquarePng(img, 192),
    img_manifest_128: logoToSquarePng(img, 128),
  };
};

export default logoToAssets;
