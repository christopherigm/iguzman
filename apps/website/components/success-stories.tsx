import { getTranslations, getLocale } from "next-intl/server";
import { getSession } from "@repo/auth/session";
import { getSuccessStories } from "@/lib/success-stories";
import { Typography } from "@repo/ui/core-elements/typography";
import { StoriesSliderClient } from "./stories-slider-client";
import { LandingSection, type LandingBlockProps } from "./landing-section";
import "./success-stories.css";
import Box from "@repo/ui/core-elements/box";

export async function SuccessStories(section: LandingBlockProps = {}) {
  const [stories, t, adminT, locale, session] = await Promise.all([
    getSuccessStories(),
    getTranslations("SuccessStories"),
    getTranslations("Admin"),
    getLocale(),
    getSession(),
  ]);

  if (stories.length === 0) return null;

  return (
    <LandingSection {...section}>
      <Box className="highlights-header">
        <Typography as="h2" variant="h2" className="section-title">
          {t("heading")}
        </Typography>
      </Box>
      <StoriesSliderClient
        stories={stories}
        locale={locale}
        readMore={t("readMore")}
        isAdmin={session?.isAdmin ?? false}
        editLabel={adminT("edit")}
      />
    </LandingSection>
  );
}
