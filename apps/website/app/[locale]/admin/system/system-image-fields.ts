/** The System record's image fields, grouped as they are laid out in the form. */

/** Brand/content images the customer uploads by hand. */
export const BRAND_IMAGE_FIELDS = [
  "img_logo",
  "img_logo_hero",
  "img_favicon",
  "img_hero",
  "img_about",
] as const;

/** PWA manifest icons, one per size. */
export const MANIFEST_IMAGE_FIELDS = [
  "img_manifest_1080",
  "img_manifest_512",
  "img_manifest_256",
  "img_manifest_192",
  "img_manifest_128",
] as const;

export const SYSTEM_IMAGE_FIELDS = [
  ...BRAND_IMAGE_FIELDS,
  ...MANIFEST_IMAGE_FIELDS,
] as const;

export type SystemImageField = (typeof SYSTEM_IMAGE_FIELDS)[number];

/** Fields auto-generated from the logo when the user confirms. */
export const LOGO_DERIVED_FIELDS = [
  "img_favicon",
  ...MANIFEST_IMAGE_FIELDS,
] as const;

export type LogoDerivedField = (typeof LOGO_DERIVED_FIELDS)[number];

export const isLogoDerivedField = (field: string): field is LogoDerivedField =>
  (LOGO_DERIVED_FIELDS as readonly string[]).includes(field);
