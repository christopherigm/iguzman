"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Card } from "@repo/ui/core-elements/card";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { Spinner } from "@repo/ui/core-elements/spinner";
import { Toast } from "@repo/ui/core-elements/toast";
import { Typography } from "@repo/ui/core-elements/typography";
import type { SelectOption } from "@repo/ui/core-elements/select";
import { Link, useRouter } from "@repo/i18n/navigation";
import { ContributionStatusBadge } from "@/components/contribute/contribution-status-badge";
import type { ParentPlaceOption } from "@/components/contribute/location-contribute-form";
import { LocationContributeForm } from "@/components/contribute/location-contribute-form";
import type { PickedPhoto } from "@/components/contribute/photo-picker";
import { firstErrorMessage } from "@/lib/contribute";
import {
  deleteContribution,
  galleryAsPhotos,
  getContribution,
  type ContributionDetail,
  type ContributionEdit,
  type ContributionStatus,
  type ContributionType,
} from "@/lib/contributions";
import { localized } from "@/lib/i18n-field";
import { SightingContributeForm } from "../../../contribute/sightings/sighting-contribute-form";
import type {
  SpeciesChoice,
  SpeciesSubject,
} from "../../../contribute/sightings/species-picker";
import { SpeciesContributeForm } from "../../../contribute/species/species-contribute-form";

/**
 * Loads one contribution and hands it to the form that filed it.
 *
 * **The three forms are reused rather than re-implemented**, which was the
 * explicit brief: a contributor editing a sighting should get the same staged
 * experience they got filling it in. Each takes a `ContributionEdit` prop plus
 * its current values; everything else about them - the stages, the fields, the
 * validation - is untouched.
 *
 * Three things this component owns that no filing page has:
 *
 * - **The status header**, so the record says where it stands before the form
 *   below asks for anything.
 * - **Withdrawing**, behind a confirmation. It is the destructive half of the
 *   page and deliberately sits *below* the form rather than in the header, where
 *   it would be the first thing under a contributor's thumb on a phone.
 * - **What "saved" means**, which the forms cannot decide for themselves: an
 *   edit to a published record un-publishes it, so the result is reported from
 *   the response rather than assumed.
 *
 * ⚠ **A 404 here is the ownership check**, not a missing page. animals-api looks
 * every record up inside a `created_by` filter, so another account's id is
 * indistinguishable from one that does not exist - see `core/my_contributions.py`.
 * Both land on the same "no longer available" panel.
 */

interface Props {
  type: ContributionType;
  id: number;
  locale: string;
  speciesOptions: SpeciesChoice[];
  creditName: string;
  maxVideoSeconds: number;
  locations: SelectOption[];
  weather: SelectOption[];
  counties: Promise<SelectOption[]>;
  parentPlaces: ParentPlaceOption[];
}

export function ContributionEditor({
  type,
  id,
  locale,
  speciesOptions,
  creditName,
  maxVideoSeconds,
  locations,
  weather,
  counties,
  parentPlaces,
}: Props) {
  const t = useTranslations("Contributions");
  const tCommon = useTranslations("Common");
  const router = useRouter();

  const [record, setRecord] = useState<ContributionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<ContributionStatus | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await getContribution(type, id);
        if (!cancelled) setRecord(data);
      } catch (err) {
        if (cancelled) return;
        // 404 is "not yours, or gone" - see the docstring. Anything else is a
        // real failure and keeps its message.
        const status = (err as { status?: number }).status;
        if (status === 404) setMissing(true);
        else setError(firstErrorMessage(err) ?? t("loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [type, id, t]);

  const onSaved = useCallback(
    (status: ContributionStatus) => {
      setSaved(status);
      // The list behind this page now shows a stale badge, and the record may
      // have left the public site entirely. `refresh()` re-runs the server
      // components without throwing away this page's state.
      router.refresh();
    },
    [router],
  );

  const withdraw = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteContribution(type, id);
      router.push("/contributions");
    } catch (err) {
      // The likeliest failure is a 409: a published species other people's
      // entries now reference. The API's own sentence says which, so it is
      // shown rather than replaced with a generic line.
      setError(firstErrorMessage(err) ?? t("deleteFailed"));
      setConfirmingDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <Box paddingY={48} justifyContent="center">
        <Spinner size={28} label={t("loading")} />
      </Box>
    );
  }

  if (missing || !record) {
    return (
      <Card gap={16} padding={24} maxWidth={520}>
        <Typography as="h2" variant="h3" fontWeight={700}>
          {t("goneTitle")}
        </Typography>
        <Typography variant="body" color="var(--foreground-muted, #6b7280)">
          {error ?? t("gone")}
        </Typography>
        <Box>
          <Button text={t("backToList")} href="/contributions" size="lg" />
        </Box>
      </Card>
    );
  }

  const status = record.contribution_status;
  const name = localized(record, "name", locale) ?? record.slug;

  const edit: ContributionEdit = { id, status, onSaved };

  return (
    <Box flexDirection="column" gap={20}>
      <StatusHeader record={record} status={status} name={name} />

      {/* The confirmation of a save, and it names what actually happened - an
          edit to a published record has taken it off the site, which is the one
          outcome a contributor must not have to infer. */}
      {saved && (
        <Card
          gap={8}
          padding={16}
          backgroundColor="var(--surface-2, #f3f4f6)"
          border="1px solid var(--border, #e5e7eb)"
        >
          <Typography variant="label" fontWeight={700}>
            {t("savedTitle")}
          </Typography>
          <Typography variant="body" color="var(--foreground-muted, #6b7280)">
            {saved === "in_review" ? t("savedUnpublished") : t("saved")}
          </Typography>
        </Card>
      )}

      {type === "sightings" && (
        <SightingContributeForm
          // Always the picker: an entry's species is one of the things an edit
          // exists to correct, so it cannot be fixed the way the FAB's flow
          // fixes it. `initialSpecies` seeds it to what was filed.
          species={null}
          speciesOptions={speciesOptions}
          initialKind={asString(record.kind) as SpeciesChoice["kind"] | null}
          initialCategorySlug={asString(record.category_slug)}
          creditName={creditName}
          locations={locations}
          weather={weather}
          counties={counties}
          parentPlaces={parentPlaces}
          maxVideoSeconds={maxVideoSeconds}
          edit={edit}
          initialSpecies={sightingSpecies(record, locale)}
          initialDraft={{
            name: asString(record.name) ?? "",
            shortDescription: asString(record.short_description) ?? "",
            description: asString(record.description) ?? "",
            date: asString(record.date) ?? "",
            // The API publishes `HH:MM:SS`; `<input type="time">` wants `HH:MM`.
            time: (asString(record.time) ?? "").slice(0, 5),
            location: asId(record.location),
            weather: asId(record.weather),
            temperature: asString(record.temperature_c) ?? "",
            individuals:
              record.individuals === null || record.individuals === undefined
                ? ""
                : String(record.individuals),
          }}
          initialPhotos={sightingPhotos(record, name)}
          initialHasVideo={hasVideo(record)}
          initialAnonymous={record.author_anonymous === true}
        />
      )}

      {type === "species" && (
        <SpeciesContributeForm
          categoryId={Number(asId(record.category))}
          categoryName={
            localized(
              { name: record.category_name, en_name: record.category_en_name },
              "name",
              locale,
            ) ?? ""
          }
          categoryHref={`/categories/${asString(record.category_slug) ?? ""}`}
          edit={edit}
          initialDraft={{
            name: asString(record.name) ?? "",
            scientificName: asString(record.scientific_name) ?? "",
            family: asString(record.family) ?? "",
            shortDescription: asString(record.short_description) ?? "",
            description: asString(record.description) ?? "",
          }}
          initialPhotos={galleryPhotos(record, name)}
        />
      )}

      {type === "locations" && (
        <LocationContributeForm
          parents={parentPlaces.filter(
            // A place may not be its own parent, and the API refuses the whole
            // ancestor chain - so the obvious case is taken out of the picker
            // rather than left to fail on save.
            (place) => place.value !== String(id),
          )}
          counties={counties}
          edit={edit}
          initialDraft={{
            name: asString(record.name) ?? "",
            placeType: asString(record.place_type) ?? "other",
            parent: asId(record.parent),
            county: asId(record.county),
            latitude: asString(record.latitude) ?? "",
            longitude: asString(record.longitude) ?? "",
          }}
          initialPhotos={galleryPhotos(record, name)}
        />
      )}

      <WithdrawPanel
        status={status}
        onAsk={() => setConfirmingDelete(true)}
        busy={deleting}
      />

      {confirmingDelete && (
        <ConfirmationModal
          title={t("withdrawConfirmTitle")}
          text={
            status === "published"
              ? t("withdrawConfirmPublished")
              : t("withdrawConfirm")
          }
          okLabel={t("withdraw")}
          cancelLabel={tCommon("cancel")}
          okDisabled={deleting}
          okCallback={() => void withdraw()}
          cancelCallback={() => setConfirmingDelete(false)}
        />
      )}

      {error && <Toast message={error} variant="error" duration={0} />}
    </Box>
  );
}

/** Where the record stands, and the way to see it when it is live. */
function StatusHeader({
  record,
  status,
  name,
}: {
  record: ContributionDetail;
  status: ContributionStatus;
  name: string;
}) {
  const t = useTranslations("Contributions");

  return (
    <Card gap={12} padding={18}>
      <Box alignItems="center" gap={12} flexWrap="wrap">
        <Typography as="h2" variant="h3" fontWeight={700}>
          {name}
        </Typography>
        <ContributionStatusBadge status={status} size="md" />
      </Box>

      <Typography variant="body" color="var(--foreground-muted, #6b7280)">
        {t(`statusHelp_${status}`)}
      </Typography>

      {/* Only when it is actually live: a pending record's public page 404s for
          everybody, so a link to it would be a link to an error. */}
      {status === "published" && (
        <Box>
          <Typography variant="body">
            <Link href={publicHref(record)} prefetch>
              {t("viewPublic")}
            </Link>
          </Typography>
        </Box>
      )}
    </Card>
  );
}

/** The destructive half of the page, kept away from the form's own buttons. */
function WithdrawPanel({
  status,
  onAsk,
  busy,
}: {
  status: ContributionStatus;
  onAsk: () => void;
  busy: boolean;
}) {
  const t = useTranslations("Contributions");

  return (
    <Card
      gap={12}
      padding={18}
      border="1px solid var(--error, #ef4444)"
      backgroundColor="transparent"
    >
      <Typography as="h2" variant="h4" fontWeight={700}>
        {t("withdrawTitle")}
      </Typography>
      <Typography variant="body" color="var(--foreground-muted, #6b7280)">
        {status === "published" ? t("withdrawPublished") : t("withdrawHelp")}
      </Typography>
      <Box>
        <Button
          text={t("withdraw")}
          icon="/icons/delete.svg"
          size="lg"
          kind="error"
          disabled={busy}
          isLoading={busy}
          onClick={onAsk}
        />
      </Box>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Reading the payload
// ---------------------------------------------------------------------------
//
// `ContributionDetail` is deliberately loose (`Record<string, unknown>` plus the
// four fields every type carries) - see its docstring. These four readers are
// what that costs, and they are kept together so the coercion happens in one
// place rather than being sprinkled through the JSX above.

function asString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

/** A relation as the string a `Select`/`TextInput` speaks in, or `""`. */
function asId(value: unknown): string {
  if (typeof value === "number") return String(value);
  if (typeof value === "string" && value !== "") return value;
  return "";
}

/** The public page for a published record. */
function publicHref(record: ContributionDetail): string {
  const slug = record.slug;
  if (record.type === "sighting") return `/sightings/${slug}`;
  if (record.type === "species") return `/species/${slug}`;
  // A place has no public page of its own in this app - its sightings are
  // reached through the maps - so the catalog landing is the honest target.
  return "/";
}

/** A catalog record's gallery rows as picker tiles. */
function galleryPhotos(
  record: ContributionDetail,
  fallbackName: string,
): PickedPhoto[] {
  const images = record.images as
    | { id: number; image: string | null; name?: string | null }[]
    | undefined;
  return galleryAsPhotos(images, fallbackName);
}

/**
 * A sighting's photographs as picker tiles.
 *
 * ⚠ Photos only. A sighting's gallery is one table holding photographs, clips
 * and video links together, so the clips are filtered out here exactly as the
 * API filters them out of the diff it receives back.
 */
function sightingPhotos(
  record: ContributionDetail,
  fallbackName: string,
): PickedPhoto[] {
  const media = record.media as
    | {
        id: number;
        kind: string;
        image: string | null;
        name?: string | null;
      }[]
    | undefined;
  return galleryAsPhotos(
    (media ?? []).filter((row) => row.kind === "image"),
    fallbackName,
  );
}

function hasVideo(record: ContributionDetail): boolean {
  const media = record.media as { kind: string }[] | undefined;
  return (media ?? []).some((row) => row.kind === "video" || row.kind === "link");
}

/** The entry's current subject, to seed the species picker with. */
function sightingSpecies(
  record: ContributionDetail,
  locale: string,
): SpeciesSubject | null {
  const id = record.species;
  if (typeof id !== "number") return null;
  return {
    id,
    slug: asString(record.species_slug) ?? "",
    name:
      localized(
        { name: record.species_name, en_name: record.species_en_name },
        "name",
        locale,
      ) ?? "",
  };
}
