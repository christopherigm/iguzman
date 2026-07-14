import Image from "next/image";
import { getTranslations, getLocale } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Container } from "@repo/ui/core-elements/container";
import { Grid } from "@repo/ui/core-elements/grid";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import { LinkButton } from "@repo/ui/core-elements/link-button";
import { getSystem } from "@/lib/system";

/**
 * Bespoke "who we are" intro for the Bdrone site. A two-column split: the
 * tenant's About copy + CTAs on one side, its About image on the other. All
 * copy/imagery is DB-driven (System) so the customer self-edits it via the CMS;
 * only the composition is ours.
 *
 * CTAs are plain core `Button`/`LinkButton` primitives - the primary action
 * picks up the tenant's brand color automatically because the layout drives
 * `--accent` from `System.primary_color`. No `unstyled`, no custom CTA CSS.
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
  const hasServices = (system?.service_count ?? 0) > 0;
  const hasProducts = (system?.product_count ?? 0) > 0;

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
                gap="16px"
                flexWrap="wrap"
                alignItems="center"
                marginTop="8px"
              >
                {hasServices && (
                  <Button
                    text={t("intro.exploreServices")}
                    href="/services"
                    kind="primary"
                    size="lg"
                  />
                )}
                {hasProducts && (
                  <Button
                    text={t("intro.viewProducts")}
                    href="/products"
                    size="lg"
                  />
                )}
                <LinkButton label={t("intro.learnMore")} href="/about" />
              </Box>
            </Box>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Box
              width="100%"
              height={420}
              maxHeight="60vh"
              borderRadius={20}
              elevation={6}
              backgroundColor="var(--surface-2)"
              styles={{ position: "relative", overflow: "hidden" }}
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
