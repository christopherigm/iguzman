"use client";

import { useTranslations } from "next-intl";
import { Container } from "@repo/ui/core-elements/container";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import Card from "@repo/ui/core-elements/card";
import { ProfessionalInfoPanel } from "./professional-info-section";
import { ContactInfoPanel } from "./contact-info-section";
import { LanguagesPanel } from "./languages-section";
import { ResumePanel } from "./resume-section";
import { JobSearchPanel } from "./job-search-section";
import { JobApiKeysSection } from "./job-api-keys-section";
import { TechStackPanel } from "./tech-stack-section";
import "./profile-page.css";

// ── Section wrapper ────────────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card gap={8} flexDirection="column">
      <Box display="flex" flexDirection="column" gap={4}>
        <Typography as="h2" variant="h3" fontWeight={600}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body" color="var(--muted-foreground, #6b7280)">
            {subtitle}
          </Typography>
        )}
      </Box>
      {children}
    </Card>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function ProfilePage() {
  const t = useTranslations("ProfilePage");

  return (
    <Container
      display="flex"
      alignItems="center"
      styles={{
        minHeight: "100vh",
        flexDirection: "column",
        justifyContent: "flex-start",
        paddingTop: "var(--ui-navbar-height)",
      }}
      paddingX={10}
    >
      <Box
        width="100%"
        marginTop={24}
        marginBottom={24}
        display="flex"
        alignItems="flex-start"
        justifyContent="space-between"
        gap={16}
        flexWrap="wrap"
      >
        <Box display="flex" flexDirection="column" gap={4}>
          <Typography as="h1" variant="h2" fontWeight={600} marginBottom={4}>
            {t("title")}
          </Typography>
          <Typography variant="body" color="var(--muted-foreground, #6b7280)">
            {t("subtitle")}
          </Typography>
        </Box>
      </Box>

      <Container size="lg" paddingX={0} marginBottom={40}>
        <Box className="profile__sections">
          {/* Left column */}
          <Box className="profile__col">
            <Section
              title={t("professionalSection")}
              subtitle={t("professionalSubtitle")}
            >
              <ProfessionalInfoPanel />
            </Section>
            <Section
              title={t("jobSearchSection")}
              subtitle={t("jobSearchSubtitle")}
            >
              <JobSearchPanel />
            </Section>

            <JobApiKeysSection />
          </Box>

          {/* Right column */}
          <Box className="profile__col">
            <Section
              title={t("contactSection")}
              subtitle={t("contactSubtitle")}
            >
              <ContactInfoPanel />
            </Section>

            <Section
              title={t("languagesSection")}
              subtitle={t("languagesSubtitle")}
            >
              <LanguagesPanel />
            </Section>

            <Section title={t("techSection")} subtitle={t("techSubtitle")}>
              <TechStackPanel />
            </Section>

            <Section title={t("resumeSection")} subtitle={t("resumeSubtitle")}>
              <ResumePanel />
            </Section>
          </Box>
        </Box>
      </Container>
    </Container>
  );
}
