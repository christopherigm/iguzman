import { getTranslations, getLocale } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Card } from "@repo/ui/core-elements/card";
import { Container } from "@repo/ui/core-elements/container";
import { Grid } from "@repo/ui/core-elements/grid";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import type { BreadcrumbItem } from "@repo/ui/core-elements/breadcrumbs";
import { SectionHero } from "@/components/section-hero";
import { getSystem } from "@/lib/system";

/**
 * "/about" for Santo Fish - the long version of the story the landing's Intro
 * only teases: where the coastal recipes come from, what the kitchen stands for
 * (Mission/Vision), and where to go next. Every word and the photo are the
 * tenant's own `System` fields, so the owner edits this page in the CMS and no
 * copy is frozen in the site folder. Served through the `[locale]/[...sitePath]`
 * catch-all from the site's `pages` map.
 *
 * The page hero is `SectionHero` (not the landing `Hero`): it carries the
 * tenant's opt-in outline text frame and is used here purely as a photographic
 * band, so the About photo is not repeated below the fold. The `<h1>` lives in
 * the content, under the breadcrumbs, per the page-header spacing convention.
 *
 * Server Component: it clears the fixed navbar and adds bottom breathing room
 * with props-first padding using the shared @repo/ui CSS vars, never the heavy
 * "use client" navbar module.
 */

/** Pick the locale-appropriate value from a System (es) / en_ (en) field pair. */
function localized(
  locale: string,
  es: string | null | undefined,
  en: string | null | undefined,
): string {
  return (locale === "en" ? en : es) ?? es ?? en ?? "";
}

export async function About() {
  const [system, locale, t] = await Promise.all([
    getSystem(),
    getLocale(),
    getTranslations("SantoFishSite"),
  ]);

  const about = localized(locale, system?.about, system?.en_about);
  const mission = localized(locale, system?.mission, system?.en_mission);
  const vision = localized(locale, system?.vision, system?.en_vision);
  const heroImage = system?.img_about ?? null;
  const hasMenu = (system?.menu_item_count ?? 0) > 0;

  const breadcrumbs: BreadcrumbItem[] = [
    { label: t("about.home"), href: "/" },
    { label: t("about.title") },
  ];

  return (
    <>
      {heroImage && (
        <SectionHero
          backgroundImage={heroImage}
          style={{ height: "clamp(220px, 30vw, 400px)" }}
        />
      )}

      <Container
        size="md"
        paddingX={10}
        marginTop={16}
        paddingTop={!heroImage ? "var(--ui-navbar-height, 57px)" : undefined}
        paddingBottom="var(--ui-page-bottom-spacing, 64px)"
      >
        <Breadcrumbs items={breadcrumbs} />

        <Typography
          as="span"
          variant="label"
          color="var(--accent)"
          fontWeight={700}
          marginBottom={8}
          styles={{
            display: "block",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          {t("about.eyebrow")}
        </Typography>

        <Typography as="h1" variant="h1" fontWeight={800} marginBottom={16}>
          {system?.site_name
            ? t("about.titleNamed", { name: system.site_name })
            : t("about.title")}
        </Typography>

        {system?.slogan && (
          <Typography
            as="p"
            variant="h4"
            fontWeight={400}
            color="var(--muted-foreground)"
            marginBottom={32}
            styles={{ whiteSpace: "pre-line", maxWidth: "52ch" }}
          >
            {system.slogan}
          </Typography>
        )}

        <Box
          paddingLeft={20}
          marginBottom={40}
          styles={{ borderLeft: "3px solid var(--accent)" }}
        >
          <Typography
            as="p"
            variant="body"
            styles={{
              whiteSpace: "pre-line",
              lineHeight: 1.75,
              maxWidth: "68ch",
            }}
          >
            {about || t("about.placeholder")}
          </Typography>
        </Box>

        {(mission || vision) && (
          <Grid container spacing={3} marginBottom={40}>
            {mission && (
              <Grid size={{ xs: 12, sm: 6 }}>
                <Card
                  height="100%"
                  padding={24}
                  borderRadius={8}
                  gap="12px"
                  styles={{ borderTop: "4px solid var(--accent)" }}
                >
                  <Typography as="h2" variant="h3" fontWeight={700} margin={0}>
                    {t("about.missionHeading")}
                  </Typography>
                  <Typography
                    as="p"
                    variant="body"
                    margin={0}
                    styles={{ whiteSpace: "pre-line", lineHeight: 1.7 }}
                  >
                    {mission}
                  </Typography>
                </Card>
              </Grid>
            )}
            {vision && (
              <Grid size={{ xs: 12, sm: 6 }}>
                <Card
                  height="100%"
                  padding={24}
                  borderRadius={8}
                  gap="12px"
                  styles={{ borderTop: "4px solid var(--accent)" }}
                >
                  <Typography as="h2" variant="h3" fontWeight={700} margin={0}>
                    {t("about.visionHeading")}
                  </Typography>
                  <Typography
                    as="p"
                    variant="body"
                    margin={0}
                    styles={{ whiteSpace: "pre-line", lineHeight: 1.7 }}
                  >
                    {vision}
                  </Typography>
                </Card>
              </Grid>
            )}
          </Grid>
        )}

        {/* Where the story leads: the menu (only once there is one to show) and
            the shared /contact page, which already carries the address, the map,
            the hours and the form. */}
        <Box display="flex" gap="16px" flexWrap="wrap" alignItems="center">
          {hasMenu && (
            <Button
              text={t("hero.viewMenu")}
              href="/categories/food"
              kind="primary"
              size="lg"
            />
          )}
          <Button text={t("intro.visit")} href="/contact" size="lg" />
        </Box>
      </Container>
    </>
  );
}
