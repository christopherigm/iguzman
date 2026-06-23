"use client";

import { type CSSProperties, useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import { Button } from "@repo/ui/core-elements/button";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import { Spinner } from "@repo/ui/core-elements/spinner";
import { BREAKPOINTS } from "@repo/ui/core-elements/utils";
import { LinkButton } from "@repo/ui/core-elements/link-button";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { Toast } from "@repo/ui/core-elements/toast";
import {
  ApiError,
  deleteMovie,
  fetchBackdrop,
  fetchSynopsis,
  fetchTrailer,
  getMovie,
  refetchMovie,
  updateMovie,
  type MovieDetail as MovieDetailData,
  type MovieUpdatePayload,
} from "@/lib/catalog";
import { useIsLoggedIn } from "@/lib/use-is-logged-in";
import { FormatHeader } from "@/components/format-header";
import { MovieEditForm } from "./movie-edit-form";
import "./movie-detail.css";
import { NavbarSpacer } from "@repo/ui/core-elements/navbar";

type Status = "loading" | "ready" | "not_found" | "error";

const LABEL_STYLES = {
  opacity: 0.6,
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
};

/** Convert a YouTube watch / short URL into an embeddable player URL. */
function toYouTubeEmbed(url: string): string {
  try {
    const u = new URL(url);
    const key = u.hostname.includes("youtu.be")
      ? u.pathname.slice(1)
      : (u.searchParams.get("v") ?? "");
    return key ? `https://www.youtube.com/embed/${key}` : url;
  } catch {
    return url;
  }
}

/**
 * True once the viewport is at the `lg` breakpoint (desktop) or wider. Defaults
 * to false on the server / first paint so mobile behaviour is the safe fallback.
 */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${BREAKPOINTS.lg}px)`);
    const update = () => setIsDesktop(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  return isDesktop;
}

export function MovieDetail({
  id,
  initialMovie = null,
}: {
  id: string;
  /** Server-prefetched movie; seeds the first paint and skips the client fetch. */
  initialMovie?: MovieDetailData | null;
}) {
  const t = useTranslations("MovieDetailPage");
  const tFormat = useTranslations("MovieFormat");
  const router = useRouter();
  const isLoggedIn = useIsLoggedIn();
  const isDesktop = useIsDesktop();
  const [movie, setMovie] = useState<MovieDetailData | null>(initialMovie);
  const [status, setStatus] = useState<Status>(
    initialMovie ? "ready" : "loading",
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);
  // Live preview of a re-fetched poster/wallpaper while editing; null falls back
  // to the saved image. Cleared on save (the reloaded movie carries the new art)
  // and on cancel (discard the preview).
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [backdropPreview, setBackdropPreview] = useState<string | null>(null);

  function clearPreviews() {
    setCoverPreview(null);
    setBackdropPreview(null);
  }

  async function handleSave(payload: MovieUpdatePayload) {
    setSaveError(false);
    try {
      const updated = await updateMovie(id, payload);
      setMovie(updated);
      setEditing(false);
      clearPreviews();
      setSaved(true);
    } catch (err) {
      setSaveError(true);
      throw err; // Let the form re-enable so the user can retry.
    }
  }

  async function handleRefetch(title: string, year: number | null) {
    const data = await refetchMovie(id, title, year);
    // Live-preview the resolved art on the page. An empty URL means the fallback
    // found no image, so keep showing the current one rather than blanking it.
    if (data.cover_url) setCoverPreview(data.cover_url);
    if (data.backdrop_url) setBackdropPreview(data.backdrop_url);
    return data;
  }

  function handleCancelEdit() {
    setEditing(false);
    clearPreviews();
  }

  async function handleGetBackdrop() {
    const updated = await fetchBackdrop(id);
    setMovie(updated);
  }

  async function handleGetSynopsis() {
    const updated = await fetchSynopsis(id);
    setMovie(updated);
    return updated.synopsis;
  }

  async function handleGetTrailer() {
    const updated = await fetchTrailer(id);
    setMovie(updated);
    return updated.trailer_url;
  }

  // On desktop (lg+) play the trailer in the in-page modal. On smaller screens
  // most users are on a phone/tablet, so open the YouTube URL directly to hand
  // off to the native app instead of cramming a player into the viewport.
  function handleTrailerClick() {
    if (!movie?.trailer_url) return;
    if (isDesktop) {
      setShowTrailer(true);
    } else {
      window.open(movie.trailer_url, "_blank", "noopener,noreferrer");
    }
  }

  async function handleConfirmDelete() {
    setShowDeleteConfirm(false);
    setDeleting(true);
    try {
      await deleteMovie(id);
      router.push("/");
    } catch {
      setDeleting(false);
      setDeleteError(true);
    }
  }

  // Auto-clear the success flag so a later save can re-trigger the toast.
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 5000);
    return () => clearTimeout(timer);
  }, [saved]);

  useEffect(() => {
    // The server prefetched this movie; render it without a client round-trip.
    // (On navigation the parent passes fresh data for the new id.)
    if (initialMovie) {
      setMovie(initialMovie);
      setStatus("ready");
      return;
    }
    let active = true;
    setStatus("loading");
    getMovie(id)
      .then((data) => {
        if (!active) return;
        setMovie(data);
        setStatus("ready");
      })
      .catch((err) => {
        if (!active) return;
        setStatus(
          err instanceof ApiError && err.status === 404 ? "not_found" : "error",
        );
      });
    return () => {
      active = false;
    };
  }, [id, initialMovie]);

  if (status === "loading") {
    return (
      <Box display="flex" justifyContent="center" paddingY={40}>
        <Spinner label={t("loading")} />
      </Box>
    );
  }

  if (status !== "ready" || !movie) {
    return (
      <Box flexDirection="column" alignItems="center" gap={12} paddingY={40}>
        <Typography variant="body" role="alert">
          {status === "not_found" ? t("notFound") : t("error")}
        </Typography>
        <LinkButton label={t("back")} href="/" />
      </Box>
    );
  }

  // A re-fetch preview overrides the saved art while editing so the user sees
  // the matched version before saving.
  const displayCover = coverPreview ?? movie.cover;
  const displayBackdrop = backdropPreview ?? movie.backdrop;

  // Dim, full-bleed wallpaper behind the whole card; falls back to the plain
  // layout when the API resolved no backdrop. The image URL is dynamic, so it
  // rides in as a CSS variable consumed by the `::before` in movie-detail.css.
  const backdropStyles = displayBackdrop
    ? ({
        position: "relative",
        isolation: "isolate",
        "--backdrop-image": `url("${displayBackdrop}")`,
      } as CSSProperties)
    : undefined;

  return (
    <Box
      flexDirection="column"
      gap={20}
      paddingY={16}
      className={displayBackdrop ? "movie-detail__backdrop" : undefined}
      styles={backdropStyles}
    >
      <NavbarSpacer />

      {showDeleteConfirm && (
        <ConfirmationModal
          title={t("confirmDeleteTitle")}
          text={t("confirmDeleteText", { title: movie.title })}
          okCallback={handleConfirmDelete}
          cancelCallback={() => setShowDeleteConfirm(false)}
        />
      )}

      {showTrailer && movie.trailer_url && (
        <ConfirmationModal
          title={t("trailer")}
          text={movie.title}
          okCallback={() => setShowTrailer(false)}
          panelMaxWidth="760px"
        >
          <Box
            width="100%"
            borderRadius={8}
            styles={{
              position: "relative",
              overflow: "hidden",
              aspectRatio: "16 / 9",
            }}
          >
            <iframe
              className="movie-detail__trailer-frame"
              src={toYouTubeEmbed(movie.trailer_url)}
              title={t("trailer")}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </Box>
        </ConfirmationModal>
      )}

      {deleteError && (
        <Toast
          message={t("deleteError")}
          variant="error"
          position="top-center"
        />
      )}

      {saveError && (
        <Toast message={t("saveError")} variant="error" position="top-center" />
      )}

      {saved && (
        <Toast message={t("saved")} variant="success" position="top-center" />
      )}

      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        gap={8}
      >
        <Button
          text={t("back")}
          icon="/icons/return.svg"
          size="md"
          onClick={() => {
            // Return to the exact catalog the user came from (its URL carries
            // the filters/sort/page, and the browser restores scroll). Fall
            // back to home on a direct/deep link with no in-app history.
            if (window.history.length > 1) router.back();
            else router.push("/");
          }}
        />
        {!editing && (movie.trailer_url || isLoggedIn) && (
          <Box display="flex" gap={8} flexWrap="wrap">
            {isLoggedIn && (
              <>
                <IconButton
                  icon="/icons/delete.svg"
                  aria-label={t("delete")}
                  title={t("delete")}
                  kind="error"
                  size="md"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={deleting}
                />
                <IconButton
                  icon="/icons/edit.svg"
                  aria-label={t("edit")}
                  title={t("edit")}
                  kind="warning"
                  size="md"
                  onClick={() => setEditing(true)}
                  disabled={deleting}
                />
              </>
            )}
            {movie.trailer_url && (
              <Button
                text={t("trailer")}
                icon="/icons/trailer.svg"
                size="md"
                onClick={handleTrailerClick}
                disabled={deleting}
                kind="primary"
              />
            )}
          </Box>
        )}
      </Box>

      <Box
        display="flex"
        className="movie-detail__layout"
        gap={24}
        marginTop={24}
      >
        <Box
          width="100%"
          flexDirection="column"
          borderRadius={8}
          className="movie-detail__cover"
          styles={{
            overflow: "hidden",
            flexShrink: 0,
          }}
          elevation={5}
        >
          <FormatHeader
            format={movie.format}
            kind="bar"
            size={{ xs: "md", md: "lg" }}
          />
          <Box
            width="100%"
            styles={{
              position: "relative",
              aspectRatio: "2 / 3",
            }}
          >
            {displayCover ? (
              <Image
                src={displayCover}
                alt=""
                fill
                sizes="(max-width: 900px) 196px, (max-width: 1200px) 224px, 280px"
                className="movie-detail__image"
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
                <Typography variant="caption" styles={{ opacity: 0.6 }}>
                  {t("noCover")}
                </Typography>
              </Box>
            )}
          </Box>
        </Box>

        <Box flexDirection="column" gap={16} flex={1}>
          {editing ? (
            <MovieEditForm
              movie={movie}
              onSave={handleSave}
              onCancel={handleCancelEdit}
              onRefetch={handleRefetch}
              onGetBackdrop={handleGetBackdrop}
              onGetSynopsis={handleGetSynopsis}
              onGetTrailer={handleGetTrailer}
            />
          ) : (
            <Box display="flex" flexDirection="column" gap={16} flex={1}>
              <Typography as="h1" variant="h2" fontWeight={700}>
                {movie.title}
              </Typography>

              <Box display="flex" gap={8} flexWrap="wrap">
                {movie.year && (
                  <Badge variant="subtle" size="md">
                    {movie.year}
                  </Badge>
                )}
                {movie.format && (
                  <Badge variant="subtle" size="md">
                    {tFormat(movie.format)}
                  </Badge>
                )}
              </Box>

              {movie.director && (
                <Box flexDirection="column" gap={2}>
                  <Typography variant="label" styles={LABEL_STYLES}>
                    {t("director")}
                  </Typography>
                  <Typography variant="body">{movie.director}</Typography>
                </Box>
              )}

              {movie.genres.length > 0 && (
                <Box flexDirection="column" gap={6}>
                  <Typography variant="label" styles={LABEL_STYLES}>
                    {t("genres")}
                  </Typography>
                  <Box display="flex" gap={6} flexWrap="wrap" paddingTop={8}>
                    {movie.genres.map((genre) => (
                      <Badge key={genre.id} variant="outlined" size="md">
                        {genre.name}
                      </Badge>
                    ))}
                  </Box>
                </Box>
              )}

              {movie.synopsis && (
                <Box flexDirection="column" gap={6}>
                  <Typography variant="label" styles={LABEL_STYLES}>
                    {t("synopsis")}
                  </Typography>
                  <Typography
                    variant="body"
                    styles={{ lineHeight: 1.6, whiteSpace: "pre-line" }}
                  >
                    {movie.synopsis}
                  </Typography>
                </Box>
              )}

              {movie.cast.length > 0 && (
                <Box flexDirection="column" gap={6}>
                  <Typography variant="label" styles={LABEL_STYLES}>
                    {t("cast")}
                  </Typography>
                  <Typography variant="body">
                    {movie.cast.map((actor) => actor.name).join(", ")}
                  </Typography>
                </Box>
              )}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
