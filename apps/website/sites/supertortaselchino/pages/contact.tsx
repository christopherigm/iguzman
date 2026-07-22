import { getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Container } from "@repo/ui/core-elements/container";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import { getSystem } from "@/lib/system";

/**
 * "/contact" page for Super Tortas El Chino. The backend has no dedicated
 * contact fields, so this is an honest "order / get in touch" invitation that
 * routes visitors to the menu the shop actually offers, rather than inventing
 * phone/address/hours in the frontend - those live in the CMS (as company
 * highlights) so the owner keeps them current. Served via the site's `pages`
 * map through the catch-all.
 *
 * Server Component: it clears the fixed navbar with props-first padding using
 * the shared @repo/ui CSS var, never the heavy "use client" navbar module. A
 * calm neutral `--surface-2` band, not a brand gradient - the primary CTA
 * carries the brand color.
 */
export async function Contact() {
  const [system, t] = await Promise.all([
    getSystem(),
    getTranslations("SuperTortasSite"),
  ]);

  const primary = system?.primary_color ?? "#f2711c";
  // The tortas are MenuItems (food), not products - link the food listing, and
  // gate the CTA so it never lands on an empty listing before seeding.
  const hasTortas = (system?.menu_item_count ?? 0) > 0;

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

          {hasTortas && (
            <Box marginTop="8px">
              <Button
                text={t("contact.menuCta")}
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
