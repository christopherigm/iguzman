import { setRequestLocale } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { PageBottomSpacer } from "@repo/ui/core-elements/navbar";
import { apiFetch } from "@/lib/api-fetch";
import type { MovieDetail as MovieDetailData } from "@/lib/catalog";
import { MovieDetail } from "./movie-detail";

type Props = { params: Promise<{ locale: string; id: string }> };

/**
 * Prefetch the movie on the server so the detail page renders with data on the
 * first paint instead of after a client round-trip. The Django endpoint is
 * Redis-backed, so this stays cheap. Returns null on any failure (including
 * 404) so the client component falls back to its own fetch and error handling.
 */
async function prefetchMovie(id: string): Promise<MovieDetailData | null> {
  try {
    const res = await apiFetch(`/api/catalog/movies/${id}/`, {
      cache: "no-store",
      allowAnonymous: true,
    });
    if (!res.ok) return null;
    return (await res.json()) as MovieDetailData;
  } catch {
    return null;
  }
}

export default async function MovieDetailPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const initialMovie = await prefetchMovie(id);

  return (
    <Container paddingX={12}>
      {/* key={id} remounts on navigation so the freshly prefetched movie seeds
          state via lazy init instead of a setState-in-effect re-sync. */}
      <MovieDetail key={id} id={id} initialMovie={initialMovie} />
      <PageBottomSpacer />
    </Container>
  );
}
