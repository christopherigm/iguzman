"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Button } from "@repo/ui/core-elements/button";

type SubmitState = "idle" | "submitting" | "queued" | "error";

/**
 * Manual title-entry form for a disc whose barcode won't scan. Posts the typed
 * title / year / director to the manual-scan endpoint, which queues a barcode-
 * less ScanQueue entry for AI resolution and Inbox review - it is never written
 * straight to the catalog. On success it shows the same "queued - review in the
 * inbox later" confirmation the barcode scanner uses.
 */
export function ManualMovieForm() {
  const t = useTranslations("ScannerPage");

  const [title, setTitle] = useState("");
  const [year, setYear] = useState("");
  const [director, setDirector] = useState("");
  const [state, setState] = useState<SubmitState>("idle");

  // A fresh edit clears a lingering queued/error banner so it doesn't outlive
  // the result it described.
  const clearResult = () =>
    setState((s) => (s === "queued" || s === "error" ? "idle" : s));

  const parsedYear = year.trim() ? Number.parseInt(year.trim(), 10) : NaN;
  const canSubmit =
    title.trim().length > 0 &&
    Number.isInteger(parsedYear) &&
    state !== "submitting";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setState("submitting");
    try {
      const res = await fetch("/api/catalog/manual-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          year: parsedYear,
          director: director.trim(),
        }),
      });
      if (res.ok) {
        setState("queued");
        setTitle("");
        setYear("");
        setDirector("");
        // Nudge the inbox below on the "Add Movie" page to refetch so the new
        // entry shows without a manual reload.
        window.dispatchEvent(new Event("cinelog:scan-queued"));
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  }

  return (
    <Card width="100%" gap={16} marginTop={16} marginBottom={16}>
      <Box flexDirection="column" gap={4}>
        <Typography as="h2" variant="h4">
          {t("formHeading")}
        </Typography>
        <Typography
          variant="caption"
          color="var(--foreground)"
          styles={{ opacity: 0.6 }}
        >
          {t("formSubtitle")}
        </Typography>
      </Box>

      <form onSubmit={handleSubmit} style={{ width: "100%" }}>
        <Box flexDirection="column" width="100%" gap={12}>
          <TextInput
            width="100%"
            label={t("titleLabel")}
            value={title}
            onChange={(value) => {
              setTitle(value);
              clearResult();
            }}
            aria-label={t("titleLabel")}
          />
          <TextInput
            width="100%"
            type="number"
            label={t("yearLabel")}
            value={year}
            onChange={(value) => {
              setYear(value);
              clearResult();
            }}
            aria-label={t("yearLabel")}
          />
          <TextInput
            width="100%"
            label={t("directorLabel")}
            value={director}
            onChange={(value) => {
              setDirector(value);
              clearResult();
            }}
            aria-label={t("directorLabel")}
          />
          <Button
            type="submit"
            text={t("formSubmit")}
            kind="primary"
            size="md"
            width="100%"
            isLoading={state === "submitting"}
            disabled={!canSubmit}
          />
        </Box>
      </form>

      {state === "queued" && (
        <Box
          flexDirection="column"
          alignItems="center"
          width="100%"
          backgroundColor="var(--surface-2)"
          border="1px solid var(--border)"
          borderRadius={8}
          paddingX={16}
          paddingY={12}
        >
          <Typography variant="caption" textAlign="center">
            {t("statusQueued")}
          </Typography>
        </Box>
      )}

      {state === "error" && (
        <Box
          flexDirection="column"
          alignItems="center"
          width="100%"
          backgroundColor="color-mix(in srgb, var(--error) 12%, var(--surface-2))"
          border="1px solid var(--error)"
          borderRadius={8}
          paddingX={16}
          paddingY={12}
        >
          <Typography variant="caption" textAlign="center">
            {t("formError")}
          </Typography>
        </Box>
      )}
    </Card>
  );
}
