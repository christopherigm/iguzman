import { cache } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { setRequestLocale } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { PageBottomSpacer } from "@repo/ui/core-elements/navbar";
import { apiFetch } from "@/lib/api-fetch";
import type { MovieDetail as MovieDetailData } from "@/lib/catalog";
import { MovieDetail } from "./movie-detail";

type Props = { params: Promise<{ locale: string; slug: string }> };

/**
 * Prefetch the movie by slug on the server so the detail page renders with data
 * on the first paint instead of after a client round-trip, and so
 * `generateMetadata` can build the OG tags from the same data. Wrapped in
 * React's `cache` so the two callers (metadata + page) share a single request.
 * The Django endpoint is Redis-backed, so this stays cheap. Returns null on any
 * failure (including 404) so the client component falls back to its own fetch.
 */
const prefetchMovie = cache(
  async (slug: string): Promise<MovieDetailData | null> => {
    try {
      const res = await apiFetch(`/api/catalog/movies/by-slug/${slug}/`, {
        cache: "no-store",
        allowAnonymous: true,
      });
      if (!res.ok) return null;
      return (await res.json()) as MovieDetailData;
    } catch {
      return null;
    }
  },
);

/** Absolute origin of the current request, for canonical / OG URLs. */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}

/**
 * Share-friendly metadata for the movie detail page: the poster as the OG/Twitter
 * image, the title (with year) as the title, the synopsis as the description, and
 * the slug URL as the canonical link. Built from the same prefetched movie the
 * page renders, so no extra request. Movie fields are already locale-aware at the
 * data layer, so they're exempt from the app's i18n rule.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const movie = await prefetchMovie(slug);
  if (!movie) return {};

  const title = movie.year ? `${movie.title} (${movie.year})` : movie.title;
  const description = movie.synopsis || movie.title;
  const origin = await requestOrigin();
  const canonical = `${origin}/${locale}/movies/${movie.slug}`;
  const images = movie.cover
    ? [{ url: movie.cover, alt: movie.title }]
    : undefined;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "video.movie",
      siteName: "CineLog",
      images,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: movie.cover ? [movie.cover] : undefined,
    },
  };
}

export default async function MovieDetailPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const initialMovie = await prefetchMovie(slug);

  return (
    <Container paddingX={12}>
      {/* key={slug} remounts on navigation so the freshly prefetched movie seeds
          state via lazy init instead of a setState-in-effect re-sync. */}
      <MovieDetail key={slug} slug={slug} initialMovie={initialMovie} />
      <PageBottomSpacer />
    </Container>
  );
}
