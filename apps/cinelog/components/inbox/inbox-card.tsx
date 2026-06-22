"use client";

import { type CSSProperties, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Card } from "@repo/ui/core-elements/card";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import { Button } from "@repo/ui/core-elements/button";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Select, type SelectOption } from "@repo/ui/core-elements/select";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { Toast } from "@repo/ui/core-elements/toast";
import { Barcode } from "@repo/ui/core-elements/barcode";
import type { MovieFormat, MovieRefetchPreview } from "@/lib/catalog";
import { FormatHeader } from "@/components/format-header";
import {
  refetchInboxItem,
  selectInboxCandidate,
  type InboxAcceptPayload,
  type InboxItem,
} from "@/lib/inbox";
import "./inbox-card.css";

const FORMATS: Exclude<MovieFormat, "">[] = ["dvd", "bluray", "4k", "other"];

type Props = {
  item: InboxItem;
  onAccept: (id: number, payload: InboxAcceptPayload) => Promise<void>;
  onReject: (id: number) => Promise<void>;
};

export function InboxCard({ item, onAccept, onReject }: Props) {
  const t = useTranslations("InboxPage");
  const tFormat = useTranslations("MovieFormat");

  const [title, setTitle] = useState(item.extracted_title);
  const [director, setDirector] = useState(item.extracted_director);
  const [year, setYear] = useState(
    item.extracted_year ? String(item.extracted_year) : "",
  );
  const [format, setFormat] = useState<MovieFormat>("");
  const [genres, setGenres] = useState(item.extracted_genres.join(", "));
  const [cast, setCast] = useState(item.extracted_cast.join(", "));
  const [synopsis, setSynopsis] = useState(item.extracted_synopsis);
  const [trailerUrl, setTrailerUrl] = useState(item.extracted_trailer_url);

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

  const formatOptions: SelectOption[] = [
    { value: "", label: t("formatUnset") },
    ...FORMATS.map((value) => ({ value, label: tFormat(value) })),
  ];

  const splitList = (value: string) =>
    value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

  const parseYear = () => {
    const parsed = year.trim() ? Number.parseInt(year.trim(), 10) : null;
    return Number.isNaN(parsed as number) ? null : parsed;
  };

  // Overwrite the editable fields with a resolved preview and live-preview its
  // art. Shared by the re-fetch (title+year re-search) and the candidate picker
  // (exact tmdb_id) since both return the same preview shape.
  function applyPreview(data: MovieRefetchPreview) {
    setTitle(data.title);
    setDirector(data.director);
    setYear(data.year ? String(data.year) : "");
    setGenres(data.genres.join(", "));
    setCast(data.cast.join(", "));
    setSynopsis(data.synopsis);
    setTrailerUrl(data.trailer_url);
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
      const data = await refetchInboxItem(item.id, title.trim(), parseYear());
      applyPreview(data);
    } catch {
      setRefetchError(true);
    } finally {
      setFetchingRefetch(false);
    }
  }

  async function handleSelectCandidate(tmdbId: string) {
    setSelectingTmdbId(tmdbId);
    setRefetchError(false);
    try {
      // Pin the chosen candidate by its exact id, apply the resolved metadata,
      // then collapse the picker - the user can now review and accept.
      const data = await selectInboxCandidate(item.id, tmdbId);
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
        title: title.trim(),
        director: director.trim(),
        year: parseYear(),
        format,
        synopsis: synopsis.trim(),
        trailer_url: trailerUrl.trim(),
        cover_url: coverUrl,
        backdrop_url: backdropUrl,
        tmdb_id: tmdbId,
        genres: splitList(genres),
        cast: splitList(cast),
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
          <FormatHeader format={format} kind="bar" />
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
          <Box display="flex" gap={6} alignItems="center" flexWrap="wrap">
            <Typography variant="label" styles={{ opacity: 0.6 }}>
              {t("barcodeLabel")}
            </Typography>
            <Badge variant="subtle" size="md">
              {item.barcode}
            </Badge>
          </Box>
          {item.error_message && (
            <Typography variant="caption" styles={{ opacity: 0.7 }}>
              {item.error_message}
            </Typography>
          )}

          <Box display="flex" gap={8} flexWrap="wrap">
            <TextInput
              label={t("titleLabel")}
              value={title}
              onChange={setTitle}
              flex="2 1 200px"
              disabled={busy}
            />
            <TextInput
              label={t("directorLabel")}
              value={director}
              onChange={setDirector}
              flex="1 1 160px"
              disabled={busy}
            />
          </Box>

          <Box display="flex" gap={8} flexWrap="wrap">
            <TextInput
              type="number"
              label={t("yearLabel")}
              value={year}
              onChange={setYear}
              flex="1 1 100px"
              disabled={busy}
            />
            <Select
              label={t("formatLabel")}
              value={format}
              onChange={(value) => setFormat(value as MovieFormat)}
              options={formatOptions}
              flex="1 1 140px"
              disabled={busy}
            />
          </Box>

          <TextInput
            label={t("genresLabel")}
            value={genres}
            onChange={setGenres}
            disabled={busy}
          />
          <TextInput
            label={t("castLabel")}
            value={cast}
            onChange={setCast}
            disabled={busy}
          />
          <TextInput
            label={t("synopsisLabel")}
            value={synopsis}
            onChange={setSynopsis}
            multirow
            rows={5}
            disabled={busy}
          />
          <TextInput
            label={t("trailerLabel")}
            value={trailerUrl}
            onChange={setTrailerUrl}
            disabled={busy}
          />

          <Box
            display="flex"
            gap={8}
            justifyContent="space-between"
            alignItems="center"
            flexWrap="wrap"
            marginTop={4}
          >
            <Box display="flex" gap={8} flexWrap="wrap">
              <Button
                text={t("refetchData")}
                size="md"
                onClick={handleRefetch}
                isLoading={fetchingRefetch}
                disabled={busy || title.trim() === ""}
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
                disabled={busy || title.trim() === ""}
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
                  onClick={busy ? undefined : () => handleSelectCandidate(candidate.tmdb_id)}
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
                  styles={{ flexShrink: 0, cursor: busy ? "default" : "pointer" }}
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
                        <Typography variant="caption" styles={{ color: "#fff" }}>
                          {t("selecting")}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                  <Typography variant="caption" className="inbox-card__candidate-title">
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
