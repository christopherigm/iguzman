import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { getSite } from "@/lib/resolve-site";
import { getSystem } from "@/lib/system";
import { getRequestOrigin, systemShareMetadata } from "@/lib/metadata";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const [system, origin] = await Promise.all([getSystem(), getRequestOrigin()]);
  return systemShareMetadata({ system, locale, origin });
}

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
