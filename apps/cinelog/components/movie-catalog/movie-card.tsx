import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card } from "@repo/ui/core-elements/card";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import { Icon } from "@repo/ui/core-elements/icon";
import type { Movie, MovieFormat } from "@/lib/catalog";
import "./movie-card.css";

type Props = {
  movie: Movie;
  view: "grid" | "list";
  // Omitted for anonymous (read-only) visitors, which hides the delete button.
  onDelete?: (movie: Movie) => void;
};

// Visual style for the format header bar rendered on top of the cover.
// "other"/"" formats have no header.
const FORMAT_HEADER: Partial<
  Record<MovieFormat, { icon: string; background: string }>
> = {
  bluray: { icon: "/icons/blu-ray.svg", background: "#0033a1" },
  "4k": { icon: "/icons/blu-ray.svg", background: "#000000" },
  dvd: { icon: "/icons/dvd.svg", background: "#6b7280" },
};

export function MovieCard({ movie, view, onDelete }: Props) {
  const t = useTranslations("CatalogPage");
  const tFormat = useTranslations("MovieFormat");

  const handleDeleteClick = (
    e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete?.(movie);
  };

  const deleteButton = !onDelete ? null : (
    <IconButton
      size="sm"
      icon="/icons/delete.svg"
      iconColor="#ffffff"
      iconSize="14px"
      aria-label={t("delete")}
      title={t("delete")}
      onClick={handleDeleteClick}
      className="movie-card__delete"
      backgroundColor="rgba(0, 0, 0, 0.55)"
      borderRadius="50%"
      styles={
        view === "grid"
          ? { position: "absolute", top: 6, right: 6, zIndex: 2 }
          : undefined
      }
    />
  );

  const headerStyle = FORMAT_HEADER[movie.format];
  const formatHeader = !headerStyle ? null : (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="center"
      gap={4}
      height={20}
      width="100%"
      backgroundColor={headerStyle.background}
      styles={{ position: "absolute", top: 0, left: 0, zIndex: 1 }}
    >
      <Icon icon={headerStyle.icon} color="#ffffff" size="20px" />
      {movie.format === "4k" && (
        <Typography
          variant="label"
          color="#ffffff"
          fontWeight={700}
          // Sub-scale label sized to fit the 18px header bar.
          styles={{
            fontSize: 12,
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
          }}
        >
          {tFormat("ultraHd4k")}
        </Typography>
      )}
    </Box>
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
      {formatHeader}
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
