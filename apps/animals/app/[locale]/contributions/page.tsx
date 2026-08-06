import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getSession } from "@repo/auth/session";
import { Box } from "@repo/ui/core-elements/box";
import { Container } from "@repo/ui/core-elements/container";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import { NavbarSpacer, PageBottomSpacer } from "@repo/ui/core-elements/navbar";
import { SignInPrompt } from "@/components/contribute/sign-in-prompt";
import { ContributionsList } from "./contributions-list";

/**
 * "My contributions" - everything this account has filed, and the only place a
 * reader can correct or withdraw any of it.
 *
 * The other half of `/contribute/*`. Until this page existed the flow could
 * confirm a submission and nothing more: a contributor who mistyped a date or
 * uploaded a blurry photograph had no way to see the record again, let alone fix
 * it, and no way to tell whether anyone had ever looked at it.
 *
 * Three things about how it is built:
 *
 * - **The grid is a client component, unlike every other list in this app.**
 *   The public pages fetch on the server because their payloads are the same for
 *   everybody and are cached in Django; this one is per-account, uncached, and
 *   needs a bearer token. `apiFetch` refreshes that token by *writing a cookie*,
 *   which a server component may not do - so the read goes through the
 *   `/api/contributions` route handler, exactly as the CMS's own lists do
 *   (`lib/admin-api.ts`). The filters are client state for the same reason: with
 *   the data already in the browser, a round trip per filter press would be
 *   slower and no more shareable, since none of these URLs mean anything to
 *   anyone else.
 * - **It is behind `proxy.ts`'s `protectedPrefixes`, unlike `/contribute`.**
 *   That flow is deliberately reachable signed-out, because the FAB is how a
 *   reader discovers contributions exist at all. This page has nothing to show
 *   such a reader - there is no "your contributions" for an account that does
 *   not exist - so the guard is the right answer and the prompt below is only
 *   for the window between an expired session and the next navigation.
 * - **`robots: noindex`**, like the contribute routes: every URL under it is
 *   per-contributor and none of it is for a crawler.
 */

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  // `setRequestLocale` then the plain form - the `{ locale, namespace }`
  // overload widens the namespace to `never` against this app's typed messages.
  setRequestLocale(locale);
  const t = await getTranslations("Contributions");

  return {
    title: t("title"),
    description: t("metaDescription"),
    robots: { index: false, follow: false },
  };
}

export default async function ContributionsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Contributions");
  const session = await getSession();

  const breadcrumbs = [
    { label: t("breadcrumbHome"), href: "/" },
    { label: t("breadcrumb") },
  ];

  return (
    <Box flexDirection="column" width="100%">
      <NavbarSpacer />

      <Container size="lg" paddingX={10} marginTop={16}>
        <Breadcrumbs items={breadcrumbs} />

        <Box flexDirection="column" gap={8} marginTop={24} marginBottom={24}>
          <Typography as="h1" variant="h2" fontWeight={700}>
            {t("title")}
          </Typography>
          <Typography variant="body" color="var(--foreground-muted, #6b7280)">
            {t("intro")}
          </Typography>
        </Box>

        {session ? (
          <ContributionsList locale={locale} />
        ) : (
          <SignInPrompt description={t("signIn")} />
        )}
      </Container>

      <PageBottomSpacer />
    </Box>
  );
}
