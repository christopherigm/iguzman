import { getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Container } from "@repo/ui/core-elements/container";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import { getSystem } from "@/lib/system";

/**
 * Bdrone "/contact" page. The backend has no dedicated contact fields, so this
 * is an honest "get in touch" invitation that routes visitors to what the
 * tenant actually offers (services/products) rather than inventing contact
 * details. Served via the site's `pages` map through the catch-all route.
 */
export async function Contact() {
  const [system, t] = await Promise.all([
    getSystem(),
    getTranslations("BdroneSite"),
  ]);

  const primary = system?.primary_color ?? "#2196f3";
  const hasServices = (system?.service_count ?? 0) > 0;
  const hasProducts = (system?.product_count ?? 0) > 0;

  // Full-bleed band that starts under the fixed navbar; paddingTop clears it via
  // the shared @repo/ui CSS var, so we avoid importing the heavy "use client"
  // navbar module into this server component just for a spacer. A calm neutral
  // surface, not a brand gradient - the primary CTA carries the brand.
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
            styles={{ opacity: 0.8 }}
          >
            {t("contact.subtitle")}
          </Typography>

          <Box
            display="flex"
            gap="14px"
            flexWrap="wrap"
            justifyContent="center"
            marginTop="8px"
          >
            {hasServices && (
              <Button
                text={t("contact.servicesCta")}
                href="/services"
                kind="primary"
                size="lg"
              />
            )}
            {hasProducts && (
              <Button
                text={t("contact.productsCta")}
                href="/products"
                size="lg"
              />
            )}
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
