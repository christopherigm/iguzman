"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card } from "@repo/ui/core-elements/card";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import type { Movie } from "@/lib/catalog";
import { useIsLoggedIn } from "@/lib/use-is-logged-in";
import { FormatHeader } from "@/components/format-header";
import { AddToLibraryButton } from "./add-to-library-button";
import "./movie-card.css";

type Props = {
  movie: Movie;
  view: "grid" | "list";
};

export function MovieCard({ movie, view }: Props) {
  const t = useTranslations("CatalogPage");
  const tFormat = useTranslations("MovieFormat");
  const isLoggedIn = useIsLoggedIn();
  // The "add to library" control is shown only to a signed-in user who doesn't
  // already own the movie. `owned` is resolved per-user on every card (including
  // related-movie cards, where it's overlaid onto the cross-user cached block).
  const showAdd = isLoggedIn && !movie.owned;
  // The digital streaming icon is per-user: shown only when the signed-in user
  // has saved their own digital-copy link for this title.
  const showDigital = isLoggedIn && !!movie.digital_copy_url;

  const cover = (
    <Box
      width={view === "list" ? 70 : "100%"}
      flexDirection="column"
      borderRadius={6}
      styles={{
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {view === "list" ? null : (
        <FormatHeader
          formats={movie.formats}
          kind="bar"
          showDigital={showDigital}
        />
      )}
      <Box
        width="100%"
        styles={{
          position: "relative",
          aspectRatio: "2 / 3",
        }}
      >
        {movie.cover ? (
          <Image
            src={movie.cover}
            alt=""
            fill
            sizes={
              view === "list"
                ? "80px"
                : "(max-width: 600px) 33vw, (max-width: 900px) 25vw, 16vw"
            }
            className="movie-card__image"
            // Posters are static assets already served (and CDN-cached) by
            // Cloudflare via the R2 custom domain. Bypass Next's image optimizer
            // so the browser fetches them straight from R2 — the optimizer's
            // per-request fetch+re-encode on a cold pod was the load delay.
            unoptimized
          />
        ) : (
          <Box
            display="flex"
            alignItems="center"
            justifyContent="center"
            width="100%"
            height="100%"
            backgroundColor="var(--surface-2)"
          >
            <Typography
              variant="caption"
              textAlign="center"
              styles={{ opacity: 0.6 }}
            >
              {t("noCover")}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );

  if (view === "list") {
    return (
      <Link href={`/movies/${movie.id}`} prefetch className="movie-card">
        <Card
          flexDirection="row"
          gap={12}
          padding={8}
          alignItems="center"
          border=""
        >
          {cover}
          <Box flexDirection="column" gap={4} flex={1} minWidth={0}>
            <FormatHeader
              formats={movie.formats}
              kind="badge"
              showDigital={showDigital}
            />
            <Typography
              as="h3"
              variant="h5"
              fontWeight={600}
              styles={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {movie.title}
            </Typography>
            {movie.director && (
              <Typography variant="caption" styles={{ opacity: 0.9 }}>
                {movie.director}
              </Typography>
            )}
            <Box display="flex" gap={6} flexWrap="wrap">
              {movie.year && (
                <Badge variant="subtle" size="md">
                  {movie.year}
                </Badge>
              )}
              {movie.formats.map((fmt) => (
                <Badge key={fmt} variant="subtle" size="md">
                  {tFormat(fmt)}
                </Badge>
              ))}
            </Box>
          </Box>
          {showAdd && (
            <AddToLibraryButton
              movieId={movie.id}
              movieTitle={movie.title}
              size="sm"
            />
          )}
        </Card>
      </Link>
    );
  }

  return (
    <Link href={`/movies/${movie.id}`} prefetch className="movie-card">
      <Card padding={0} gap={0} border="">
        {cover}
        <Box
          display="flex"
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
          gap={8}
          paddingX={8}
          paddingY={8}
        >
          <Box flexDirection="column" gap={2} flex={1} minWidth={0}>
            <Typography
              as="h3"
              variant="h5"
              fontWeight={600}
              styles={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {movie.title}
            </Typography>
            {movie.year && (
              <Typography variant="caption" styles={{ opacity: 0.6 }}>
                {movie.year}
              </Typography>
            )}
          </Box>
          {showAdd && (
            <AddToLibraryButton
              movieId={movie.id}
              movieTitle={movie.title}
              size="sm"
            />
          )}
        </Box>
      </Card>
    </Link>
  );
}
