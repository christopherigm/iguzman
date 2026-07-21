import Image from "next/image";
import { getTranslations, getLocale } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Container } from "@repo/ui/core-elements/container";
import { Grid } from "@repo/ui/core-elements/grid";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import { getSystem } from "@/lib/system";
import { localized } from "../localized";

/**
 * "/about" page for Café de Altura - the family's story: who grows the coffee,
 * on which land, and how it is planted and harvested. Built entirely from the
 * tenant's About/Mission/Vision copy and About image (DB-driven via System) and
 * served through the [locale]/[...sitePath] catch-all from the site's `pages`
 * map. It also carries the second entry point to the wholesale page, since a
 * reseller reading the origin story is exactly who that page is for.
 *
 * Server Component: it clears the fixed navbar and adds bottom breathing room
 * with props-first padding using the shared @repo/ui CSS vars, never the heavy
 * "use client" navbar module.
 */
export async function About() {
  const [system, locale, t] = await Promise.all([
    getSystem(),
    getLocale(),
    getTranslations("CafeAlturaSite"),
  ]);

  const about = localized(locale, system?.about, system?.en_about);
  const mission = localized(locale, system?.mission, system?.en_mission);
  const vision = localized(locale, system?.vision, system?.en_vision);
  const primary = system?.primary_color ?? "#6f4e37";
  const hasProducts = (system?.product_count ?? 0) > 0;

  return (
    <Container
      size="md"
      paddingX={10}
      paddingTop="var(--ui-navbar-height, 57px)"
      paddingBottom="var(--ui-page-bottom-spacing, 64px)"
    >
      <Box paddingY={48} display="flex" flexDirection="column" gap="12px">
        <Typography
          as="span"
          variant="label"
          color={primary}
          fontWeight={700}
          styles={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
        >
          {t("about.eyebrow")}
        </Typography>
        <Typography as="h1" variant="h1" fontWeight={800}>
          {system?.site_name
            ? t("about.titleNamed", { name: system.site_name })
            : t("about.title")}
        </Typography>
        {system?.slogan && (
          <Typography as="p" variant="h4" fontWeight={400}>
            {system.slogan}
          </Typography>
        )}
      </Box>

      <Grid container spacing={4} alignItems="center">
        <Grid size={{ xs: 12, md: 6 }}>
          {about ? (
            <Typography
              as="p"
              variant="body"
              styles={{ whiteSpace: "pre-line", lineHeight: 1.75 }}
            >
              {about}
            </Typography>
          ) : (
            <Typography as="p" variant="body">
              {t("about.placeholder")}
            </Typography>
          )}
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Box
            width="100%"
            height={340}
            maxHeight="50vh"
            borderRadius={16}
            elevation={8}
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

      {(mission || vision) && (
        <Box paddingY={40}>
          <Grid container spacing={3}>
            {mission && (
              <Grid size={{ xs: 12, md: 6 }}>
                <Card
                  height="100%"
                  padding={24}
                  borderRadius={10}
                  gap="12px"
                  styles={{ borderTop: "4px solid var(--accent)" }}
                >
                  <Typography as="h2" variant="h3" fontWeight={700}>
                    {t("about.missionHeading")}
                  </Typography>
                  <Typography
                    as="p"
                    variant="body"
                    styles={{ whiteSpace: "pre-line" }}
                  >
                    {mission}
                  </Typography>
                </Card>
              </Grid>
            )}
            {vision && (
              <Grid size={{ xs: 12, md: 6 }}>
                <Card
                  height="100%"
                  padding={24}
                  borderRadius={10}
                  gap="12px"
                  styles={{ borderTop: "4px solid var(--accent)" }}
                >
                  <Typography as="h2" variant="h3" fontWeight={700}>
                    {t("about.visionHeading")}
                  </Typography>
                  <Typography
                    as="p"
                    variant="body"
                    styles={{ whiteSpace: "pre-line" }}
                  >
                    {vision}
                  </Typography>
                </Card>
              </Grid>
            )}
          </Grid>
        </Box>
      )}

      <Box
        display="flex"
        gap="14px"
        flexWrap="wrap"
        alignItems="center"
        paddingBottom={24}
      >
        {hasProducts && (
          <Button
            text={t("about.productsCta")}
            href="/categories/products"
            kind="primary"
            size="lg"
          />
        )}
        <Button text={t("about.wholesaleCta")} href="/mayoreo" size="lg" />
      </Box>
    </Container>
  );
}
