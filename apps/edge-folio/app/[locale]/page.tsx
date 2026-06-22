import { cookies } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { Box } from "@repo/ui/core-elements/box";
import { Grid } from "@repo/ui/core-elements/grid";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import { Badge } from "@repo/ui/core-elements/badge";
import { Icon } from "@repo/ui/core-elements/icon";
import type { JobFeed, JobPosting } from "@/lib/jobs";
import { HeroJobCards } from "./hero-job-cards";

type Props = {
  params: Promise<{ locale: string }>;
};

const PRIVATE_JOBS_LIMIT = 6;

// Server-to-server fetch of the signed-in user's private job postings for the
// hero. Returns an empty list for anonymous users or any API error so the hero
// silently falls back to the auth CTA buttons.
async function getPrivateJobs(): Promise<JobPosting[]> {
  const token = (await cookies()).get("access_token")?.value;
  if (!token) return [];
  try {
    const res = await fetch(
      `${process.env.API_URL}/api/jobs/feed/?scope=private&per=${PRIVATE_JOBS_LIMIT}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    );
    if (!res.ok) return [];
    const feed = (await res.json()) as JobFeed;
    return feed.results.slice(0, PRIVATE_JOBS_LIMIT);
  } catch {
    return [];
  }
}

const PILLARS = [
  { key: "matrix", icon: "/icons/user.svg" },
  { key: "tailor", icon: "/icons/enhance.svg" },
  { key: "jobs", icon: "/icons/search.svg" },
  { key: "export", icon: "/icons/download.svg" },
] as const;

const FEATURES = [
  { key: "matrix", icon: "/icons/user.svg" },
  { key: "tailor", icon: "/icons/enhance.svg" },
  { key: "company", icon: "/icons/link.svg" },
  { key: "letters", icon: "/icons/download.svg" },
  { key: "jobs", icon: "/icons/bookmark.svg" },
  { key: "passkeys", icon: "/icons/fingerprint.svg" },
] as const;

export default async function Home({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("HomePage");

  const privateJobs = await getPrivateJobs();
  const isLoggedIn = (await cookies()).has("access_token");

  return (
    <Box display="flex" flexDirection="column" paddingBottom={60}>
      {/* ── Hero ───────────────────────────────────────────── */}
      <Box
        styles={{
          background:
            "radial-gradient(120% 120% at 50% 0%, color-mix(in srgb, var(--accent, #06b6d4) 14%, transparent) 0%, transparent 60%)",
        }}
      >
        <Container paddingX={20}>
          <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            gap={24}
            paddingY={80}
            styles={{ textAlign: "center" }}
          >
            <Badge variant="subtle" size="md">
              {t("heroEyebrow")}
            </Badge>
            <Typography
              as="h1"
              variant="h1"
              fontWeight={800}
              maxWidth={820}
              styles={{ lineHeight: 1.1 }}
            >
              {t("heroTitle")}
            </Typography>
            <Typography
              as="p"
              variant="body"
              color="var(--muted-foreground, #6b7280)"
              maxWidth={620}
            >
              {t("heroSubtitle")}
            </Typography>
            {isLoggedIn ? (
              privateJobs.length > 0 ? (
                <Box
                  display="flex"
                  flexDirection="column"
                  gap={16}
                  marginTop={8}
                >
                  <Typography
                    as="h2"
                    variant="h5"
                    fontWeight={700}
                    styles={{ textAlign: "left" }}
                  >
                    {t("privateJobsTitle")}
                  </Typography>
                  <HeroJobCards jobs={privateJobs} />
                  <Button
                    text={t("privateJobsViewAll")}
                    href={`/${locale}/jobs`}
                    kind="primary"
                    size="md"
                  />
                </Box>
              ) : (
                <Button
                  text={t("privateJobsBrowse")}
                  href={`/${locale}/jobs`}
                  kind="primary"
                  size="lg"
                />
              )
            ) : (
              <Box
                display="flex"
                gap={12}
                flexWrap="wrap"
                justifyContent="center"
              >
                <Button
                  text={t("heroCtaPrimary")}
                  href="/auth"
                  kind="primary"
                  size="lg"
                />
                <Button text={t("heroCtaSecondary")} href="/auth" size="lg" />
              </Box>
            )}
            <Box
              display="flex"
              gap={8}
              alignItems="center"
              justifyContent="center"
            >
              <Icon icon="/icons/fingerprint.svg" size="2em" />
              <Typography
                variant="body"
                color="var(--muted-foreground, #6b7280)"
              >
                {t("heroNote")}
              </Typography>
            </Box>
          </Box>
        </Container>
      </Box>

      {/* ── Promise / pillars ──────────────────────────────── */}
      <Container size="lg" paddingX={20}>
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          gap={12}
          paddingY={48}
          styles={{ textAlign: "center" }}
        >
          <Typography as="h2" variant="h2" fontWeight={700}>
            {t("pillarsTitle")}
          </Typography>
          <Typography
            as="p"
            variant="body"
            color="var(--accent, #06b6d4)"
            fontWeight={600}
            maxWidth={560}
          >
            {t("pillarsSubtitle")}
          </Typography>
        </Box>
        <Grid container spacing={4}>
          {PILLARS.map(({ key, icon }) => (
            <Grid key={key} size={{ xs: 12, sm: 6, md: 3 }}>
              <Card
                display="flex"
                flexDirection="column"
                alignItems="center"
                gap={12}
                height="100%"
              >
                <Icon
                  icon={icon}
                  size="2.5em"
                  padding={10}
                  backgroundShape="circle"
                  backgroundColor="color-mix(in srgb, var(--accent, #06b6d4) 14%, transparent)"
                />
                <Typography as="h3" variant="h4" fontWeight={700}>
                  {t(`pillars.${key}.title`)}
                </Typography>
                <Typography
                  variant="body"
                  color="var(--muted-foreground, #6b7280)"
                  textAlign="center"
                >
                  {t(`pillars.${key}.body`)}
                </Typography>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* ── Feature grid ───────────────────────────────────── */}
      <Container size="lg" paddingX={20}>
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          gap={12}
          paddingY={48}
          styles={{ textAlign: "center" }}
        >
          <Typography as="h2" variant="h2" fontWeight={700} maxWidth={680}>
            {t("featuresTitle")}
          </Typography>
        </Box>
        <Grid container spacing={4}>
          {FEATURES.map(({ key, icon }) => (
            <Grid key={key} size={{ xs: 12, sm: 6, md: 4 }}>
              <Card gap={10} height="100%">
                <Box display="flex" alignItems="center" gap={10}>
                  <Icon icon={icon} size="1.2em" />
                  <Typography as="h3" variant="h5" fontWeight={700}>
                    {t(`features.${key}.title`)}
                  </Typography>
                </Box>
                <Typography
                  variant="body"
                  color="var(--muted-foreground, #6b7280)"
                >
                  {t(`features.${key}.body`)}
                </Typography>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* ── Privacy ────────────────────────────────────────── */}
      <Container size="md" paddingX={20}>
        <Card
          gap={16}
          marginTop={48}
          padding={40}
          borderRadius={16}
          backgroundColor="var(--surface-1)"
          alignItems="center"
          styles={{ textAlign: "center" }}
        >
          <Icon
            icon="/icons/fingerprint.svg"
            size="5em"
            padding={14}
            backgroundShape="circle"
            backgroundColor="color-mix(in srgb, var(--accent, #06b6d4) 14%, transparent)"
          />
          <Typography as="h2" variant="h2" fontWeight={700} maxWidth={560}>
            {t("privacyTitle")}
          </Typography>
          <Typography
            as="p"
            variant="body"
            color="var(--muted-foreground, #6b7280)"
            maxWidth={620}
          >
            {t("privacyBody")}
          </Typography>
          <Typography
            variant="body"
            color="var(--muted-foreground, #6b7280)"
            maxWidth={560}
          >
            {t("privacyTech")}
          </Typography>
        </Card>
      </Container>

      {/* ── Final CTA (hidden once signed in) ───────────────── */}
      {!isLoggedIn && (
        <Container size="md" paddingX={20}>
          <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            gap={20}
            paddingY={80}
            styles={{ textAlign: "center" }}
          >
            <Typography as="h2" variant="h2" fontWeight={800} maxWidth={620}>
              {t("ctaTitle")}
            </Typography>
            <Typography
              as="p"
              variant="body"
              color="var(--muted-foreground, #6b7280)"
              maxWidth={520}
            >
              {t("ctaSubtitle")}
            </Typography>
            <Button
              text={t("ctaButton")}
              href="/auth"
              kind="primary"
              size="lg"
            />
          </Box>
        </Container>
      )}
    </Box>
  );
}
