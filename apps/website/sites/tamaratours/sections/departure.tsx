import { getTranslations, getLocale } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Container } from "@repo/ui/core-elements/container";
import { Typography } from "@repo/ui/core-elements/typography";
import { getBranches } from "@/lib/branches";
import { localized } from "../localized";

/**
 * "Punto de zarpe" - where the boats leave from.
 *
 * The one question every visitor to a tour operator's site has before booking is
 * *where do I meet you*, and it is the only thing on this landing the shared
 * blocks have no place for: the catalog sells the trip, the highlights argue for
 * it, and neither says which dock. So this closes the page with the tenant's own
 * `Branch` rows - name and address, main location first, straight from the CMS
 * (`/admin/branches`).
 *
 * It is a **pointer to `/contact`, not a copy of it**: no map, no phone list, no
 * social links, no form. The platform page already carries all of that (with an
 * `OsmMap` per branch), so the CTA hands the visitor over instead of duplicating
 * a page the tenant would then have to keep in sync in two places.
 *
 * Shape matters here as much as content: it is a single ruled information block,
 * deliberately unlike the card grids and the bordered `Spotlight` panel above
 * it, so the landing never reads as a run of the same rectangle. Contained
 * rather than full-bleed - an opaque band outside `SectionBand` would paint over
 * the tenant's logo watermark and page background.
 *
 * Renders nothing until the tenant has a branch, exactly like the shared blocks.
 */
export async function Departure() {
  const [branches, locale, t] = await Promise.all([
    getBranches(),
    getLocale(),
    getTranslations("TamaraToursSite"),
  ]);

  // An address is the whole point of the block, so a branch without one is not
  // worth a row; a tenant with no usable branch gets no section at all.
  const locations = branches.filter(
    (branch) => branch.enabled && branch.address,
  );
  if (locations.length === 0) return null;

  return (
    <Container paddingX={10}>
      <Box paddingY={64} display="flex" flexDirection="column" gap="24px">
        <Box display="flex" flexDirection="column" gap="10px">
          <Typography
            as="span"
            variant="label"
            color="var(--accent)"
            fontWeight={700}
            styles={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
          >
            {t("departure.eyebrow")}
          </Typography>
          <Typography as="h2" variant="h2" fontWeight={800} margin={0}>
            {t("departure.heading")}
          </Typography>
          <Typography
            as="p"
            variant="body"
            color="var(--muted-foreground)"
            margin={0}
            styles={{ lineHeight: 1.7, maxWidth: "58ch" }}
          >
            {t("departure.subtitle")}
          </Typography>
        </Box>

        <Box
          border="1px solid var(--border)"
          borderRadius={16}
          backgroundColor="var(--surface-2)"
          display="flex"
          flexDirection="column"
        >
          {locations.map((branch, index) => (
            <Box
              key={branch.id}
              padding={24}
              display="flex"
              flexDirection="column"
              gap="6px"
              // A rule between rows, never above the first one - the block's own
              // border already closes the top edge.
              styles={
                index > 0 ? { borderTop: "1px solid var(--border)" } : undefined
              }
            >
              <Typography as="h3" variant="h4" fontWeight={700} margin={0}>
                {localized(locale, branch.name, branch.en_name) ||
                  t("departure.fallbackName")}
              </Typography>
              <Typography
                as="p"
                variant="body"
                color="var(--muted-foreground)"
                margin={0}
                styles={{ whiteSpace: "pre-line", lineHeight: 1.6 }}
              >
                {branch.address}
              </Typography>
            </Box>
          ))}
        </Box>

        <Box display="flex" gap="16px" flexWrap="wrap" alignItems="center">
          <Button
            text={t("departure.contactCta")}
            href="/contact"
            kind="primary"
            size="lg"
          />
        </Box>
      </Box>
    </Container>
  );
}
