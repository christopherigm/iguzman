import { setRequestLocale } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { NavbarSpacer } from "@repo/ui/core-elements/navbar";
import { apiFetch } from "@/lib/api-fetch";
import type { MovieStats } from "@/lib/stats";
import { StatisticsDashboard } from "@/components/statistics/statistics-dashboard";

type Props = {
  params: Promise<{ locale: string }>;
};

/**
 * Prefetch the whole-catalog statistics on the server so the page paints its
 * charts on first load (the Django endpoint is a few grouped queries). The
 * `library` scope, which needs the user's auth, is fetched client-side only when
 * the visitor toggles to it. Returns null on any failure so the client refetches.
 */
async function prefetchStats(): Promise<MovieStats | null> {
  try {
    const res = await apiFetch(`/api/catalog/stats/?scope=catalog`, {
      cache: "no-store",
      allowAnonymous: true,
    });
    if (!res.ok) return null;
    return (await res.json()) as MovieStats;
  } catch {
    return null;
  }
}

export default async function StatisticsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const initialStats = await prefetchStats();

  return (
    <Container paddingX={12}>
      <NavbarSpacer />
      <StatisticsDashboard initialStats={initialStats} />
    </Container>
  );
}
