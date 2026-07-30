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
 *   temperature, how many were seen, and whether to be credited. Every field
 *   optional.
 * 3. **Review** - everything as it will be filed, then submit.
 *
 * Three things worth knowing:
 *
 * - **The season is not asked for.** `Sighting.save()` derives it from the date,
 *   which is the right answer for a contributor and one fewer dropdown.
 * - **The credit line is not typed here, and cannot be.** It is the first name on
 *   the account, resolved by the API when the entry is *read* (animals-api's
 *   `SightingSerializer.get_author_name`), so all this flow asks is the yes/no:
 *   `author_anonymous`. `creditName` below is that same first name, passed in for
 *   the review row alone - it is never submitted, and sending it would change
 *   nothing.
 * - **Only the base half of each text pair is written**, as in the species flow.
 */

interface Props {
  speciesId: number;
  speciesName: string;
  speciesHref: string;
  /**
   * The account's first name, for display only - what the API will publish as
   * this entry's credit. Empty for an account that skipped the field at sign-up,
   * which is a real case and reads as no credit at all.
   */
  creditName: string;
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
  creditName,
  locations,
  weather,
}: Props) {
  const t = useTranslations("Contribute");

  const [stage, setStage] = useState(1);
  const [draft, setDraft] = useState(EMPTY);
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  /**
   * Whether the contributor has typed in the title themselves. Until they have,
   * the field is the flow's own suggestion and is re-made from the current draft
   * every time stage 2 is opened - so correcting the date or the place in stage 1
   * corrects the title too. The first keystroke ends that for good, including a
   * keystroke that empties it: a title deliberately cleared must stay cleared.
   */
  const [nameTouched, setNameTouched] = useState(false);

  const set = <K extends keyof typeof EMPTY>(key: K, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const reset = () => {
    setDraft(EMPTY);
    setPhotos([]);
    setAnonymous(false);
    setNameTouched(false);
    setStage(1);
    setDone(false);
    setError(null);
  };

  const locationLabel =
    locations.find((option) => option.value === draft.location)?.label ?? null;
  const weatherLabel =
    weather.find((option) => option.value === draft.weather)?.label ?? null;

  /**
   * The title stage 2 opens with: `2026-07-30 14:32 · Deer · Lake Estes (Lake) - Larimer`.
   *
   * Left blank, the API titles an entry after its species alone, so a contributor
   * who files three encounters with the same animal ends up with three rows named
   * "Deer" - unreadable in the CMS list a reviewer works from and in every
   * "more of the same species" strip on the public site. The **clock time** is
   * what actually separates them: two entries can genuinely share a date, a
   * species and a pond.
   *
   * It is the wall clock at the moment stage 2 is opened, not `draft.time` - that
   * field is optional, is asked for *after* this is generated, and is the time of
   * the encounter rather than a unique stamp.
   *
   * The place is the **picker's own label** (`placeLabel` in the page: name, kind
   * of place, county), not a second flattening of the same three fields - one
   * rule, one place it is written, and the title then reads exactly as the option
   * the contributor chose.
   */
  const suggestedName = () => {
    const now = new Date();
    const clock = `${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes(),
    ).padStart(2, "0")}`;

    // `filter(Boolean)` rather than a branch per part: stage 1 makes the date and
    // the place mandatory, but this is also reachable from a draft restored with
    // neither, and a title with a dangling separator is worse than a shorter one.
    return [`${draft.date} ${clock}`.trim(), speciesName, locationLabel]
      .filter(Boolean)
      .join(" · ");
  };

  const openStage2 = () => {
    if (!nameTouched) set("name", suggestedName());
    setStage(2);
  };

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
          onNext={openStage2}
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
            // A `TextInput` with `options` rather than a `Select`: the place list
            // is the whole catalog of places, which is the one field here that is
            // long enough to scroll past what you are looking for. Typing filters
            // it (name, kind of place or county - see `placeLabel` in the page),
            // and the value it emits is still the location id a `Select` would
            // have emitted.
            <TextInput
              label={t("place")}
              value={draft.location}
              onChange={(value) => set("location", value)}
              options={locations}
              noOptionsLabel={t("noPlaceMatches")}
              helperText={t("placeHelp")}
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
            onChange={(value) => {
              setNameTouched(true);
              set("name", value);
            }}
            helperText={t("sightingNameHelp")}
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

          {/* The two numbers share a row at every width, phone included. They are
              the shortest controls in the flow - a temperature and a count are a
              few characters each - so a full-width field for either reads as a
              question far bigger than it is, and the pair is read as one
              "how many, how warm" line. `flex="1 1 0"` with `minWidth={0}` rather
              than a `Grid`: equal halves that may shrink below their content
              instead of pushing the row wider than the card on a narrow phone. */}
          <Box gap={12} alignItems="flex-start">
            <TextInput
              type="number"
              step="0.1"
              label={t("temperature")}
              value={draft.temperature}
              onChange={(value) => set("temperature", value)}
              flex="1 1 0"
              minWidth={0}
            />
            <TextInput
              type="number"
              min={1}
              step="1"
              label={t("individuals")}
              value={draft.individuals}
              onChange={(value) => set("individuals", value)}
              helperText={t("individualsHelp")}
              flex="1 1 0"
              minWidth={0}
            />
          </Box>

          {/* The credit line - one more control in this stage's run, not a card
              of its own: it is the last thing asked before the review, and a
              boxed panel inside the stage's own card read as a second form. It
              keeps its heading because it is still not a field - the name comes
              from the account, so all there is to decide is whether to be named
              at all - and the line under that heading is what makes the switch
              legible, which would otherwise be asking about a name the
              contributor never sees. */}
          <Box flexDirection="column" gap={12}>
            <Typography variant="label" fontWeight={700}>
              {t("creditTitle")}
            </Typography>

            {!anonymous && (
              <Typography
                variant="caption"
                color="var(--foreground-muted, #6b7280)"
              >
                {/* An account that skipped the optional first name at sign-up
                    gets no credit line at all, so it is told that rather than
                    shown an empty one. */}
                {creditName
                  ? t("creditFromAccount", { name: creditName })
                  : t("creditNoAccountName")}
              </Typography>
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
              value={anonymous ? t("anonymousValue") : creditName}
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
