"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import { Select, type SelectOption } from "@repo/ui/core-elements/select";
import { Switch } from "@repo/ui/core-elements/switch";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Typography } from "@repo/ui/core-elements/typography";
import { Toast } from "@repo/ui/core-elements/toast";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import {
  LocationContributeForm,
  type ParentPlaceOption,
} from "@/components/contribute/location-contribute-form";
import {
  PhotoPicker,
  type PickedPhoto,
} from "@/components/contribute/photo-picker";
import { ReviewRow } from "@/components/contribute/review-row";
import { StageShell } from "@/components/contribute/stage-shell";
import { SubmittedPanel } from "@/components/contribute/submitted-panel";
import {
  VideoPicker,
  type PickedVideo,
} from "@/components/contribute/video-picker";
import {
  contributeSighting,
  firstErrorMessage,
  reserveSightingVideo,
  type SightingSubmission,
} from "@/lib/contribute";
import { placeLabel } from "@/lib/place-types";
import { uploadVideo, VideoUploadError } from "@/lib/video-upload";
import {
  SpeciesPicker,
  type SpeciesChoice,
  type SpeciesSubject,
} from "./species-picker";

/**
 * The three-stage journal entry.
 *
 * 1. **What, when, where, and the photographs.** The species is usually already
 *   decided (the FAB was pressed on its page) and then this stage opens on the
 *   date; entered from a *category* page, or from nothing at all, it opens on the
 *   `SpeciesPicker` cascade instead. The rest is what the API refuses an entry
 *   without: a date, a place or a pin, and at least one photo.
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
  /**
   * The species the URL already named, or `null` when the flow has to ask for it.
   * When it is set the picker is not rendered at all and the species cannot be
   * changed - the reader chose it by pressing the FAB on its own page.
   */
  species: SpeciesSubject | null;
  /**
   * Every species that can be filed against, for the picker. Empty (and unused)
   * whenever `species` is set.
   */
  speciesOptions: SpeciesChoice[];
  /** The branch and category the FAB's page was under, to open the picker on. */
  initialKind?: SpeciesChoice["kind"] | null;
  initialCategorySlug?: string | null;
  /**
   * The account's first name, for display only - what the API will publish as
   * this entry's credit. Empty for an account that skipped the field at sign-up,
   * which is a real case and reads as no credit at all.
   */
  creditName: string;
  locations: SelectOption[];
  weather: SelectOption[];
  /**
   * Every county, for the place form this flow can open under its place field.
   * Passed down rather than fetched here for the reason the two lists above are:
   * the labels are bilingual and have to be resolved on the server.
   *
   * ⚠ **A promise, unlike its siblings, and it must stay one.** It is the
   * heaviest list the flow can need and the one almost nobody opens, so the page
   * starts the read without awaiting it and this component does nothing but
   * forward it - only `LocationContributeForm` unwraps it, and only once the
   * panel is on screen. Awaiting it here would put every contributor back behind
   * a request made for a control they never pressed. See the page's docstring.
   */
  counties: Promise<SelectOption[]>;
  /**
   * The same catalogued places as `locations`, but carrying their coordinates -
   * the place form opens its map over the parent a contributor picks. A second
   * projection of one fetch, not a second request.
   */
  parentPlaces: ParentPlaceOption[];
  /**
   * The clip duration cap, resolved from `MAX_CONTRIBUTION_VIDEO_SECONDS` by the
   * page. It is passed down rather than imported because this is a client
   * component and the value must stay readable at run time - see
   * `DEFAULT_MAX_VIDEO_SECONDS` in `lib/contribute.ts`.
   */
  maxVideoSeconds: number;
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
  species,
  speciesOptions,
  initialKind,
  initialCategorySlug,
  creditName,
  locations,
  weather,
  counties,
  parentPlaces,
  maxVideoSeconds,
}: Props) {
  const t = useTranslations("Contribute");
  const tPlaceTypes = useTranslations("PlaceTypes");
  const locale = useLocale();

  /**
   * The entry's subject. Seeded from the URL when it named one, and then never
   * changed (the picker is not rendered); otherwise the picker writes it.
   */
  const [chosen, setChosen] = useState<SpeciesSubject | null>(species);
  const speciesName = chosen?.name ?? "";
  // Where "Back to …" goes once the entry is filed. The species page exists for
  // every choice the picker can make, so this is safe to derive rather than pass.
  const speciesHref = chosen ? `/species/${chosen.slug}` : "/";

  const [stage, setStage] = useState(1);
  const [draft, setDraft] = useState(EMPTY);
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [video, setVideo] = useState<PickedVideo | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  /**
   * Set when the entry was filed but its clip did not make it. Rendered on the
   * confirmation rather than as an error, because the submission *did* succeed -
   * see the catch in `submit`.
   */
  const [videoFailed, setVideoFailed] = useState<string | null>(null);
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
  /** Whether the "add a place" panel under the place field is open. */
  const [addingPlace, setAddingPlace] = useState(false);
  /**
   * Places created from inside this form, newest first, as picker options.
   *
   * They are held here rather than merged into `locations` by a re-fetch for two
   * reasons. A refresh would throw the draft away - that is the whole argument
   * for the panel being inline instead of a link to `/contribute/locations` - and
   * a pending place is **absent from the public list** that prop was built from,
   * so a re-fetch would not return it anyway. It is fileable against all the
   * same: `SightingContributeSerializer` gates on the species being enabled and
   * deliberately not on the location, so both rows land pending and a reviewer
   * publishes the pair.
   */
  const [addedPlaces, setAddedPlaces] = useState<SelectOption[]>([]);

  const set = <K extends keyof typeof EMPTY>(key: K, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const reset = () => {
    // Back to what the URL said, which is `null` when it said nothing - "file
    // another" from a category page means another species just as often as
    // another encounter with the same one.
    setChosen(species);
    setDraft(EMPTY);
    setPhotos([]);
    setVideo(null);
    setVideoFailed(null);
    setVideoProgress(0);
    setAnonymous(false);
    setNameTouched(false);
    setStage(1);
    setDone(false);
    setError(null);
  };

  /**
   * What the place field offers: the catalogue, led by anything added from here.
   *
   * The additions lead rather than sort in because the one a contributor just
   * created is the one they are about to pick - and it is not in the catalogue's
   * own alphabet at all until an administrator publishes it.
   */
  const placeOptions = [...addedPlaces, ...locations];

  const locationLabel =
    placeOptions.find((option) => option.value === draft.location)?.label ?? null;
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
    // Stage 1 cannot be left without one, so this is a type narrowing rather
    // than a reachable branch.
    if (!chosen) return;

    setBusy(true);
    setError(null);
    try {
      const submission: SightingSubmission = {
        species: chosen.id,
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

      const created = await contributeSighting(submission);

      // The clip is a **second** request, and it runs after the entry exists -
      // it is far too large to have ridden in the body above. See
      // `reserveSightingVideo`.
      if (video) {
        try {
          setUploadingVideo(true);
          const reservation = await reserveSightingVideo(created.id, {
            filename: video.file.name,
            size_bytes: video.file.size,
            duration_seconds: video.durationSeconds,
          });
          await uploadVideo({
            file: video.file,
            ticket: reservation.upload_ticket,
            maxDurationSeconds: maxVideoSeconds,
            onProgress: setVideoProgress,
          });
        } catch (videoError) {
          // ⚠ The entry is already filed, so this is **not** a failed
          // submission. Losing the outing because its video failed would be the
          // wrong way round - the encounter is the thing worth keeping - so the
          // flow reports success and says the clip did not make it.
          const code =
            videoError instanceof VideoUploadError ? videoError.code : null;
          setVideoFailed(code === "busy" ? t("videoBusy") : t("videoFailed"));
        } finally {
          setUploadingVideo(false);
        }
      }

      setDone(true);
    } catch (err) {
      setError(firstErrorMessage(err) ?? t("failed"));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <>
        <SubmittedPanel
          title={t("sightingSubmittedTitle")}
          againLabel={t("sightingAgain")}
          onAgain={reset}
          doneLabel={t("backTo", { name: speciesName })}
          doneHref={speciesHref}
        />
        {/* The entry was filed; only its clip failed. Said here rather than as
            an error toast, because the submission succeeded and the contributor
            should not be left thinking the outing was lost. */}
        {videoFailed && (
          <Toast message={videoFailed} variant="error" duration={0} />
        )}
      </>
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
          // The stage asks one more question when the species is still open, so
          // it says so - "When and where" over a species picker would be
          // describing a different stage than the one on screen.
          title={
            species ? t("sightingStage1Title") : t("sightingStage1TitleAny")
          }
          description={
            species
              ? t("sightingStage1Description")
              : t("sightingStage1DescriptionAny")
          }
          current={1}
          total={3}
          onNext={openStage2}
          nextDisabled={
            chosen === null ||
            draft.date === "" ||
            draft.location === "" ||
            photos.length === 0
          }
        >
          {/* Only when the URL did not already name one. It leads the stage
              because everything under it is a detail *of* the encounter, and
              because it is the one field here that changes what the entry is. */}
          {!species && (
            <SpeciesPicker
              options={speciesOptions}
              initialKind={initialKind}
              initialCategorySlug={initialCategorySlug}
              value={chosen ? String(chosen.id) : ""}
              onChange={setChosen}
            />
          )}

          <TextInput
            type="date"
            label={t("date")}
            value={draft.date}
            max={today}
            onChange={(value) => set("date", value)}
            helperText={t("dateHelp")}
          />

          {/* The place, and the way out of not finding it.

              ⚠ The add button is what makes `noPlaces` below survivable, and it
              is why that branch is no longer a dead end: a site with nothing
              catalogued yet - or, far more often, an outing to a pond nobody has
              filed - used to stop the flow here with a sentence and no action.
              So the row is rendered in **both** branches, and only the field
              beside it changes.

              The panel it opens is inline rather than a link to
              `/contribute/locations`, and that is the whole point of it. A
              navigation would throw this draft away: the stages share one piece
              of state and there is nowhere else it lives, which is the same
              argument that makes each flow one component rather than a route per
              stage. The route still exists, renders the same form, and is the
              standalone way in. */}
          <Box gap={8} alignItems="flex-start">
            {placeOptions.length > 0 ? (
              // A `TextInput` with `options` rather than a `Select`: the place
              // list is the whole catalog of places, which is the one field here
              // that is long enough to scroll past what you are looking for.
              // Typing filters it (name, kind of place or county - see
              // `placeLabel` in `lib/place-types.ts`), and the value it emits is
              // still the location id a `Select` would have emitted.
              <TextInput
                label={t("place")}
                value={draft.location}
                onChange={(value) => set("location", value)}
                options={placeOptions}
                noOptionsLabel={t("noPlaceMatches")}
                helperText={t("placeHelp")}
                // `flex="1 1 0"` with `minWidth={0}`, as the temperature/count
                // pair in stage 2 does: the field takes the rest of the row and
                // may shrink below its content rather than pushing the button
                // off a narrow phone.
                flex="1 1 0"
                minWidth={0}
              />
            ) : (
              // A site with no places catalogued yet. It is no longer the end of
              // the flow - the button beside this is - but it still says so,
              // rather than leaving an empty picker to explain itself.
              <Typography
                variant="body"
                color="var(--error, #ef4444)"
                flex="1 1 0"
                minWidth={0}
              >
                {t("noPlaces")}
              </Typography>
            )}

            {/* Top-aligned, not `flex-end` as the CMS's input+button rows are:
                this field carries helper text beneath it, so aligning to the
                row's bottom would drop the button a line below the input it
                belongs to. The nudge centres the 44 px button against the input
                box itself (~52 px: 20 + 6 padding around a 24 px line). */}
            <IconButton
              icon="/icons/add.svg"
              kind="primary"
              size="lg"
              aria-label={t("addPlace")}
              title={t("addPlace")}
              aria-expanded={addingPlace}
              // Only while the panel is mounted: `aria-controls` pointing at an
              // id that is not in the document is an ARIA error, and the panel
              // is unmounted rather than hidden (closing it is how its own draft
              // is discarded).
              aria-controls={addingPlace ? "contribute-add-place" : undefined}
              onClick={() => setAddingPlace((open) => !open)}
              marginTop={4}
            />
          </Box>

          {addingPlace && (
            <Box id="contribute-add-place" flexDirection="column">
              <LocationContributeForm
                parents={parentPlaces}
                counties={counties}
                onCancel={() => setAddingPlace(false)}
                onCreated={(place) => {
                  // Label it exactly as the page labelled every other option -
                  // one helper, so the place someone just added cannot read
                  // differently from the rest of the list it joins.
                  const option = {
                    value: String(place.id),
                    label: placeLabel(place, locale, tPlaceTypes),
                  };
                  setAddedPlaces((current) => [option, ...current]);
                  // Selected, not merely offered: it is the place this entry is
                  // being filed at, and asking the contributor to go and find it
                  // again would be asking them to re-answer the question they
                  // just opened this panel to answer.
                  set("location", option.value);
                  setAddingPlace(false);
                }}
              />
            </Box>
          )}

          <Box flexDirection="column" gap={8}>
            <Typography variant="label" fontWeight={600}>
              {t("photos")}
            </Typography>
            <PhotoPicker photos={photos} onChange={setPhotos} />
          </Box>

          {/* Optional, and under the photographs on purpose: at least one photo
              is required to file at all, so the clip reads as the extra it is
              rather than as a second mandatory upload. */}
          <Box flexDirection="column" gap={8}>
            <Typography variant="label" fontWeight={600}>
              {t("video")}
            </Typography>
            <VideoPicker
              video={video}
              onChange={setVideo}
              maxSeconds={maxVideoSeconds}
            />
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
              label={t("video")}
              value={video ? video.file.name : null}
              fallback={t("noVideo")}
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

          {/* The clip goes up after the entry is filed, and on a phone that is
              minutes - so the submit button's own spinner is not enough to
              explain why nothing has happened yet.

              The heading is written out rather than left to the bar's `label`,
              which is only an `aria-label`: without it a sighted contributor
              gets an unexplained bar. The line under it is not politeness -
              `uploadVideo` chunks from this tab, so a refresh aborts the upload
              and the entry keeps no video.

              ⚠ Indeterminate until the first chunk reports. `onProgress` fires
              per 90 MB chunk (`CHUNK_BYTES`), so a clip under that is a single
              chunk and a determinate bar would read a frozen 0% for the whole
              upload - which looks like a hang - then jump to 100. */}
          {uploadingVideo && (
            <Box flexDirection="column" gap={6}>
              <Typography variant="label" fontWeight={600}>
                {videoProgress > 0
                  ? t("videoUploading", { percent: videoProgress })
                  : t("videoUploadingStart")}
              </Typography>
              <ProgressBar
                value={videoProgress > 0 ? videoProgress : undefined}
                label={
                  videoProgress > 0
                    ? t("videoUploading", { percent: videoProgress })
                    : t("videoUploadingStart")
                }
              />
              <Typography
                variant="caption"
                color="var(--foreground-muted, #6b7280)"
              >
                {t("videoUploadingNotice")}
              </Typography>
            </Box>
          )}

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
