"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Select, type SelectOption } from "@repo/ui/core-elements/select";
import { Switch } from "@repo/ui/core-elements/switch";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Typography } from "@repo/ui/core-elements/typography";
import { Toast } from "@repo/ui/core-elements/toast";
import {
  PhotoPicker,
  type PickedPhoto,
} from "@/components/contribute/photo-picker";
import { ReviewRow } from "@/components/contribute/review-row";
import { StageShell } from "@/components/contribute/stage-shell";
import { SubmittedPanel } from "@/components/contribute/submitted-panel";
import {
  contributeSighting,
  firstErrorMessage,
  type SightingSubmission,
} from "@/lib/contribute";

/**
 * The three-stage journal entry.
 *
 * 1. **When, where, and the photographs.** The species is already decided (the FAB
 *   was pressed on its page), so this stage is the three things an entry cannot be
 *   filed without - and all three are what the API refuses without: a date, a place
 *   or a pin, and at least one photo.
 * 2. **The rest of the outing** - a title, the story, the time, the weather, the
 *   temperature, how many were seen, and the credit line. Every field optional.
 * 3. **Review** - everything as it will be filed, then submit.
 *
 * Three things worth knowing:
 *
 * - **The season is not asked for.** `Sighting.save()` derives it from the date,
 *   which is the right answer for a contributor and one fewer dropdown.
 * - **The credit line defaults to the account's own name and stays editable**,
 *   because an author may be filing a friend's photograph - and the anonymity switch
 *   is a *decision*, not a display toggle: the API stores no name at all when it is
 *   on (see animals-api's `SightingSerializer` on why that has to happen at write
 *   time rather than at render time).
 * - **Only the base half of each text pair is written**, as in the species flow.
 */

interface Props {
  speciesId: number;
  speciesName: string;
  speciesHref: string;
  defaultAuthorName: string;
  locations: SelectOption[];
  weather: SelectOption[];
}

const EMPTY = {
  name: "",
  shortDescription: "",
  description: "",
  date: "",
  time: "",
  location: "",
  weather: "",
  temperature: "",
  individuals: "",
};

export function SightingContributeForm({
  speciesId,
  speciesName,
  speciesHref,
  defaultAuthorName,
  locations,
  weather,
}: Props) {
  const t = useTranslations("Contribute");

  const [stage, setStage] = useState(1);
  const [draft, setDraft] = useState(EMPTY);
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [authorName, setAuthorName] = useState(defaultAuthorName);
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const set = <K extends keyof typeof EMPTY>(key: K, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const reset = () => {
    setDraft(EMPTY);
    setPhotos([]);
    setAuthorName(defaultAuthorName);
    setAnonymous(false);
    setStage(1);
    setDone(false);
    setError(null);
  };

  const locationLabel =
    locations.find((option) => option.value === draft.location)?.label ?? null;
  const weatherLabel =
    weather.find((option) => option.value === draft.weather)?.label ?? null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const submission: SightingSubmission = {
        species: speciesId,
        date: draft.date,
        photos: photos.map((photo) => photo.dataUrl),
        author_anonymous: anonymous,
      };
      // Only what was filled in - a blank string is a written value to the API,
      // so an omitted field must be genuinely omitted.
      if (draft.name.trim()) submission.name = draft.name.trim();
      if (draft.shortDescription.trim())
        submission.short_description = draft.shortDescription.trim();
      if (draft.description.trim())
        submission.description = draft.description.trim();
      if (draft.time) submission.time = draft.time;
      if (draft.location) submission.location = Number(draft.location);
      if (draft.weather) submission.weather = Number(draft.weather);
      // `Number('')` is 0, which would file a real 0 °C and a real count of zero -
      // so each numeric field is guarded on the raw string, not on the parse.
      if (draft.temperature.trim() !== "") {
        const parsed = Number(draft.temperature);
        if (!Number.isNaN(parsed)) submission.temperature_c = parsed;
      }
      if (draft.individuals.trim() !== "") {
        const parsed = Number(draft.individuals);
        if (Number.isInteger(parsed) && parsed > 0)
          submission.individuals = parsed;
      }
      // Sent even when anonymous: the API is what clears it, and letting the
      // browser decide would mean two places deciding what anonymity means.
      if (authorName.trim()) submission.author_name = authorName.trim();

      await contributeSighting(submission);
      setDone(true);
    } catch (err) {
      setError(firstErrorMessage(err) ?? t("failed"));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <SubmittedPanel
        title={t("sightingSubmittedTitle")}
        againLabel={t("sightingAgain")}
        onAgain={reset}
        doneLabel={t("backTo", { name: speciesName })}
        doneHref={speciesHref}
      />
    );
  }

  // `type="date"`'s own max, so the picker itself will not offer tomorrow - the
  // API refuses a future encounter, and a control that cannot express the mistake
  // beats an error message about it.
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      {stage === 1 && (
        <StageShell
          title={t("sightingStage1Title")}
          description={t("sightingStage1Description")}
          current={1}
          total={3}
          onNext={() => setStage(2)}
          nextDisabled={
            draft.date === "" || draft.location === "" || photos.length === 0
          }
        >
          <TextInput
            type="date"
            label={t("date")}
            value={draft.date}
            max={today}
            onChange={(value) => set("date", value)}
            helperText={t("dateHelp")}
          />

          {locations.length > 0 ? (
            <Select
              label={t("place")}
              value={draft.location}
              onChange={(value) => set("location", value)}
              options={locations}
            />
          ) : (
            // A site with no places catalogued yet. The flow cannot be completed -
            // the API refuses an entry with neither a place nor coordinates - so it
            // says so rather than disabling Next with no explanation.
            <Typography variant="body" color="var(--error, #ef4444)">
              {t("noPlaces")}
            </Typography>
          )}

          <Box flexDirection="column" gap={8}>
            <Typography variant="label" fontWeight={600}>
              {t("photos")}
            </Typography>
            <PhotoPicker photos={photos} onChange={setPhotos} />
          </Box>
        </StageShell>
      )}

      {stage === 2 && (
        <StageShell
          title={t("sightingStage2Title")}
          description={t("sightingStage2Description")}
          current={2}
          total={3}
          onBack={() => setStage(1)}
          onNext={() => setStage(3)}
        >
          <TextInput
            label={t("sightingName")}
            value={draft.name}
            onChange={(value) => set("name", value)}
            helperText={t("sightingNameHelp", { species: speciesName })}
          />
          <TextInput
            label={t("shortDescription")}
            value={draft.shortDescription}
            onChange={(value) => set("shortDescription", value)}
            helperText={t("shortDescriptionHelp")}
          />
          <TextInput
            multirow
            rows={5}
            label={t("story")}
            value={draft.description}
            onChange={(value) => set("description", value)}
            helperText={t("storyHelp")}
          />

          <TextInput
            type="time"
            label={t("time")}
            value={draft.time}
            onChange={(value) => set("time", value)}
          />

          {weather.length > 0 && (
            <Select
              label={t("weather")}
              value={draft.weather}
              onChange={(value) => set("weather", value)}
              options={weather}
            />
          )}

          <TextInput
            type="number"
            step="0.1"
            label={t("temperature")}
            value={draft.temperature}
            onChange={(value) => set("temperature", value)}
          />
          <TextInput
            type="number"
            min={1}
            step="1"
            label={t("individuals")}
            value={draft.individuals}
            onChange={(value) => set("individuals", value)}
            helperText={t("individualsHelp")}
          />

          {/* The credit line. Its own block rather than another field in the run
              above, because the switch changes what the field *means* - and once
              anonymity is on there is nothing for the field to say. */}
          <Box
            flexDirection="column"
            gap={12}
            padding={14}
            borderRadius={10}
            border="1px solid var(--border, rgba(0,0,0,0.08))"
          >
            <Typography variant="label" fontWeight={700}>
              {t("creditTitle")}
            </Typography>

            {!anonymous && (
              <TextInput
                label={t("authorName")}
                value={authorName}
                onChange={setAuthorName}
                helperText={t("authorNameHelp")}
              />
            )}

            <Box alignItems="center" gap={10}>
              <Switch checked={anonymous} onChange={setAnonymous} />
              <Box flexDirection="column">
                <Typography variant="body">{t("anonymous")}</Typography>
                <Typography
                  variant="caption"
                  color="var(--foreground-muted, #6b7280)"
                >
                  {t("anonymousHelp")}
                </Typography>
              </Box>
            </Box>
          </Box>
        </StageShell>
      )}

      {stage === 3 && (
        <StageShell
          title={t("reviewTitle")}
          description={t("reviewDescription")}
          current={3}
          total={3}
          onBack={() => setStage(2)}
          onNext={submit}
          nextLabel={t("submit")}
          busy={busy}
        >
          <Card
            gap={10}
            padding={16}
            backgroundColor="var(--surface-2, #f3f4f6)"
          >
            <ReviewRow label={t("species")} value={speciesName} />
            <ReviewRow label={t("date")} value={draft.date} />
            <ReviewRow label={t("place")} value={locationLabel} />
            <ReviewRow
              label={t("photos")}
              value={t("photoCountReview", { count: photos.length })}
            />
            <ReviewRow
              label={t("credit")}
              value={anonymous ? t("anonymousValue") : authorName}
              fallback={t("notGiven")}
            />
            <ReviewRow label={t("sightingName")} value={draft.name} />
            <ReviewRow
              label={t("shortDescription")}
              value={draft.shortDescription}
            />
            <ReviewRow label={t("story")} value={draft.description} />
            <ReviewRow label={t("time")} value={draft.time} />
            <ReviewRow label={t("weather")} value={weatherLabel} />
            <ReviewRow label={t("temperature")} value={draft.temperature} />
            <ReviewRow label={t("individuals")} value={draft.individuals} />
          </Card>

          <Typography
            variant="caption"
            color="var(--foreground-muted, #6b7280)"
          >
            {t("pendingNotice")}
          </Typography>
        </StageShell>
      )}

      {error && <Toast message={error} variant="error" />}
    </>
  );
}
