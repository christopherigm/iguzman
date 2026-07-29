"use client";

import { use, useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@repo/i18n/navigation";
import { AdminForm, type FieldDef } from "@/components/admin/admin-form";
import {
  EntityGalleryField,
  useEntityGallery,
} from "@/components/admin/entity-gallery";
import { MapPicker } from "@/components/admin/map-picker";
import { MediaEditor } from "../media-editor";
import {
  locations,
  seasons,
  sightingMedia,
  sightings,
  species,
  weatherConditions,
} from "@/lib/admin-api";
import { useDerivedSlug } from "@/hooks/use-derived-slug";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";

type Props = { params: Promise<{ locale: string; id: string }> };
type Option = { value: string | number; label: string };
type Coordinates = { latitude: number; longitude: number };

/** Today as `YYYY-MM-DD`, from the local clock rather than `toISOString()`. */
function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export default function AdminSightingFormPage({ params }: Props) {
  const { id } = use(params);
  const isNew = id === "new";
  const t = useTranslations("Admin");
  const router = useRouter();

  const [values, setValues] = useState<Record<string, unknown>>({
    species: "",
    name: "",
    en_name: "",
    slug: "",
    // Most entries are typed up the day of the outing, so today is the useful
    // default; it is also what the season is derived from on save.
    date: today(),
    time: "",
    location: "",
    latitude: "",
    longitude: "",
    season: "",
    weather: "",
    temperature_c: "",
    individuals: "",
    short_description: "",
    en_short_description: "",
    description: "",
    en_description: "",
    // The credit line. Editable here as well as in the public contribute flow:
    // an author files someone else's photograph, and a reviewer may need to
    // correct a contributor's spelling of their own name. `author_anonymous` is a
    // *record* of the contributor's answer, not a display toggle - the API stores
    // no name when it is on, so an administrator seeing it set must not helpfully
    // fill one in.
    author_name: "",
    author_anonymous: false,
    is_featured: false,
    enabled: true,
  });

  // The entry has no separate cover uploader any more: its photos are this
  // gallery and the first of them is what the API publishes as `image`.
  // `SightingMedia` is one list carrying photos, uploaded clips and video links,
  // so the photo half is filtered out of it here and the two video kinds stay in
  // `MediaEditor` below - they cannot ride in a JSON body the way an image does.
  const gallery = useEntityGallery(sightingMedia, isNew ? null : Number(id), {
    filter: (row) => row.kind === "image",
    createExtras: { kind: "image" },
  });
  const [speciesOptions, setSpeciesOptions] = useState<Option[]>([]);
  const [locationOptions, setLocationOptions] = useState<Option[]>([]);
  // Each location's own coordinates, keyed by id. They are what the API falls
  // back to when the entry carries none, so they are also where the map should
  // open before a pin is dropped.
  const [locationCoords, setLocationCoords] = useState<
    Record<string, Coordinates>
  >({});
  const [seasonOptions, setSeasonOptions] = useState<Option[]>([]);
  const [weatherOptions, setWeatherOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // The entry's title is optional, so a slug derived from it would be empty for
  // most entries. `<species>-<date>` is what makes one identifiable *and*
  // unique, which is what the API requires.
  const derivedSource =
    String(values.name ?? "") || `${slugSpecies(speciesOptions, values)}`;
  useDerivedSlug(
    isNew,
    { ...values, name: `${derivedSource} ${values.date ?? ""}` },
    setValues,
  );

  useEffect(() => {
    // Four independent lookups, fired together: a form that awaited them in
    // sequence would take four round-trips to become usable.
    void Promise.all([
      species.list().then((rows) => setSpeciesOptions(toOptions(rows))),
      locations.list().then((rows) => {
        setLocationOptions(toOptions(rows));
        setLocationCoords(toCoordinates(rows));
      }),
      seasons.list().then((rows) => setSeasonOptions(toOptions(rows))),
      weatherConditions
        .list()
        .then((rows) => setWeatherOptions(toOptions(rows))),
    ]).catch(() => {
      /* non-critical: the form still saves, just without labelled pickers */
    });
  }, []);

  useEffect(() => {
    if (isNew) return;
    sightings
      .get(Number(id))
      .then((data) => {
        setValues({
          species: data.species ?? "",
          name: data.name ?? "",
          en_name: data.en_name ?? "",
          slug: data.slug ?? "",
          date: data.date ?? today(),
          time: data.time ?? "",
          location: data.location ?? "",
          latitude: data.latitude ?? "",
          longitude: data.longitude ?? "",
          season: data.season ?? "",
          weather: data.weather ?? "",
          temperature_c: data.temperature_c ?? "",
          individuals: data.individuals ?? "",
          short_description: data.short_description ?? "",
          en_short_description: data.en_short_description ?? "",
          description: data.description ?? "",
          en_description: data.en_description ?? "",
          author_name: data.author_name ?? "",
          author_anonymous: data.author_anonymous ?? false,
          is_featured: data.is_featured ?? false,
          enabled: data.enabled ?? true,
        });
      })
      .catch(() => setError(t("errorLoad")))
      .finally(() => setLoading(false));
  }, [id, isNew, t]);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: Record<string, unknown> = { ...values };
      // Updates are PATCH, so clearing an optional relation or number needs an
      // explicit null - an omitted key means "leave unchanged", and "" is not a
      // value any of these columns accepts.
      (
        [
          "location",
          "season",
          "weather",
          "time",
          "latitude",
          "longitude",
          "temperature_c",
          "individuals",
        ] as const
      ).forEach((k) => {
        if (payload[k] === "") payload[k] = null;
      });
      // The photos are written after the row exists: each is POSTed to this
      // entry's own URL, which one being created does not have until now.
      if (isNew) {
        const created = await sightings.create(payload);
        await gallery.persist(created.id as number);
        setSuccess(t("saved"));
        router.replace(`/admin/sightings/${created.id}`);
      } else {
        await sightings.update(Number(id), payload);
        await gallery.persist(Number(id));
        setSuccess(t("saved"));
      }
    } catch {
      setError(t("errorSave"));
    } finally {
      setSaving(false);
    }
  };

  const fields: FieldDef[] = [
    {
      key: "species",
      label: t("species"),
      type: "select",
      required: true,
      options: speciesOptions,
      placeholder: t("selectSpecies"),
    },
    {
      key: "date",
      label: t("date"),
      required: true,
      placeholder: "YYYY-MM-DD",
    },
    { key: "time", label: t("time"), placeholder: "HH:MM" },
    // The entry's own title, optional: the site falls back to the species name.
    { key: "name", label: t("title") },
    { key: "en_name", label: t("title") },
    { key: "slug", label: t("slug"), type: "slug", disabled: true },
    {
      key: "location",
      label: t("location"),
      type: "select",
      options: locationOptions,
      placeholder: t("none"),
    },
    // Left blank, the API falls back to the location's own coordinates - so
    // these are the *exact spot*, not the place. The map above the pair writes
    // both at once; typing into either still works and moves the pin.
    { key: "latitude", label: t("latitude"), type: "number" },
    { key: "longitude", label: t("longitude"), type: "number" },
    {
      key: "season",
      label: t("season"),
      type: "select",
      options: seasonOptions,
      // Left blank, the API fills it by matching the date's month against each
      // season's months. An explicit choice is never overwritten, which is what
      // lets an unseasonably warm November day be filed however the author wants.
      placeholder: t("seasonAuto"),
    },
    {
      key: "weather",
      label: t("weather"),
      type: "select",
      options: weatherOptions,
      placeholder: t("none"),
    },
    { key: "temperature_c", label: t("temperature"), type: "number" },
    { key: "individuals", label: t("individuals"), type: "number" },
    { key: "short_description", label: t("excerpt"), type: "textarea" },
    { key: "en_short_description", label: t("excerpt"), type: "textarea" },
    { key: "description", label: t("story"), type: "textarea" },
    { key: "en_description", label: t("story"), type: "textarea" },
    { key: "author_name", label: t("authorName") },
    { key: "author_anonymous", label: t("authorAnonymous"), type: "boolean" },
    { key: "is_featured", label: t("featured"), type: "boolean" },
    { key: "enabled", label: t("enabled"), type: "boolean" },
  ];

  if (loading)
    return (
      <Box padding="24px">
        <Typography variant="body">{t("loading")}</Typography>
      </Box>
    );

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t("home"), href: "/" },
          { label: t("breadcrumbAdmin"), href: "/admin" },
          { label: t("sightings"), href: "/admin/sightings" },
          { label: isNew ? t("newItem") : t("edit") },
        ]}
      />
      <AdminForm
        title={
          isNew
            ? `${t("newItem")} - ${t("sightings")}`
            : `${t("edit")} - ${t("sightings")}`
        }
        editingName={isNew ? undefined : String(values.name ?? "")}
        isEditing={!isNew}
        fields={fields}
        values={values}
        onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        onSubmit={handleSubmit}
        saving={saving}
        error={error}
        success={success}
        productionHref={
          !isNew && values.slug
            ? `/sightings/${String(values.slug)}`
            : undefined
        }
        imagesSlot={<EntityGalleryField gallery={gallery} />}
        slots={[
          {
            beforeKey: "latitude",
            node: (
              <MapPicker
                latitude={String(values.latitude ?? "")}
                longitude={String(values.longitude ?? "")}
                onChange={(latitude, longitude) =>
                  setValues((prev) => ({ ...prev, latitude, longitude }))
                }
                fallbackCenter={
                  locationCoords[String(values.location ?? "")] ?? null
                }
              />
            ),
          },
        ]}
      >
        {/* The clips: uploaded video files and video links. Still one row at a
            time, and still only once the entry exists - a video file is far past
            the API's JSON-body limit and goes multipart to its own endpoint, so
            it cannot be held in form state the way a photo is. */}
        {!isNew && <MediaEditor sightingId={Number(id)} />}
      </AdminForm>
    </>
  );
}

function toOptions(rows: Record<string, unknown>[]): Option[] {
  return rows.map((row) => ({
    value: row.id as number,
    label: String(row.name ?? row.id),
  }));
}

/**
 * The coordinates of every location that has a pair, keyed by id. A place is
 * only rough guidance for the map - the API rounds a sensitive one to about a
 * kilometre for every caller - so a location without coordinates is simply
 * absent here and the map opens on its default view instead.
 */
function toCoordinates(
  rows: Record<string, unknown>[],
): Record<string, Coordinates> {
  const out: Record<string, Coordinates> = {};
  rows.forEach((row) => {
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    if (row.latitude == null || row.longitude == null) return;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    out[String(row.id)] = { latitude, longitude };
  });
  return out;
}

/** The chosen species' name, for the derived slug. Empty until one is picked. */
function slugSpecies(
  options: Option[],
  values: Record<string, unknown>,
): string {
  const match = options.find(
    (o) => String(o.value) === String(values.species ?? ""),
  );
  return match?.label ?? "";
}
