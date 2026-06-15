import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card } from "@repo/ui/core-elements/card";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import { Button } from "@repo/ui/core-elements/button";
import type { Movie } from "@/lib/catalog";
import "./movie-card.css";

type Props = {
  movie: Movie;
  view: "grid" | "list";
  onDelete: (movie: Movie) => void;
};

export function MovieCard({ movie, view, onDelete }: Props) {
  const t = useTranslations("CatalogPage");
  const tFormat = useTranslations("MovieFormat");

  const handleDeleteClick = (
    e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete(movie);
  };

  const deleteButton = (
    <Button
      unstyled
      icon="/icons/delete.svg"
      iconColor="#ffffff"
      iconSize="14px"
      aria-label={t("delete")}
      title={t("delete")}
      onClick={handleDeleteClick}
      className="movie-card__delete"
      backgroundColor="rgba(0, 0, 0, 0.55)"
      borderRadius="50%"
      padding={6}
      display="flex"
      alignItems="center"
      justifyContent="center"
      styles={
        view === "grid"
          ? { position: "absolute", top: 6, right: 6, zIndex: 2 }
          : undefined
      }
    />
  );

  const cover = (
    <Box
      width={view === "list" ? 56 : "100%"}
      borderRadius={6}
      styles={{
        position: "relative",
        overflow: "hidden",
        aspectRatio: "2 / 3",
        flexShrink: 0,
      }}
    >
      {movie.cover ? (
        <Image
          src={movie.cover}
          alt=""
          fill
          sizes={
            view === "list"
              ? "56px"
              : "(max-width: 600px) 33vw, (max-width: 900px) 25vw, 16vw"
          }
          className="movie-card__image"
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
      {view === "grid" && deleteButton}
    </Box>
  );

  if (view === "list") {
    return (
      <Link href={`/movies/${movie.id}`} prefetch className="movie-card">
        <Card flexDirection="row" gap={12} padding={8} alignItems="center">
          {cover}
          <Box flexDirection="column" gap={4} flex={1} minWidth={0}>
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
              <Typography variant="caption" styles={{ opacity: 0.6 }}>
                {movie.director}
              </Typography>
            )}
            <Box display="flex" gap={6} flexWrap="wrap">
              {movie.year && (
                <Badge variant="subtle" size="sm">
                  {movie.year}
                </Badge>
              )}
              {movie.format && (
                <Badge variant="subtle" size="sm">
                  {tFormat(movie.format)}
                </Badge>
              )}
            </Box>
          </Box>
          {deleteButton}
        </Card>
      </Link>
    );
  }

  return (
    <Link href={`/movies/${movie.id}`} prefetch className="movie-card">
      <Card padding={0} gap={0}>
        {cover}
        <Box flexDirection="column" gap={2} paddingX={8} paddingY={8}>
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
      </Card>
    </Link>
  );
}
