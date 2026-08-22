"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { RecreateIdsButton } from "@/components/admin/recreate-ids-button";

/**
 * The tenant's slug namespace, and the button that rebuilds the catalog from it.
 *
 * Eleven models on this platform carry a `slug` that is unique across the whole
 * database, not per tenant - so without a namespace the first customer to sell a
 * "Latte" takes that URL away from every other customer on the box.
 * `System.site_prefix` is that namespace: every slug the CMS writes is
 * `{site_prefix}-{name}`.
 *
 * ⚠ **Editing the field re-slugs nothing.** A record's slug is derived once,
 * when it is created - which is what stops a URL moving every time somebody
 * fixes a typo in a name - so after a change here the whole catalog is still
 * namespaced under the old prefix until "Recreate IDs" is pressed. The two
 * steps are separate because the second one changes every public URL on the
 * site at once, and the confirmation is where that is said out loud.
 *
 * **Users and coupons are deliberately outside all of this.** A login is
 * composed from `(system_id, email)` and re-deriving it would sign every
 * customer out; a coupon code is already unique per system and is typed off a
 * printed flyer, so prefixing it would only make it longer to type.
 */

/** Mirrors `System.site_prefix`'s own `max_length`. */
const SITE_PREFIX_MAX_LENGTH = 32;

/**
 * The characters a slug may contain, applied as the operator types.
 *
 * The API takes a `SlugField` and refuses anything else, but a space or an
 * accent typed here would otherwise fail on save with a message about a field
 * the operator cannot see the rules for. Lower-cased for the same reason: the
 * value is concatenated into URLs, which are conventionally lower-case, and the
 * API's own `slugify` would quietly change it anyway.
 */
function cleanPrefix(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, SITE_PREFIX_MAX_LENGTH);
}

interface SitePrefixSectionProps {
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  /** True while the System is still loading, so the field cannot be typed into. */
  loading?: boolean;
}

export function SitePrefixSection({
  values,
  onChange,
  loading,
}: SitePrefixSectionProps) {
  const t = useTranslations("Admin");
  const prefix = String(values.site_prefix ?? "");

  return (
    <Box flexDirection="column" gap={16}>
      <Typography as="h3" variant="h4" fontWeight={700}>
        {t("sitePrefixTitle")}
      </Typography>
      <Typography variant="body" color="var(--muted-foreground, #6b7280)">
        {t("sitePrefixIntro")}
      </Typography>

      <TextInput
        label={t("sitePrefix")}
        value={prefix}
        onChange={(next) => onChange("site_prefix", cleanPrefix(next))}
        maxLength={SITE_PREFIX_MAX_LENGTH}
        disabled={loading}
      />

      {/* A worked example, built from what is actually in the box, so the
          consequence of an edit is visible before it is saved rather than after
          the catalog has been rebuilt against it. */}
      <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
        {t("sitePrefixExample", { slug: `${prefix || "…"}-cafe-americano` })}
      </Typography>

      {/* No `models`: this is the whole-site rebuild, beside the field that
          drives it - which is where an operator lands after changing it. The
          per-list buttons on the CMS lists are the same component, scoped. */}
      <Box flexDirection="column" gap={8}>
        <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
          {t("recreateIdsIntro")}
        </Typography>
        <Box>
          <RecreateIdsButton disabled={loading} />
        </Box>
      </Box>
    </Box>
  );
}
