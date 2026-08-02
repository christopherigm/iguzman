"use client";

import { Suspense, use, useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Card } from "@repo/ui/core-elements/card";
import { Select, type SelectOption } from "@repo/ui/core-elements/select";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Typography } from "@repo/ui/core-elements/typography";
import { Toast } from "@repo/ui/core-elements/toast";
import { MapPicker } from "@/components/admin/map-picker";
import {
  PhotoPicker,
  type PickedPhoto,
} from "@/components/contribute/photo-picker";
import {
  contributeLocation,
  firstErrorMessage,
  type ContributedLocation,
  type LocationSubmission,
} from "@/lib/contribute";
import { PLACE_TYPES } from "@/lib/place-types";

/**
 * "Add a place" - the public counterpart to the CMS's location form.
 *
 * **One stage, not three.** The other two flows stage because their forms are
 * long and their first stage has required fields buried among optional ones; this
 * one is a name and a pin. It also has to be fillable from *inside* another form
 * - the sighting flow embeds it under its place field - and a wizard nested in a
 * wizard would leave a contributor two "Continue" buttons deep with no idea which
 * one files anything.
 *
 * **A place is the third thing the public flow can create, and the only one that
 * exists to unblock another.** A contributor standing at a pond nobody has
 * catalogued cannot file the encounter at all until the pond exists - so this is
 * reachable both from its own route and from the sighting form's place field, and
 * the place it creates is selectable there **immediately**, while still pending.
 * See `contributeLocation` on why that is safe.
 *
 * What it asks for, against the CMS's seventeen fields:
 *
 * | Field         | Why                                                        |
 * | ------------- | ---------------------------------------------------------- |
 * | name          | required - the only thing that cannot be derived           |
 * | the map pin   | required - a place with no pin is unmappable               |
 * | kind of place | one `Select`, and it is how the place reads in the picker  |
 * | county        | optional; it is what tells two "El Salto"s apart           |
 * | parent place  | optional; a trail inside its park                          |
 * | photographs   | optional, unlike a species proposal                        |
 *
 * ⚠ **The pin is the *whole* coordinate control - there are no latitude and
 * longitude fields.** The CMS keeps them because an author transcribing a record
 * has a pair to type; a contributor has a map and a place they were standing in,
 * and two decimal fields in front of them are a way to file a sighting into the
 * Gulf of Guinea. `MapPicker` writes both at once, which is why it is lifted out
 * of the CMS and used here rather than copied. Its own chrome translates through
 * the `Admin` namespace (the strings are generic map furniture - zoom, search,
 * "you are here"), and every message namespace is on the client provider, so that
 * works on a public page.
 *
 * ⚠ **Everything an administrator owns is absent**, and not merely hidden:
 * `enabled`, `is_featured`, `sort_order`, the `icon` glyph, the slug, and
 * `hide_precise_location` - which is the one that is not editorial at all, since
 * it blurs this place's coordinates *and every sighting later filed at it*, for
 * every caller. animals-api's `LocationContributeSerializer` is what enforces
 * that; this form simply does not ask.
 */

/** A place that can be this one's parent, with enough to open the map over it. */
export interface ParentPlaceOption extends SelectOption {
  latitude: number | null;
  longitude: number | null;
}

interface Props {
  /** Every catalogued place, as candidate parents. */
  parents: ParentPlaceOption[];
  /**
   * Every county, each option already naming its state - as a **promise**, which
   * both hosts hand over without awaiting.
   *
   * ⚠ This is the app's most expensive list (244 rows from `seed_geography`
   * alone, answered with the full location-grade payload) and it feeds **one
   * optional field**. Awaiting it on the page put that cost in front of every
   * contributor filing a sighting, most of whom never open this form at all.
   *
   * It is unwrapped by `CountyField` below - a component whose entire job is to
   * `use()` it, so the suspension is scoped to the field rather than to this
   * form. The rest of the form paints immediately and the county picker appears
   * when the read lands, which is the right shape for an optional field: nothing
   * a contributor has to fill in is ever behind a spinner.
   *
   * The labels are still built on the **server** by whichever page owns the
   * fetch, because they are bilingual and need the request locale.
   */
  counties: Promise<SelectOption[]>;
  /**
   * Called with the place the API created. **When it is given, this component
   * renders no confirmation** - the host owns what happens next (the sighting
   * form selects the new place and closes the panel), and a "submitted" card
   * under a form the contributor is still filling in would read as the wrong
   * thing having been filed.
   */
  onCreated?: (place: ContributedLocation) => void;
  /** A way out, rendered only when given - the embedded case. */
  onCancel?: () => void;
}

const EMPTY = {
  name: "",
  placeType: "other",
  parent: "",
  county: "",
  latitude: "",
  longitude: "",
};

/**
 * The county picker, and the only thing in this file that reads the counties
 * promise - which is the whole point of it being its own component.
 *
 * `use()` suspends whatever component calls it, so calling it in the form would
 * hold the *entire* form behind the app's slowest read for the sake of one
 * optional field. Here the suspension reaches no further than this field, and
 * the `Suspense` wrapping it below falls back to nothing at all: an optional
 * field that has not arrived yet should be absent, not a spinner standing where
 * a contributor is trying to type.
 *
 * A `TextInput` with `options` rather than a `Select`: the geography seed carries
 * hundreds of counties, which is well past what a dropdown can be scrolled
 * through. Each option names its state - it is what tells the Durango in Mexico
 * from the one in Colorado.
 */
function CountyField({
  counties: countiesPromise,
  value,
  onChange,
}: {
  counties: Promise<SelectOption[]>;
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("Contribute");
  const counties = use(countiesPromise);

  if (counties.length === 0) return null;

  return (
    <TextInput
      label={t("placeCounty")}
      value={value}
      onChange={onChange}
      options={counties}
      noOptionsLabel={t("noCountyMatches")}
      helperText={t("placeCountyHelp")}
    />
  );
}

export function LocationContributeForm({
  parents,
  counties,
  onCreated,
  onCancel,
}: Props) {
  const t = useTranslations("Contribute");
  const tPlaceTypes = useTranslations("PlaceTypes");

  const [draft, setDraft] = useState(EMPTY);
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof EMPTY>(key: K, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const reset = () => {
    setDraft(EMPTY);
    setPhotos([]);
    setError(null);
  };

  // Where the map opens before a pin has been dropped: over the parent place, so
  // a trail starts inside its park rather than over the middle of the country.
  // The same borrowing the CMS's location form does.
  const parentPlace = parents.find((place) => place.value === draft.parent);
  const fallbackCenter =
    parentPlace && parentPlace.latitude !== null && parentPlace.longitude !== null
      ? { latitude: parentPlace.latitude, longitude: parentPlace.longitude }
      : null;

  const pinned = draft.latitude !== "" && draft.longitude !== "";

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const submission: LocationSubmission = {
        name: draft.name.trim(),
        // Both are guarded by `pinned` on the button, so this is a narrowing
        // rather than a reachable coercion of "".
        latitude: Number(draft.latitude),
        longitude: Number(draft.longitude),
      };
      // Only what was filled in - an empty string is a *written* value to the
      // API, and a relation cannot take one at all.
      if (draft.placeType) submission.place_type = draft.placeType;
      if (draft.parent) submission.parent = Number(draft.parent);
      if (draft.county) submission.county = Number(draft.county);
      if (photos.length > 0)
        submission.photos = photos.map((photo) => photo.dataUrl);

      const created = await contributeLocation(submission);
      reset();
      onCreated?.(created);
    } catch (err) {
      // The API's own sentence when it sent one, a generic line otherwise -
      // either way the draft stays on screen, since there is no other copy of it.
      setError(firstErrorMessage(err) ?? t("failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card gap={16} padding={20}>
      <Box flexDirection="column" gap={6}>
        <Typography as="h2" variant="h3" fontWeight={700}>
          {t("placeFormTitle")}
        </Typography>
        <Typography variant="body" color="var(--foreground-muted, #6b7280)">
          {t("placeFormDescription")}
        </Typography>
      </Box>

      <TextInput
        label={t("placeName")}
        value={draft.name}
        onChange={(value) => set("name", value)}
        helperText={t("placeNameHelp")}
      />

      {/* Fourteen conditions is where a phone's native picker beats a dropdown
          of ours - the same call the sighting form's weather field makes. */}
      <Select
        label={t("placeType")}
        value={draft.placeType}
        onChange={(value) => set("placeType", value)}
        options={PLACE_TYPES.map((value) => ({
          value,
          label: tPlaceTypes(value),
        }))}
      />

      {/* The pin, and the only coordinate control there is. Its heading is
          written out because `MapPicker` carries none of its own - in the CMS it
          sits under an "Latitude"/"Longitude" pair that named it. */}
      <Box flexDirection="column" gap={8}>
        <Typography variant="label" fontWeight={600}>
          {t("placePin")}
        </Typography>
        <Typography variant="caption" color="var(--foreground-muted, #6b7280)">
          {t("placePinHelp")}
        </Typography>
        <MapPicker
          latitude={draft.latitude}
          longitude={draft.longitude}
          onChange={(latitude, longitude) =>
            setDraft((current) => ({ ...current, latitude, longitude }))
          }
          fallbackCenter={fallbackCenter}
          // Shorter than the CMS's 340: this form is often opened *inside*
          // another one, where a full-height map pushes the sighting's own
          // fields off a phone screen entirely.
          height={280}
        />
      </Box>

      {/* Falls back to nothing: the field is optional, and a placeholder box
          where one is not yet available would only make the form jump. */}
      <Suspense fallback={null}>
        <CountyField
          counties={counties}
          value={draft.county}
          onChange={(value) => set("county", value)}
        />
      </Suspense>

      {parents.length > 0 && (
        <TextInput
          label={t("placeParent")}
          value={draft.parent}
          onChange={(value) => set("parent", value)}
          options={parents}
          noOptionsLabel={t("noPlaceMatches")}
          helperText={t("placeParentHelp")}
        />
      )}

      <Box flexDirection="column" gap={8}>
        <Typography variant="label" fontWeight={600}>
          {t("photos")}
        </Typography>
        <Typography variant="caption" color="var(--foreground-muted, #6b7280)">
          {t("placePhotosHelp")}
        </Typography>
        <PhotoPicker photos={photos} onChange={setPhotos} />
      </Box>

      <Typography variant="caption" color="var(--foreground-muted, #6b7280)">
        {t("placePendingNotice")}
      </Typography>

      <Box
        justifyContent={onCancel ? "space-between" : "flex-end"}
        alignItems="center"
        gap={10}
        flexWrap="wrap"
      >
        {onCancel && (
          <Button
            text={t("cancel")}
            size="lg"
            disabled={busy}
            onClick={onCancel}
          />
        )}
        <Button
          text={t("placeSubmit")}
          kind="primary"
          size="lg"
          // Exactly what the API refuses, so a contributor is stopped here
          // rather than after the request - and `pinned` is the reason the
          // submit handler can read the two coordinates as numbers.
          disabled={busy || draft.name.trim() === "" || !pinned}
          isLoading={busy}
          onClick={submit}
        />
      </Box>

      {/* Transient chrome over a form that is still standing - not an inline
          field error, because the API's complaint may name a field this form
          never showed. */}
      {error && <Toast message={error} variant="error" />}
    </Card>
  );
}
