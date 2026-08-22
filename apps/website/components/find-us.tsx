import { getLocale, getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { getSystem } from "@/lib/system";
import { getBranches } from "@/lib/branches";
import { branchHasCoordinates } from "@/lib/contact";
import { ContactLocations } from "@/components/contact/contact-locations";
import { LandingSection, type LandingBlockProps } from "./landing-section";

/**
 * Shared "where to find us" landing block: the tenant's physical locations, each
 * with its map, closed by a CTA over to the contact page.
 *
 * The one question a visitor has that none of the other landing blocks answers is
 * *where are you* - the catalog sells the thing, the highlights argue for it, and
 * neither says which street. So every site closes its landing with this, reading
 * the tenant's own `Branch` rows (main location first) straight from the CMS
 * (`/admin/branches`).
 *
 * **The cards are `ContactLocations`, the very component `/contact` renders** -
 * not a landing-shaped imitation of it. That is deliberate: this section used to
 * be a hand-built list of name + address rows on a `--surface-2` panel, which
 * meant the same locations were drawn two different ways on one site, and only
 * one of them carried the map, the phone/WhatsApp/email row and the directions
 * link. One component means a branch that gains coordinates gains its map in
 * both places at once. With a single location it is the prominent
 * detail-plus-map view; with several it becomes the grid of branch cards.
 *
 * It stays a **pointer to `/contact`, not a copy of it**: no contact form, no
 * site-wide email, no social links. The CTA hands the visitor over rather than
 * duplicating a page the tenant would then maintain in two places.
 *
 * All four strings default to the shared `FindUs` namespace, so `<FindUs />`
 * composes into any landing as-is; a site with a voice of its own for this beat
 * (tamaratours calls it the departure point) passes its own copy instead.
 *
 * Contained rather than full-bleed - an opaque band outside `SectionBand` would
 * paint over the tenant's logo watermark and page background. Renders nothing
 * until the tenant has a usable location, exactly like the other shared blocks.
 */
export interface FindUsProps extends LandingBlockProps {
  /** Small uppercase kicker above the heading. */
  eyebrow?: string;
  /** Section heading. */
  heading?: string;
  /** Supporting line under the heading. */
  subtitle?: string;
  /** Label of the button through to `/contact`. */
  ctaText?: string;
}

export async function FindUs({
  eyebrow,
  heading,
  subtitle,
  ctaText,
  ...section
}: FindUsProps = {}) {
  const [branches, system, locale, t] = await Promise.all([
    getBranches(),
    getSystem(),
    getLocale(),
    getTranslations("FindUs"),
  ]);

  // The API already drops disabled branches from the public list. What it cannot
  // know is that a row with neither an address nor coordinates has nothing to
  // show here - on a landing that is a blank card, so it is not worth a row.
  const locations = branches.filter(
    (branch) => branch.address || branchHasCoordinates(branch),
  );
  if (locations.length === 0) return null;

  return (
    <LandingSection {...section}>
      <Box display="flex" flexDirection="column" gap="24px">
        <Box display="flex" flexDirection="column" gap="10px">
          <Typography
            as="span"
            variant="label"
            color="var(--accent-text)"
            fontWeight={700}
            styles={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
          >
            {eyebrow ?? t("eyebrow")}
          </Typography>
          <Typography as="h2" variant="h2" fontWeight={800} margin={0}>
            {heading ?? t("heading")}
          </Typography>
          <Typography
            as="p"
            variant="body"
            color="var(--muted-foreground)"
            margin={0}
            styles={{ lineHeight: 1.7, maxWidth: "58ch" }}
          >
            {subtitle ?? t("subtitle")}
          </Typography>
        </Box>

        {/* `isAdmin={false}`: the Edit/Remove controls the contact page offers an
            admin belong on that page and in `/admin/branches`, not over the
            storefront's own landing - a delete confirmation is not a thing to
            put one mis-tap away on the page every visitor lands on. */}
        <ContactLocations
          branches={locations}
          locale={locale}
          isAdmin={false}
          pinIcon={system?.img_brandmark ?? null}
        />

        <Box display="flex" gap="16px" flexWrap="wrap" alignItems="center">
          <Button
            text={ctaText ?? t("cta")}
            href="/contact"
            kind="primary"
            size="lg"
          />
        </Box>
      </Box>
    </LandingSection>
  );
}

export default FindUs;
