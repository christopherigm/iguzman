import type { CSSProperties } from "react";
import Image from "next/image";
import { getTranslations, getLocale } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Container } from "@repo/ui/core-elements/container";
import { Grid } from "@repo/ui/core-elements/grid";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import { getSystem } from "@/lib/system";
import "../bdrone.css";

/**
 * Bespoke "who we are" intro for the Bdrone site. A two-column split: the
 * tenant's About copy + brand-colored CTAs on one side, its About image (or a
 * themed brand panel) on the other. All copy/imagery is DB-driven (System) so
 * the customer self-edits it via the CMS; only the composition is ours.
 */
export async function Intro() {
  const [system, locale, t] = await Promise.all([
    getSystem(),
    getLocale(),
    getTranslations("BdroneSite"),
  ]);

  const about =
    (locale === "en" ? system?.en_about : system?.about) ??
    system?.about ??
    system?.en_about ??
    "";

  // Nothing meaningful to show without About copy or a slogan - skip the block.
  const body = about || system?.slogan || "";
  if (!body) return null;

  const primary = system?.primary_color ?? "#2196f3";
  const secondary = system?.secondary_color ?? "#e040fb";
  const hasServices = (system?.service_count ?? 0) > 0;
  const hasProducts = (system?.product_count ?? 0) > 0;

  // Shared CTA sizing (unstyled Buttons don't get the built-in size tokens).
  const ctaBase: CSSProperties = { fontWeight: 700, fontSize: "1rem" };
  const brandVar = { "--bdrone-brand": primary } as CSSProperties;

  return (
    <Container paddingX={10}>
      <Box paddingY={64}>
        <Grid container spacing={4} alignItems="center">
          <Grid size={{ xs: 12, md: 6 }}>
            <Box display="flex" flexDirection="column" gap="20px">
              <Typography
                as="span"
                variant="label"
                color={primary}
                fontWeight={700}
                styles={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
              >
                {t("intro.eyebrow")}
              </Typography>

              <Typography as="h2" variant="h2" fontWeight={800}>
                {system?.site_name ?? "Bdrone"}
              </Typography>

              <Typography
                as="p"
                variant="body"
                styles={{ whiteSpace: "pre-line", opacity: 0.85 }}
              >
                {body}
              </Typography>

              <Box
                display="flex"
                gap="14px"
                flexWrap="wrap"
                alignItems="center"
                marginTop="8px"
              >
                {hasServices && (
                  <Button
                    text={t("intro.exploreServices")}
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
                    text={t("intro.viewProducts")}
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
                <Button
                  text={t("intro.learnMore")}
                  href="/about"
                  unstyled
                  className="bdrone-cta"
                  color={primary}
                  padding="12px 8px"
                  styles={{ ...ctaBase, textDecoration: "underline" }}
                />
              </Box>
            </Box>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Box
              width="100%"
              height={420}
              maxHeight="60vh"
              borderRadius={20}
              elevation={10}
              styles={{
                position: "relative",
                overflow: "hidden",
                background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`,
              }}
            >
              {system?.img_about && (
                <Image
                  fill
                  src={system.img_about}
                  alt={system?.site_name ?? ""}
                  sizes="(max-width: 900px) 100vw, 50vw"
                  style={{ objectFit: "cover" }}
                />
              )}
            </Box>
          </Grid>
        </Grid>
      </Box>
    </Container>
  );
}
