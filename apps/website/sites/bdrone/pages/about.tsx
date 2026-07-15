import Image from "next/image";
import { getTranslations, getLocale } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Container } from "@repo/ui/core-elements/container";
import { Grid } from "@repo/ui/core-elements/grid";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { getSystem } from "@/lib/system";

/** Pick the locale-appropriate value from a System (es) / en_ (en) field pair. */
function localized(
  locale: string,
  es: string | null | undefined,
  en: string | null | undefined,
): string {
  return (locale === "en" ? en : es) ?? es ?? en ?? "";
}

/**
 * Bdrone "/about" page. Composes the tenant's About/Mission/Vision copy and
 * About image (all DB-driven via System) into a dedicated, well-structured
 * page. Served through the [locale]/[...sitePath] catch-all from the site's
 * `pages` map.
 */
export async function About() {
  const [system, locale, t] = await Promise.all([
    getSystem(),
    getLocale(),
    getTranslations("BdroneSite"),
  ]);

  const primary = system?.primary_color ?? "#2196f3";
  const secondary = system?.secondary_color ?? "#e040fb";
  const about = localized(locale, system?.about, system?.en_about);
  const mission = localized(locale, system?.mission, system?.en_mission);
  const vision = localized(locale, system?.vision, system?.en_vision);

  // Clear the fixed navbar (top) and add page-bottom breathing room via the
  // shared @repo/ui CSS vars, instead of importing the heavy "use client"
  // navbar module (Navbar*) into this server component just for two spacers.
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
          <Typography
            as="p"
            variant="h4"
            fontWeight={400}
            styles={{ opacity: 0.75 }}
          >
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
              styles={{ whiteSpace: "pre-line", lineHeight: 1.7 }}
            >
              {about}
            </Typography>
          ) : (
            <Typography as="p" variant="body" styles={{ opacity: 0.7 }}>
              {t("about.placeholder")}
            </Typography>
          )}
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Box
            width="100%"
            height={340}
            maxHeight="50vh"
            borderRadius={8}
            elevation={8}
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

      {(mission || vision) && (
        <Box paddingY={40}>
          <Grid container spacing={3}>
            {mission && (
              <Grid size={{ xs: 12, md: 6 }}>
                <Card
                  height="100%"
                  padding={24}
                  borderRadius={8}
                  gap="12px"
                  styles={{ borderTop: `4px solid ${primary}` }}
                >
                  <Typography as="h2" variant="h3" fontWeight={700}>
                    {t("about.missionHeading")}
                  </Typography>
                  <Typography
                    as="p"
                    variant="body"
                    styles={{ whiteSpace: "pre-line", opacity: 0.85 }}
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
                  borderRadius={8}
                  gap="12px"
                  styles={{ borderTop: `4px solid ${secondary}` }}
                >
                  <Typography as="h2" variant="h3" fontWeight={700}>
                    {t("about.visionHeading")}
                  </Typography>
                  <Typography
                    as="p"
                    variant="body"
                    styles={{ whiteSpace: "pre-line", opacity: 0.85 }}
                  >
                    {vision}
                  </Typography>
                </Card>
              </Grid>
            )}
          </Grid>
        </Box>
      )}
    </Container>
  );
}
