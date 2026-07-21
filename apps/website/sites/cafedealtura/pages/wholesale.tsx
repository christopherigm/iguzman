import { getTranslations, getLocale } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Container } from "@repo/ui/core-elements/container";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import { getSystem } from "@/lib/system";
import { localized } from "../localized";

/**
 * "/mayoreo" - the wholesale page for Café de Altura, mounted from the site's
 * `pages` map. The farm already sells volume to buyers who resell its coffee,
 * so they get a page of their own rather than being funnelled through the
 * retail catalog.
 *
 * The backend has no contact fields, so this page does not invent a phone,
 * price list, or minimum order: it states the offer in translated UI copy,
 * grounds it in the family's own Mission text (DB-driven, CMS-editable), and
 * hands the visitor to the catalog and the farm's story. When the family wants
 * concrete terms here, they write them into Mission in the CMS.
 *
 * Server Component: the opening band clears the fixed navbar with props-first
 * padding via the shared @repo/ui CSS var, never the heavy "use client" navbar
 * module.
 */
export async function WholesalePage() {
  const [system, locale, t] = await Promise.all([
    getSystem(),
    getLocale(),
    getTranslations("CafeAlturaSite"),
  ]);

  const mission = localized(locale, system?.mission, system?.en_mission);
  const primary = system?.primary_color ?? "#6f4e37";
  const hasProducts = (system?.product_count ?? 0) > 0;

  return (
    <>
      <Box
        width="100%"
        paddingTop="var(--ui-navbar-height, 57px)"
        backgroundColor="var(--surface-2)"
      >
        <Container size="sm" paddingX={10}>
          <Box
            paddingY={72}
            display="flex"
            flexDirection="column"
            alignItems="center"
            gap="18px"
          >
            <Typography
              as="span"
              variant="label"
              color={primary}
              fontWeight={700}
              styles={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
            >
              {t("wholesalePage.eyebrow")}
            </Typography>
            <Typography
              as="h1"
              variant="h1"
              fontWeight={800}
              textAlign="center"
            >
              {t("wholesalePage.heading")}
            </Typography>
            <Typography
              as="p"
              variant="h4"
              textAlign="center"
              fontWeight={400}
              maxWidth={620}
            >
              {t("wholesalePage.subtitle")}
            </Typography>

            <Box
              display="flex"
              gap="14px"
              flexWrap="wrap"
              justifyContent="center"
              marginTop="8px"
            >
              {hasProducts && (
                <Button
                  text={t("wholesalePage.productsCta")}
                  href="/categories/products"
                  kind="primary"
                  size="lg"
                />
              )}
              <Button
                text={t("wholesalePage.aboutCta")}
                href="/about"
                size="lg"
              />
            </Box>
          </Box>
        </Container>
      </Box>

      {mission && (
        <Container
          size="sm"
          paddingX={10}
          paddingBottom="var(--ui-page-bottom-spacing, 64px)"
        >
          <Box paddingY={64} display="flex" flexDirection="column" gap="16px">
            <Typography as="h2" variant="h2" fontWeight={800}>
              {t("wholesalePage.commitmentHeading")}
            </Typography>
            <Box
              paddingLeft={20}
              styles={{ borderLeft: "3px solid var(--accent)" }}
            >
              <Typography
                as="p"
                variant="body"
                styles={{ whiteSpace: "pre-line", lineHeight: 1.75 }}
              >
                {mission}
              </Typography>
            </Box>
          </Box>
        </Container>
      )}
    </>
  );
}
