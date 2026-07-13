import { setRequestLocale } from "next-intl/server";
import { getSite } from "@/lib/resolve-site";

type Props = {
  params: Promise<{ locale: string }>;
};

/**
 * Landing dispatcher. Resolves the active customer site by request host and
 * renders that site's bespoke landing page. Hosts with no dedicated site folder
 * fall back to the generic DB-driven template (sites/_default). The composition
 * itself now lives per-site under sites/<slug>/landing.tsx - see sites/CLAUDE.md.
 */
export default async function Home({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const site = await getSite();
  const Landing = site.Landing;

  return <Landing locale={locale} />;
}
