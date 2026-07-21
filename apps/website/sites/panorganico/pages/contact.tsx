import { getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Container } from "@repo/ui/core-elements/container";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import { getSystem } from "@/lib/system";

/**
 * "/contact" page for Pan que hace bien. The backend has no dedicated contact
 * fields, so this is an honest "order / get in touch" invitation that routes
 * visitors to the breads the baker actually offers, rather than inventing
 * contact details. Served via the site's `pages` map through the catch-all.
 *
 * Server Component: it clears the fixed navbar with props-first padding using
 * the shared @repo/ui CSS var, never the heavy "use client" navbar module. A
 * calm neutral `--surface-2` band, not a brand gradient - the primary CTA
 * carries the brand color.
 */
export async function Contact() {
  const [system, t] = await Promise.all([
    getSystem(),
    getTranslations("PanOrganicoSite"),
  ]);

  const primary = system?.primary_color ?? "#8a5a2b";
  // The breads are MenuItems (food), not products - counting/linking products
  // here would hide the CTA and, when shown, land on an empty listing.
  const hasBreads = (system?.menu_item_count ?? 0) > 0;

  return (
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
            {t("contact.eyebrow")}
          </Typography>
          <Typography as="h1" variant="h1" fontWeight={800} textAlign="center">
            {t("contact.heading")}
          </Typography>
          <Typography
            as="p"
            variant="h4"
            textAlign="center"
            fontWeight={400}
            maxWidth={560}
          >
            {t("contact.subtitle")}
          </Typography>

          {hasBreads && (
            <Box marginTop="8px">
              <Button
                text={t("contact.productsCta")}
                href="/categories/food"
                kind="primary"
                size="lg"
              />
            </Box>
          )}
        </Box>
      </Container>
    </Box>
  );
}
