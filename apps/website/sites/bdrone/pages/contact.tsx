import type { CSSProperties } from "react";
import { getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Container } from "@repo/ui/core-elements/container";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import { getSystem } from "@/lib/system";
import "../bdrone.css";

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
  const secondary = system?.secondary_color ?? "#e040fb";
  const hasServices = (system?.service_count ?? 0) > 0;
  const hasProducts = (system?.product_count ?? 0) > 0;

  const ctaBase: CSSProperties = { fontWeight: 700, fontSize: "1rem" };
  const brandVar = { "--bdrone-brand": primary } as CSSProperties;

  // Full-bleed brand band that starts under the fixed navbar; paddingTop clears
  // it via the shared @repo/ui CSS var, so we avoid importing the heavy
  // "use client" navbar module into this server component just for a spacer.
  return (
    <Box
      width="100%"
      paddingTop="var(--ui-navbar-height, 57px)"
      styles={{
        background: `linear-gradient(135deg, ${primary}1f 0%, ${secondary}12 100%)`,
      }}
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
                unstyled
                className="bdrone-cta"
                backgroundColor={primary}
                color="#fff"
                padding="14px 26px"
                borderRadius={12}
                elevation={4}
                styles={ctaBase}
              />
            )}
            {hasProducts && (
              <Button
                text={t("contact.productsCta")}
                href="/products"
                unstyled
                className="bdrone-cta bdrone-cta-outline"
                color={primary}
                border={`2px solid ${primary}`}
                padding="12px 24px"
                borderRadius={12}
                styles={{ ...ctaBase, ...brandVar }}
              />
            )}
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
