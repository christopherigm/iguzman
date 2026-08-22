import { getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Container } from "@repo/ui/core-elements/container";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import type { BreadcrumbItem } from "@repo/ui/core-elements/breadcrumbs";
import { SectionHero } from "@/components/section-hero";
import { Events } from "@/components/events";
import { getSystem } from "@/lib/system";

/**
 * "/artists" - the standing page for the wall JavaStop gives to a different
 * local artist every month. Served through the `[locale]/[...sitePath]`
 * catch-all from the site's `pages` map. Nothing in the platform chrome links
 * it (the footer's Company column knows only about "/about"), so it is reached
 * from the landing's Intro and from the bottom of "/about".
 *
 * **The page frames; the CMS fills.** Who is showing this month, from when,
 * with which photographs, is `<Events />` - the same DB-driven block the landing
 * carries, authored in `/admin/events`, with `/events` and `/events/<slug>` as
 * its own platform routes. A month with nothing hung renders no band at all,
 * which is the honest answer rather than an empty grid under a heading.
 *
 * ⚠ **The framing prose here is translated UI copy rather than DB content**, the
 * same exception `sites/tamaratours/pages/arch.tsx` and
 * `sites/cafedealtura/pages/wholesale.tsx` make - and this one sits closer to
 * the line than either of those, because it does describe the business. It is
 * held to what the café already says publicly about the wall and to what the
 * `<Events />` band below can be trusted to correct: no artist named, no
 * schedule promised, no count of shows. If the family wants to rewrite these
 * words themselves, the right home is a **highlight or a blog post** - both are
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
export async function Artists() {
  const [system, t] = await Promise.all([
    getSystem(),
    getTranslations("JavaStopSite"),
  ]);

  const heroImage = system?.img_hero ?? system?.img_about ?? null;

  const breadcrumbs: BreadcrumbItem[] = [
    { label: t("about.home"), href: "/" },
    { label: t("artistsPage.breadcrumb") },
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
          {t("artistsPage.eyebrow")}
        </Typography>

        <Typography as="h1" variant="h1" fontWeight={800} marginBottom={16}>
          {t("artistsPage.title")}
        </Typography>

        <Typography
          as="p"
          variant="h4"
          fontWeight={400}
          color="var(--muted-foreground)"
          marginBottom={32}
          styles={{ maxWidth: "52ch" }}
        >
          {t("artistsPage.subtitle")}
        </Typography>

        <Box
          paddingLeft={20}
          marginBottom={16}
          styles={{ borderLeft: "3px solid var(--accent)" }}
        >
          <Typography
            as="p"
            variant="body"
            styles={{ lineHeight: 1.75, maxWidth: "68ch" }}
          >
            {t("artistsPage.intro")}
          </Typography>
        </Box>

        {/* Who is showing, and what else the café is putting on. Renders nothing
            between hangings, so this page never claims a show it does not have. */}
        <Events />

        <Typography
          as="h2"
          variant="h2"
          fontWeight={800}
          marginTop={24}
          marginBottom={16}
        >
          {t("artistsPage.submitHeading")}
        </Typography>

        <Typography
          as="p"
          variant="body"
          marginBottom={32}
          styles={{ lineHeight: 1.75, maxWidth: "68ch" }}
        >
          {t("artistsPage.submitText")}
        </Typography>

        {/* The shared /contact page carries the address, the map, the hours, the
            social links and a working form - so an artist who wants the wall is
            handed to it rather than to a second form we would have to maintain. */}
        <Box display="flex" gap="16px" flexWrap="wrap" alignItems="center">
          <Button
            text={t("artistsPage.contactCta")}
            href="/contact"
            kind="primary"
            size="lg"
          />
          <Button text={t("intro.story")} href="/about" size="lg" />
        </Box>
      </Container>
    </>
  );
}
