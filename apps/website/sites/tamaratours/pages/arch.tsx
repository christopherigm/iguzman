import { getTranslations } from "next-intl/server";
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
 * "/el-arco" - the destination page. For a tour operator the product is a place,
 * and the traveller researching Los Cabos searches for the landmark long before
 * they search for a company, so El Arco gets a page rather than a paragraph on
 * the landing. Served through the `[locale]/[...sitePath]` catch-all from the
 * site's `pages` map.
 *
 * **Why this page's prose is translated UI copy rather than DB content**, unlike
 * every other section of this site: it describes a public landmark, not the
 * business - no claim about Tamara Tours, no price, no promise, no invented
 * statistic. It is the same exception `sites/cafedealtura/pages/wholesale.tsx`
 * makes, and it stops at the same line: everything the *company* asserts still
 * comes from `System` (the hero image here, the story on `/about`, the reasons
 * to book in the CMS highlights). If the owner later wants to edit these words
 * themselves, the right home is a **blog post or a highlight** - both are
 * CMS-editable and already have platform routes - not a code change here.
 *
 * The page hero is `SectionHero` (not the landing `Hero`), so it carries the
 * tenant's opt-in outline text frame; it uses the tenant's hero image, leaving
 * the About photo to `/about` so the two pages don't open on the same picture.
 *
 * Server Component: it clears the fixed navbar and adds bottom breathing room
 * with props-first padding using the shared @repo/ui CSS vars, never the heavy
 * "use client" navbar module.
 */
export async function Arch() {
  const [system, t] = await Promise.all([
    getSystem(),
    getTranslations("TamaraToursSite"),
  ]);

  const heroImage = system?.img_hero ?? system?.img_about ?? null;
  const hasTours = (system?.service_count ?? 0) > 0;

  const breadcrumbs: BreadcrumbItem[] = [
    { label: t("about.home"), href: "/" },
    // The short form: the full landmark name is the <h1> below, and a
    // breadcrumb trail is not the place to repeat it.
    { label: t("archPage.breadcrumb") },
  ];

  // The three things a traveller actually sees on the way to and around Land's
  // End. Kept to what is true of the place year-round (the whale window is
  // stated as a season, never as a guarantee).
  const sights = [
    {
      key: "beaches",
      title: t("archPage.beaches.title"),
      text: t("archPage.beaches.text"),
    },
    {
      key: "sealions",
      title: t("archPage.sealions.title"),
      text: t("archPage.sealions.text"),
    },
    {
      key: "whales",
      title: t("archPage.whales.title"),
      text: t("archPage.whales.text"),
    },
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
          color="var(--accent-text)"
          fontWeight={700}
          marginBottom={8}
          styles={{
            display: "block",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          {t("archPage.eyebrow")}
        </Typography>

        <Typography as="h1" variant="h1" fontWeight={800} marginBottom={16}>
          {t("archPage.title")}
        </Typography>

        <Typography
          as="p"
          variant="h4"
          fontWeight={400}
          color="var(--muted-foreground)"
          marginBottom={32}
          styles={{ maxWidth: "52ch" }}
        >
          {t("archPage.subtitle")}
        </Typography>

        <Box
          paddingLeft={20}
          marginBottom={48}
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
            {t("archPage.intro")}
          </Typography>
        </Box>

        <Typography as="h2" variant="h2" fontWeight={800} marginBottom={24}>
          {t("archPage.sightsHeading")}
        </Typography>

        <Grid container spacing={3} marginBottom={48}>
          {sights.map((sight) => (
            <Grid key={sight.key} size={{ xs: 12, sm: 4 }}>
              <Card
                height="100%"
                padding={24}
                borderRadius={8}
                gap="12px"
                styles={{ borderTop: "4px solid var(--accent)" }}
              >
                <Typography as="h3" variant="h4" fontWeight={700} margin={0}>
                  {sight.title}
                </Typography>
                <Typography
                  as="p"
                  variant="body"
                  margin={0}
                  styles={{ lineHeight: 1.7 }}
                >
                  {sight.text}
                </Typography>
              </Card>
            </Grid>
          ))}
        </Grid>

        <Typography as="h2" variant="h2" fontWeight={800} marginBottom={16}>
          {t("archPage.gettingThereHeading")}
        </Typography>

        <Typography
          as="p"
          variant="body"
          marginBottom={32}
          styles={{ lineHeight: 1.75, maxWidth: "68ch" }}
        >
          {t("archPage.gettingThereText")}
        </Typography>

        <Box display="flex" gap="16px" flexWrap="wrap" alignItems="center">
          {hasTours && (
            <Button
              text={t("hero.viewTours")}
              href="/categories/services"
              kind="primary"
              size="lg"
            />
          )}
          <Button text={t("about.contactCta")} href="/contact" size="lg" />
        </Box>
      </Container>
    </>
  );
}
