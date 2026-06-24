"use client";

import { type CSSProperties, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Card } from "@repo/ui/core-elements/card";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import { Button } from "@repo/ui/core-elements/button";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { Toast } from "@repo/ui/core-elements/toast";
import { Barcode } from "@repo/ui/core-elements/barcode";
import type { Category, MovieRefetchPreview } from "@/lib/catalog";
import { FormatHeader } from "@/components/format-header";
import {
  MovieMetadataFields,
  parseYearInput,
  splitList,
  type MovieMetadataValue,
} from "@/components/movie-metadata-fields";
import {
  refetchInboxItem,
  selectInboxCandidate,
  type InboxAcceptPayload,
  type InboxItem,
} from "@/lib/inbox";
import "./inbox-card.css";

type Props = {
  item: InboxItem;
  /** The selectable genre set, threaded down to the shared metadata fields. */
  categories: Category[];
  onAccept: (id: number, payload: InboxAcceptPayload) => Promise<void>;
  onReject: (id: number) => Promise<void>;
};

export function InboxCard({ item, categories, onAccept, onReject }: Props) {
  const t = useTranslations("InboxPage");

  // All editable metadata fields live in one object so the shared
  // MovieMetadataFields can render them. Formats start empty - the scanned disc's
  // format is chosen by the reviewer before accepting.
  const [meta, setMeta] = useState<MovieMetadataValue>({
    title: item.extracted_title,
    director: item.extracted_director,
    year: item.extracted_year ? String(item.extracted_year) : "",
    formats: [],
    audioFormats: item.extracted_audio_formats,
    hdrFormats: item.extracted_hdr_formats,
    genres: item.extracted_genres,
    cast: item.extracted_cast.join(", "),
    spokenLanguages: item.extracted_spoken_languages.join(", "),
    subtitleLanguages: item.extracted_subtitle_languages.join(", "),
    synopsis: item.extracted_synopsis,
    trailerUrl: item.extracted_trailer_url,
  });
  const patchMeta = (patch: Partial<MovieMetadataValue>) =>
    setMeta((prev) => ({ ...prev, ...patch }));

  // Media a re-fetch may replace. Seeded from the resolved entry; only a
  // re-fetch overwrites them, so accepting without one keeps the original cover,
  // wallpaper, and tmdb_id. `backdropUrl` stays empty unless a re-fetch supplies
  // a new source - the API then re-downloads it, otherwise it carries the
  // wallpaper resolved during review.
  const [coverUrl, setCoverUrl] = useState(item.extracted_cover_url);
  const [backdropUrl, setBackdropUrl] = useState("");
  const [tmdbId, setTmdbId] = useState(item.extracted_tmdb_id);
  // Live preview of re-fetched art; null falls back to the resolved entry's art.
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [backdropPreview, setBackdropPreview] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState<null | "accept" | "reject">(
    null,
  );
  const [fetchingRefetch, setFetchingRefetch] = useState(false);
  const [refetchError, setRefetchError] = useState(false);
  // The candidate picker (alternative TMDB matches) is hidden until the user
  // signals the default match is wrong. `selectingTmdbId` marks the poster being
  // resolved so only it shows a spinner.
  const [showCandidates, setShowCandidates] = useState(false);
  const [selectingTmdbId, setSelectingTmdbId] = useState<string | null>(null);

  const busy =
    submitting !== null || fetchingRefetch || selectingTmdbId !== null;

  // Overwrite the editable fields with a resolved preview and live-preview its
  // art. Shared by the re-fetch (title+year re-search) and the candidate picker
  // (exact tmdb_id) since both return the same preview shape.
  function applyPreview(data: MovieRefetchPreview) {
    patchMeta({
      title: data.title,
      director: data.director,
      year: data.year ? String(data.year) : "",
      genres: data.genres,
      cast: data.cast.join(", "),
      audioFormats: data.audio_formats,
      hdrFormats: data.hdr_formats,
      spokenLanguages: data.spoken_languages.join(", "),
      subtitleLanguages: data.subtitle_languages.join(", "),
      synopsis: data.synopsis,
      trailerUrl: data.trailer_url,
    });
    setCoverUrl(data.cover_url);
    setBackdropUrl(data.backdrop_url);
    setTmdbId(data.tmdb_id);
    // Empty URL means the fallback found no image; keep showing the current one.
    if (data.cover_url) setCoverPreview(data.cover_url);
    if (data.backdrop_url) setBackdropPreview(data.backdrop_url);
  }

  async function handleRefetch() {
    setFetchingRefetch(true);
    setRefetchError(false);
    try {
      // Re-search with the (possibly corrected) title + year, then apply the
      // resolved version to the form.
      const data = await refetchInboxItem(
        item.id,
        meta.title.trim(),
        parseYearInput(meta.year),
      );
      applyPreview(data);
    } catch {
      setRefetchError(true);
    } finally {
      setFetchingRefetch(false);
    }
  }

  async function handleSelectCandidate(candidateTmdbId: string) {
    setSelectingTmdbId(candidateTmdbId);
    setRefetchError(false);
    try {
      // Pin the chosen candidate by its exact id, apply the resolved metadata,
      // then collapse the picker - the user can now review and accept.
      const data = await selectInboxCandidate(item.id, candidateTmdbId);
      applyPreview(data);
      setShowCandidates(false);
    } catch {
      setRefetchError(true);
    } finally {
      setSelectingTmdbId(null);
    }
  }

  async function handleAccept() {
    setSubmitting("accept");
    try {
      await onAccept(item.id, {
        title: meta.title.trim(),
        director: meta.director.trim(),
        year: parseYearInput(meta.year),
        formats: meta.formats,
        synopsis: meta.synopsis.trim(),
        trailer_url: meta.trailerUrl.trim(),
        cover_url: coverUrl,
        backdrop_url: backdropUrl,
        tmdb_id: tmdbId,
        genres: meta.genres,
        cast: splitList(meta.cast),
        audio_formats: meta.audioFormats,
        hdr_formats: meta.hdrFormats,
        spoken_languages: splitList(meta.spokenLanguages),
        subtitle_languages: splitList(meta.subtitleLanguages),
      });
    } catch {
      // On success the card unmounts; only reset when the call failed.
      setSubmitting(null);
    }
  }

  async function handleReject() {
    setSubmitting("reject");
    try {
      await onReject(item.id);
    } catch {
      setSubmitting(null);
    }
  }

  const displayCover = coverPreview ?? item.extracted_cover_url;
  const displayBackdrop = backdropPreview ?? item.extracted_backdrop;

  // Dimmed wallpaper behind the card content; falls back to the plain card when
  // the entry resolved no backdrop. The image URL is dynamic, so it rides in as
  // a CSS variable consumed by the `::before` in inbox-card.css.
  const backdropStyles = displayBackdrop
    ? ({
        position: "relative",
        isolation: "isolate",
        overflow: "hidden",
        "--backdrop-image": `url("${displayBackdrop}")`,
      } as CSSProperties)
    : undefined;

  return (
    <Card
      gap={20}
      padding={16}
      className={displayBackdrop ? "inbox-card__backdrop" : undefined}
      styles={backdropStyles}
    >
      <Box display="flex" className="inbox-card__layout" gap={24}>
        <Box
          width={160}
          flexDirection="column"
          borderRadius={6}
          className="inbox-card__cover"
          styles={{
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          <FormatHeader formats={meta.formats} kind="bar" />
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
                sizes="160px"
                className="inbox-card__image"
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
          {item.barcode && (
            <Box padding={8} backgroundColor="var(--surface-1)">
              <Barcode value={item.barcode} height="sm" />
            </Box>
          )}
        </Box>

        <Box flexDirection="column" gap={16} flex={1} minWidth={0}>
          {item.error_message && (
            <Typography variant="caption" styles={{ opacity: 0.7 }}>
              {item.error_message}
            </Typography>
          )}

          <MovieMetadataFields
            value={meta}
            onPatch={patchMeta}
            namespace="InboxPage"
            categories={categories}
            disabled={busy}
          />

          <Box
            display="flex"
            gap={8}
            justifyContent="space-between"
            alignItems="center"
            flexWrap="wrap"
            marginTop={12}
          >
            <Box display="flex" gap={8} flexWrap="wrap">
              <Button
                text={t("refetchData")}
                size="md"
                onClick={handleRefetch}
                isLoading={fetchingRefetch}
                disabled={busy || meta.title.trim() === ""}
                kind="primary"
              />
              {item.candidates.length > 0 && (
                <Button
                  text={showCandidates ? t("hideMatches") : t("wrongMatch")}
                  size="md"
                  onClick={() => setShowCandidates((open) => !open)}
                  disabled={busy}
                />
              )}
            </Box>
            <Box display="flex" gap={8} flexWrap="wrap">
              <Button
                text={t("reject")}
                kind="error"
                size="md"
                onClick={handleReject}
                isLoading={submitting === "reject"}
                disabled={busy}
              />
              <Button
                text={t("accept")}
                kind="success"
                size="md"
                onClick={handleAccept}
                isLoading={submitting === "accept"}
                disabled={busy || meta.title.trim() === ""}
              />
            </Box>
          </Box>

          {fetchingRefetch && <ProgressBar label={t("fetchingRefetch")} />}
        </Box>
      </Box>

      {showCandidates && item.candidates.length > 0 && (
        <Box flexDirection="column" gap={8}>
          <Typography variant="label" styles={{ opacity: 0.7 }}>
            {t("pickMatch")}
          </Typography>
          <Box display="flex" gap={12} className="inbox-card__candidates">
            {item.candidates.map((candidate) => {
              const selected = candidate.tmdb_id === tmdbId;
              const loading = selectingTmdbId === candidate.tmdb_id;
              return (
                <Box
                  key={candidate.id}
                  role="button"
                  tabIndex={busy ? -1 : 0}
                  onClick={
                    busy
                      ? undefined
                      : () => handleSelectCandidate(candidate.tmdb_id)
                  }
                  onKeyDown={(event) => {
                    if (busy) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleSelectCandidate(candidate.tmdb_id);
                    }
                  }}
                  flexDirection="column"
                  gap={6}
                  padding={6}
                  borderRadius={6}
                  width={120}
                  backgroundColor={
                    selected ? "var(--surface-2)" : "transparent"
                  }
                  className="inbox-card__candidate"
                  styles={{
                    flexShrink: 0,
                    cursor: busy ? "default" : "pointer",
                  }}
                >
                  <Box
                    width="100%"
                    borderRadius={4}
                    styles={{
                      position: "relative",
                      aspectRatio: "2 / 3",
                      overflow: "hidden",
                    }}
                  >
                    {candidate.cover_url ? (
                      <Image
                        src={candidate.cover_url}
                        alt=""
                        fill
                        sizes="120px"
                        className="inbox-card__image"
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
                    {loading && (
                      <Box
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        styles={{
                          position: "absolute",
                          inset: 0,
                          background: "rgba(0, 0, 0, 0.5)",
                        }}
                      >
                        <Typography
                          variant="caption"
                          styles={{ color: "#fff" }}
                        >
                          {t("selecting")}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                  <Typography
                    variant="caption"
                    className="inbox-card__candidate-title"
                  >
                    {candidate.title}
                    {candidate.year ? ` (${candidate.year})` : ""}
                  </Typography>
                  {candidate.overview && (
                    <Typography
                      variant="label"
                      styles={{ opacity: 0.6 }}
                      className="inbox-card__candidate-overview"
                    >
                      {candidate.overview}
                    </Typography>
                  )}
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {refetchError && (
        <Toast
          message={t("refetchError")}
          variant="error"
          position="top-center"
        />
      )}
    </Card>
  );
}
