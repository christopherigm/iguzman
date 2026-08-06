"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
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
import { EditNotice } from "@/components/contribute/edit-notice";
import {
  contributeSpecies,
  firstErrorMessage,
  type SpeciesSubmission,
} from "@/lib/contribute";
import {
  photoPatch,
  updateContribution,
  type ContributionEdit,
} from "@/lib/contributions";

/**
 * The three-stage species proposal - **and the form that edits one back**.
 *
 * 1. **What is it, and what does it look like** - the name and the photographs.
 *    The two things a species record cannot do without, and the only stage with
 *    required fields.
 * 2. **What else is known** - the binomial, the family, the writing. Every field
 *    optional: a contributor who recognises a coyote but not *Canis latrans* must
 *    not be stopped here, and a reviewer can fill the taxonomy in from the
 *    photographs.
 * 3. **Review** - everything as it will be filed, then submit.
 *
 * Three things about how it is built:
 *
 * - **One component, not a route per stage.** The stages share a draft and a stage
 *   boundary is not a navigation: a reader who reaches stage 3 and steps back must
 *   find stage 1 as they left it, which routes would only give by putting the draft
 *   somewhere it can be lost.
 * - **Only the base half of each text pair is written** (`name`, never `en_name`).
 *   A contributor writes in one language, and `localized()` falls back to the base
 *   column for every locale whose `en_` twin is blank - so the entry reads correctly
 *   in all five without asking a reader to translate themselves. Filling the twin is
 *   an authoring job, and the CMS has a translate button for it.
 * - **`edit` turns the same three stages into an edit form** rather than there
 *   being a second one. A contributor correcting a proposal should meet the form
 *   they filled in; what changes is where the last stage sends it, what its
 *   button says, and the notice above it. See `ContributionEdit`.
 */

type Draft = {
  name: string;
  scientificName: string;
  family: string;
  shortDescription: string;
  description: string;
};

interface Props {
  categoryId: number;
  categoryName: string;
  categoryHref: string;
  /** Set to edit an existing proposal instead of filing a new one. */
  edit?: ContributionEdit;
  /** The record's current values, when editing. Ignored otherwise. */
  initialDraft?: Partial<Draft>;
  /**
   * The record's stored gallery as picker tiles, when editing (see
   * `galleryAsPhotos`). Each carries its row `id`, so an edit that only
   * re-orders re-uploads nothing.
   */
  initialPhotos?: PickedPhoto[];
}

const EMPTY: Draft = {
  name: "",
  scientificName: "",
  family: "",
  shortDescription: "",
  description: "",
};

export function SpeciesContributeForm({
  categoryId,
  categoryName,
  categoryHref,
  edit,
  initialDraft,
  initialPhotos,
}: Props) {
  const t = useTranslations("Contribute");
  const tContributions = useTranslations("Contributions");

  const [stage, setStage] = useState(1);
  const [draft, setDraft] = useState<Draft>({ ...EMPTY, ...initialDraft });
  const [photos, setPhotos] = useState<PickedPhoto[]>(initialPhotos ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const reset = () => {
    setDraft(EMPTY);
    setPhotos([]);
    setStage(1);
    setDone(false);
    setError(null);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (edit) {
        // ⚠ Every field is sent, including the ones the contributor cleared -
        // the opposite of the filing path below, and deliberately. On a create,
        // an omitted field and a blank one are both "not known"; on an edit,
        // omitting a field means *leave it as it was*, so a family the
        // contributor deleted would silently come back. The API takes a blank
        // string as a real clear.
        const saved = await updateContribution("species", edit.id, {
          category: categoryId,
          name: draft.name.trim(),
          scientific_name: draft.scientificName.trim(),
          family: draft.family.trim(),
          short_description: draft.shortDescription.trim(),
          description: draft.description.trim(),
          photos: photoPatch(photos),
        });
        edit.onSaved(saved.contribution_status);
        return;
      }

      const submission: SpeciesSubmission = {
        category: categoryId,
        name: draft.name.trim(),
        photos: photos.map((photo) => photo.dataUrl),
      };
      // Only what was actually filled in. A blank string is a *written* value to
      // the API, so sending every field would file empty strings as content and a
      // reviewer could not tell "not known" from "answered blank".
      if (draft.scientificName.trim())
        submission.scientific_name = draft.scientificName.trim();
      if (draft.family.trim()) submission.family = draft.family.trim();
      if (draft.shortDescription.trim())
        submission.short_description = draft.shortDescription.trim();
      if (draft.description.trim())
        submission.description = draft.description.trim();

      await contributeSpecies(submission);
      setDone(true);
    } catch (err) {
      // The API's own sentence when it sent one - it is the only thing that knows
      // *why* (a duplicate, a photo it could not decode) - and a generic line
      // otherwise. Either way the draft stays on screen: this flow has no other
      // copy of it.
      setError(firstErrorMessage(err) ?? t("failed"));
    } finally {
      setBusy(false);
    }
  };

  // Only the filing path has an "after": an edit hands control back to the page
  // through `onSaved`, which is what shows the result and where to go next.
  if (done && !edit) {
    return (
      <SubmittedPanel
        title={t("speciesSubmittedTitle")}
        againLabel={t("speciesAgain")}
        onAgain={reset}
        doneLabel={t("backTo", { name: categoryName })}
        doneHref={categoryHref}
      />
    );
  }

  return (
    <>
      {stage === 1 && (
        <StageShell
          title={t("speciesStage1Title")}
          description={t("speciesStage1Description")}
          current={1}
          total={3}
          onNext={() => setStage(2)}
          // Exactly what the API refuses, so a reader is stopped here rather than
          // rejected at stage 3 after filling in everything else.
          nextDisabled={draft.name.trim() === "" || photos.length === 0}
        >
          <TextInput
            label={t("speciesName")}
            value={draft.name}
            onChange={(value) => set("name", value)}
            helperText={t("speciesNameHelp")}
          />

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
          title={t("speciesStage2Title")}
          description={t("speciesStage2Description")}
          current={2}
          total={3}
          onBack={() => setStage(1)}
          onNext={() => setStage(3)}
        >
          <TextInput
            label={t("scientificName")}
            value={draft.scientificName}
            onChange={(value) => set("scientificName", value)}
            helperText={t("scientificNameHelp")}
          />
          <TextInput
            label={t("family")}
            value={draft.family}
            onChange={(value) => set("family", value)}
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
            label={t("description")}
            value={draft.description}
            onChange={(value) => set("description", value)}
            helperText={t("descriptionHelp")}
          />
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
          nextLabel={edit ? tContributions("saveChanges") : t("submit")}
          busy={busy}
        >
          <Card
            gap={10}
            padding={16}
            backgroundColor="var(--surface-2, #f3f4f6)"
          >
            <ReviewRow label={t("speciesName")} value={draft.name} />
            <ReviewRow label={t("category")} value={categoryName} />
            <ReviewRow
              label={t("photos")}
              value={t("photoCountReview", { count: photos.length })}
            />
            <ReviewRow
              label={t("scientificName")}
              value={draft.scientificName}
              fallback={t("notGiven")}
            />
            <ReviewRow label={t("family")} value={draft.family} />
            <ReviewRow
              label={t("shortDescription")}
              value={draft.shortDescription}
            />
            <ReviewRow label={t("description")} value={draft.description} />
          </Card>

          {edit ? (
            <EditNotice status={edit.status} />
          ) : (
            <Typography
              variant="caption"
              color="var(--foreground-muted, #6b7280)"
            >
              {t("pendingNotice")}
            </Typography>
          )}
        </StageShell>
      )}

      {/* A submission failure is transient chrome over a form that is still
          standing, which is what `Toast` is - not an inline field error, because
          the API's complaint may belong to a stage the reader is no longer on. */}
      {error && <Toast message={error} variant="error" />}
    </>
  );
}
