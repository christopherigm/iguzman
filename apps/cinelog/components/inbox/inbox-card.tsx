"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Card } from "@repo/ui/core-elements/card";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import { Button } from "@repo/ui/core-elements/button";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Select, type SelectOption } from "@repo/ui/core-elements/select";
import type { MovieFormat } from "@/lib/catalog";
import type { InboxAcceptPayload, InboxItem } from "@/lib/inbox";

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

  const [submitting, setSubmitting] = useState<null | "accept" | "reject">(
    null,
  );

  const formatOptions: SelectOption[] = [
    { value: "", label: t("formatUnset") },
    ...FORMATS.map((value) => ({ value, label: tFormat(value) })),
  ];

  const splitList = (value: string) =>
    value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

  async function handleAccept() {
    setSubmitting("accept");
    const parsedYear = year.trim() ? Number.parseInt(year.trim(), 10) : null;
    try {
      await onAccept(item.id, {
        title: title.trim(),
        director: director.trim(),
        year: Number.isNaN(parsedYear as number) ? null : parsedYear,
        format,
        cover_url: item.extracted_cover_url,
        tmdb_id: item.extracted_tmdb_id,
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

  const busy = submitting !== null;

  return (
    <Card flexDirection="column" gap={16} padding={16}>
      <Box display="flex" gap={16} flexWrap="wrap">
        <Box
          width={96}
          borderRadius={6}
          styles={{
            position: "relative",
            overflow: "hidden",
            aspectRatio: "2 / 3",
            flexShrink: 0,
          }}
        >
          {item.extracted_cover_url ? (
            <Image
              src={item.extracted_cover_url}
              alt=""
              fill
              sizes="96px"
              style={{ objectFit: "cover" }}
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

        <Box flexDirection="column" gap={6} flex="1 1 200px" minWidth={0}>
          <Box display="flex" gap={6} alignItems="center" flexWrap="wrap">
            <Typography variant="label" styles={{ opacity: 0.6 }}>
              {t("barcodeLabel")}
            </Typography>
            <Badge variant="subtle" size="sm">
              {item.barcode}
            </Badge>
          </Box>
          {item.error_message && (
            <Typography variant="caption" styles={{ opacity: 0.7 }}>
              {item.error_message}
            </Typography>
          )}
        </Box>
      </Box>

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

      <Box display="flex" gap={8} justifyContent="flex-end" flexWrap="wrap">
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
    </Card>
  );
}
