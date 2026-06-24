"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Select, type SelectOption } from "@repo/ui/core-elements/select";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { Toast } from "@repo/ui/core-elements/toast";
import type {
  MovieBarcode,
  MovieDetail,
  MovieFormat,
  MovieRefetchPreview,
  MovieUpdatePayload,
} from "@/lib/catalog";
import { FORMAT_BUTTONS } from "@/components/format-buttons";

type Format = Exclude<MovieFormat, "">;

type Props = {
  movie: MovieDetail;
  onSave: (payload: MovieUpdatePayload) => Promise<void>;
  onCancel: () => void;
  onRefetch: (
    title: string,
    year: number | null,
  ) => Promise<MovieRefetchPreview>;
  onGetBackdrop: () => Promise<void>;
  onGetSynopsis: () => Promise<string>;
  onGetTrailer: () => Promise<string>;
};

export function MovieEditForm({
  movie,
  onSave,
  onCancel,
  onRefetch,
  onGetBackdrop,
  onGetSynopsis,
  onGetTrailer,
}: Props) {
  const t = useTranslations("MovieDetailPage");
  const tFormat = useTranslations("MovieFormat");

  const [title, setTitle] = useState(movie.title);
  const [director, setDirector] = useState(movie.director);
  const [year, setYear] = useState(movie.year ? String(movie.year) : "");
  const [formats, setFormats] = useState<Format[]>(movie.formats);
  const [barcodes, setBarcodes] = useState<MovieBarcode[]>(movie.barcodes);
  const [genres, setGenres] = useState(
    movie.genres.map((genre) => genre.name).join(", "),
  );
  const [cast, setCast] = useState(
    movie.cast.map((actor) => actor.name).join(", "),
  );
  const [synopsis, setSynopsis] = useState(movie.synopsis);
  const [trailerUrl, setTrailerUrl] = useState(movie.trailer_url);

  // Media a re-fetch may replace. These aren't editable inputs - they ride along
  // in the save payload only after a re-fetch sets `refetched`, so a plain text
  // edit never disturbs the existing cover, backdrop, or tmdb_id.
  const [coverUrl, setCoverUrl] = useState(movie.cover_url);
  const [backdropUrl, setBackdropUrl] = useState("");
  const [tmdbId, setTmdbId] = useState(movie.tmdb_id);
  const [refetched, setRefetched] = useState(false);

  const [saving, setSaving] = useState(false);
  const [fetchingRefetch, setFetchingRefetch] = useState(false);
  const [refetchError, setRefetchError] = useState(false);
  const [fetchingBackdrop, setFetchingBackdrop] = useState(false);
  const [backdropError, setBackdropError] = useState(false);
  const [fetchingSynopsis, setFetchingSynopsis] = useState(false);
  const [synopsisError, setSynopsisError] = useState(false);
  const [fetchingTrailer, setFetchingTrailer] = useState(false);
  const [trailerError, setTrailerError] = useState(false);

  // Any in-flight action locks the whole row so the user can't save, cancel, or
  // re-trigger a fetch mid-request.
  const busy =
    saving ||
    fetchingRefetch ||
    fetchingBackdrop ||
    fetchingSynopsis ||
    fetchingTrailer;

  // Format options for a barcode's format select (includes an "unset" entry).
  const barcodeFormatOptions: SelectOption[] = [
    { value: "", label: t("formatUnset") },
    ...FORMAT_BUTTONS.map(({ value }) => ({ value, label: tFormat(value) })),
  ];

  const toggleFormat = (value: Format) => {
    setFormats((prev) =>
      prev.includes(value) ? prev.filter((f) => f !== value) : [...prev, value],
    );
  };

  const updateBarcode = (index: number, patch: Partial<MovieBarcode>) => {
    setBarcodes((prev) =>
      prev.map((bc, i) => (i === index ? { ...bc, ...patch } : bc)),
    );
  };

  const addBarcode = () =>
    setBarcodes((prev) => [...prev, { code: "", format: "" }]);

  const removeBarcode = (index: number) =>
    setBarcodes((prev) => prev.filter((_, i) => i !== index));

  const splitList = (value: string) =>
    value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

  const parseYear = () => {
    const parsed = year.trim() ? Number.parseInt(year.trim(), 10) : null;
    return Number.isNaN(parsed as number) ? null : parsed;
  };

  async function handleRefetch() {
    setFetchingRefetch(true);
    setRefetchError(false);
    try {
      // Re-search with the (possibly corrected) title + year, then overwrite
      // every field with the resolved version. The parent live-previews the new
      // poster/backdrop on the page; we keep them for the save payload. Formats
      // and barcodes are physical-copy data, so a re-fetch leaves them alone.
      const data = await onRefetch(title.trim(), parseYear());
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
      setRefetched(true);
    } catch {
      setRefetchError(true);
    } finally {
      setFetchingRefetch(false);
    }
  }

  async function handleGetBackdrop() {
    setFetchingBackdrop(true);
    setBackdropError(false);
    try {
      // Parent updates the movie on success, which clears `movie.backdrop` and
      // hides this button on the next render.
      await onGetBackdrop();
    } catch {
      setBackdropError(true);
    } finally {
      setFetchingBackdrop(false);
    }
  }

  async function handleGetSynopsis() {
    setFetchingSynopsis(true);
    setSynopsisError(false);
    try {
      // Mirror the auto-fetched text into the editable field so the user can
      // tweak it before saving.
      setSynopsis(await onGetSynopsis());
    } catch {
      setSynopsisError(true);
    } finally {
      setFetchingSynopsis(false);
    }
  }

  async function handleGetTrailer() {
    setFetchingTrailer(true);
    setTrailerError(false);
    try {
      setTrailerUrl(await onGetTrailer());
    } catch {
      setTrailerError(true);
    } finally {
      setFetchingTrailer(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        director: director.trim(),
        year: parseYear(),
        formats,
        // Drop blank rows the user added but never filled in.
        barcodes: barcodes
          .filter((bc) => bc.code.trim() !== "")
          .map((bc) => ({ code: bc.code.trim(), format: bc.format })),
        synopsis: synopsis.trim(),
        trailer_url: trailerUrl.trim(),
        genres: splitList(genres),
        cast: splitList(cast),
        // Carry the re-fetched media only when a re-fetch happened, so a plain
        // edit never clobbers the existing cover, backdrop, or tmdb_id.
        ...(refetched && {
          cover_url: coverUrl,
          backdrop_url: backdropUrl,
          tmdb_id: tmdbId,
        }),
      });
    } catch {
      // The parent surfaces the error toast; keep the form open to retry.
      setSaving(false);
    }
  }

  return (
    <Box display="flex" flexDirection="column" gap={12}>
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

      <Box display="flex" gap={8} flexWrap="wrap" alignItems="flex-end">
        <TextInput
          type="number"
          label={t("yearLabel")}
          value={year}
          onChange={setYear}
          flex="1 1 100px"
          disabled={busy}
        />
        <Box display="flex" flexDirection="column" gap={4}>
          <Typography variant="caption" styles={{ opacity: 0.7 }}>
            {t("formatLabel")}
          </Typography>
          <Box display="flex" gap={4} alignItems="center">
            {FORMAT_BUTTONS.map(({ value, icon, iconColor, fullColor }) => {
              const selected = formats.includes(value);
              return (
                <IconButton
                  key={value}
                  icon={icon}
                  iconColor={iconColor}
                  kind={selected ? "primary" : "default"}
                  aria-label={tFormat(value)}
                  aria-pressed={selected}
                  title={tFormat(value)}
                  size="sm"
                  onClick={() => toggleFormat(value)}
                  fullColor={fullColor}
                  solid={selected}
                  disabled={busy}
                />
              );
            })}
          </Box>
        </Box>
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

      <Box display="flex" flexDirection="column" gap={8}>
        <Typography variant="caption" styles={{ opacity: 0.7 }}>
          {t("barcodesLabel")}
        </Typography>
        {barcodes.map((bc, index) => (
          <Box
            key={index}
            display="flex"
            gap={8}
            alignItems="flex-end"
            flexWrap="wrap"
          >
            <TextInput
              label={t("barcodeCodeLabel")}
              value={bc.code}
              onChange={(value) => updateBarcode(index, { code: value })}
              flex="2 1 160px"
              inputMode="numeric"
              disabled={busy}
            />
            <Select
              label={t("formatLabel")}
              value={bc.format}
              onChange={(value) =>
                updateBarcode(index, { format: value as MovieFormat })
              }
              options={barcodeFormatOptions}
              flex="1 1 120px"
              disabled={busy}
            />
            <IconButton
              icon="/icons/delete.svg"
              aria-label={t("removeBarcode")}
              title={t("removeBarcode")}
              kind="error"
              size="md"
              onClick={() => removeBarcode(index)}
              disabled={busy}
              translucent
            />
          </Box>
        ))}

        <Box display="flex" justifyContent="end">
          <Button
            text={t("addBarcode")}
            size="sm"
            onClick={addBarcode}
            disabled={busy}
            kind="primary"
          />
        </Box>
      </Box>

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
            disabled={busy || title.trim() === ""}
            kind="primary"
          />
          {!movie.backdrop && (
            <Button
              text={t("getBackdrop")}
              size="md"
              onClick={handleGetBackdrop}
              isLoading={fetchingBackdrop}
              disabled={busy}
              kind="primary"
            />
          )}
          {!synopsis && (
            <Button
              text={t("getSynopsis")}
              size="md"
              onClick={handleGetSynopsis}
              isLoading={fetchingSynopsis}
              disabled={busy}
              kind="primary"
            />
          )}
          {!trailerUrl && (
            <Button
              text={t("getTrailer")}
              size="md"
              onClick={handleGetTrailer}
              isLoading={fetchingTrailer}
              disabled={busy}
              kind="primary"
            />
          )}
        </Box>
        <Box display="flex" gap={8} flexWrap="wrap">
          <Button
            text={t("cancel")}
            size="md"
            onClick={onCancel}
            disabled={busy}
            translucent
          />
          <Button
            text={t("save")}
            kind="success"
            size="md"
            onClick={handleSave}
            isLoading={saving}
            disabled={busy || title.trim() === ""}
          />
        </Box>
      </Box>

      {fetchingRefetch && <ProgressBar label={t("fetchingRefetch")} />}
      {fetchingBackdrop && <ProgressBar label={t("fetchingBackdrop")} />}
      {fetchingSynopsis && <ProgressBar label={t("fetchingSynopsis")} />}
      {fetchingTrailer && <ProgressBar label={t("fetchingTrailer")} />}

      {refetchError && (
        <Toast
          message={t("refetchError")}
          variant="error"
          position="top-center"
        />
      )}

      {backdropError && (
        <Toast
          message={t("backdropError")}
          variant="error"
          position="top-center"
        />
      )}

      {synopsisError && (
        <Toast
          message={t("synopsisError")}
          variant="error"
          position="top-center"
        />
      )}

      {trailerError && (
        <Toast
          message={t("trailerError")}
          variant="error"
          position="top-center"
        />
      )}
    </Box>
  );
}
