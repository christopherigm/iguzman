import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getSite } from "@/lib/resolve-site";
import { getSystem } from "@/lib/system";
import { getRequestOrigin, systemShareMetadata } from "@/lib/metadata";

type Props = {
  params: Promise<{ locale: string; sitePath: string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, sitePath } = await params;
  const [system, origin] = await Promise.all([getSystem(), getRequestOrigin()]);
  const path = "/" + sitePath.join("/");
  return systemShareMetadata({ system, locale, origin, path });
}

/**
 * Per-site extra-page dispatcher. Serves the bespoke top-level pages a site
 * declares in its `pages` map (e.g. "/about", "/contact", later "/menu",
 * "/booking"). This catch-all sits at the lowest routing priority under
 * [locale], so every explicit platform route (auth, admin, account,
 * products, services, categories, blog, highlights…) is matched first and is
 * never shadowed. Only unclaimed top-level paths reach here; an unknown path
 * for the resolved site 404s.
 */
export default async function SitePage({ params }: Props) {
  const { locale, sitePath } = await params;
  setRequestLocale(locale);

  const site = await getSite();
  const path = "/" + sitePath.join("/");
  const Page = site.pages?.[path];

  if (!Page) notFound();

  return <Page locale={locale} />;
}
