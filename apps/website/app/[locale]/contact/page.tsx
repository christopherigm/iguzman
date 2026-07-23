import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Grid } from "@repo/ui/core-elements/grid";
import { Container } from "@repo/ui/core-elements/container";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import { SocialLinks } from "@repo/ui/core-elements/social-links";
import { getSession } from "@repo/auth/session";
import { getSystem } from "@/lib/system";
import { getBranches } from "@/lib/branches";
import { getRequestOrigin, systemShareMetadata } from "@/lib/metadata";
import { ContactLocations } from "@/components/contact/contact-locations";
import { ContactFormClient } from "@/components/contact/contact-form-client";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const [system, origin, t] = await Promise.all([
    getSystem(),
    getRequestOrigin(),
    getTranslations("Contact"),
  ]);
  return {
    ...systemShareMetadata({ system, locale, origin, path: "/contact" }),
    title: `${t("title")} · ${system?.site_name ?? ""}`.trim(),
  };
}

/**
 * The contact page, available for every site (a platform route, so it wins over
 * a site's own `pages` map and covers the `_default` template too). Renders the
 * tenant's physical locations (single-location view or a grid of branch cards),
 * its site-wide contact details (email + social links), and the shared contact
 * form - all resolved for the current tenant by request host.
 */
export default async function ContactPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [system, branches, session, t] = await Promise.all([
    getSystem(),
    getBranches(),
    getSession(),
    getTranslations("Contact"),
  ]);

  const email = system?.contact_email || null;
  const socialLinks = system?.social_links ?? [];
  const hasContactInfo = Boolean(email) || socialLinks.length > 0;
  const hasBranches = branches.length > 0;

  return (
    <Container
      size="lg"
      paddingX={10}
      marginTop={16}
      paddingTop="var(--ui-navbar-height, 57px)"
      paddingBottom="var(--ui-page-bottom-spacing, 64px)"
    >
      <Breadcrumbs
        items={[{ label: t("home"), href: "/" }, { label: t("title") }]}
      />
      <Typography as="h1" variant="h1" marginBottom={8}>
        {t("title")}
      </Typography>
      <Typography
        variant="body"
        color="var(--muted-foreground, #6b7280)"
        marginBottom={32}
      >
        {t("subtitle")}
      </Typography>

      {hasBranches && (
        <Box flexDirection="column" gap={16} marginBottom={40}>
          <Typography as="h2" variant="h3" margin={0}>
            {branches.length > 1 ? t("locationsHeading") : t("locationHeading")}
          </Typography>
          <ContactLocations
            branches={branches}
            locale={locale}
            isAdmin={Boolean(session?.isAdmin)}
          />
        </Box>
      )}

      {/* Info + form. sm split: both columns are narrow enough to share a tablet
          width, per the two-column convention. */}
      <Grid container spacing={2}>
        {hasContactInfo && (
          <Grid size={{ xs: 12, sm: 6 }}>
            <Box flexDirection="column" gap={16}>
              <Typography as="h2" variant="h3" margin={0}>
                {t("reachUsHeading")}
              </Typography>
              {email && (
                <Box flexDirection="column" gap={4}>
                  <Typography
                    variant="label"
                    color="var(--muted-foreground, #6b7280)"
                  >
                    {t("emailHeading")}
                  </Typography>
                  <Button text={email} size="md" href={`mailto:${email}`} />
                </Box>
              )}
              {socialLinks.length > 0 && (
                <Box flexDirection="column" gap={8}>
                  <Typography
                    variant="label"
                    color="var(--muted-foreground, #6b7280)"
                  >
                    {t("followUs")}
                  </Typography>
                  <SocialLinks links={socialLinks} />
                </Box>
              )}
            </Box>
          </Grid>
        )}

        <Grid size={{ xs: 12, sm: hasContactInfo ? 6 : 12 }}>
          <Card gap={16} padding={12}>
            <ContactFormClient
              heading={t("formHeading")}
              description={t("formDescription")}
            />
          </Card>
        </Grid>
      </Grid>
    </Container>
  );
}
