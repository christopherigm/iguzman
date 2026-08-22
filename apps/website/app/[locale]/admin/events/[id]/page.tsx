"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@repo/i18n/navigation";
import { AdminForm, type FieldDef } from "@/components/admin/admin-form";
import {
  AdminImageUploader,
  type NewImage,
} from "@/components/admin-image-uploader/admin-image-uploader";
import { AdminImageField } from "@/components/admin/admin-image-field";
import { AdminAspectRatioField } from "@/components/admin/admin-aspect-ratio-field";
import { ImageWebSearch } from "@/components/admin/image-web-search";
import {
  remainingGallerySlots,
  useAdminImageField,
} from "@/hooks/use-admin-image-field";
import { MapPicker } from "@/components/admin/map-picker";
import { timezoneOptions } from "@/components/admin/timezone-options";
import {
  getEvent,
  createEvent,
  updateEvent,
  createEventImage,
  createStockGalleryRows,
  type StockImageFile,
  updateEventImage,
  deleteEventImage,
  listBranches,
  checkSlug,
  listEvents,
} from "@/lib/admin-api";
import { useAdminSiblings } from "@/hooks/use-admin-siblings";
import { instantToWallClock, wallClockToInstant } from "@/lib/event-shared";
import { buildSlug } from "@/lib/slug-utils";
import { useSitePrefix } from "../../site-prefix-provider";
import { useSession } from "@repo/auth/session-provider";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";

/**
 * The event form.
 *
 * Two things here differ from every other content form in the CMS:
 *
 * **1. The dates are wall clock, not instants.** `starts_at`/`ends_at` are
 * stored as UTC instants, but an author types "7pm" meaning 7pm *where the event
 * happens*. So the form holds `datetime-local` strings and converts them against
 * the event's own `timezone` on load and on save (`instantToWallClock` /
 * `wallClockToInstant`). Never hand a `datetime-local` value to `new Date()` -
 * that resolves it in the *browser's* zone, so an operator abroad would file
 * every event at the wrong hour.
 *
 * **2. The location fields are the row's own, not the resolved ones.** The API
 * publishes `venue_name`/`address`/coordinates already folded across the event's
 * branch, and it publishes the raw columns as `own_*`. The form edits `own_*`:
 * loading the resolved values would show the branch's address in the address box,
 * an author would "correct" it, and the event would silently detach from the
 * location that carries its coordinates.
 */

/** How many photos one event's gallery holds, uploads and picks together. */
const GALLERY_MAX = 20;

type Props = { params: Promise<{ locale: string; id: string }> };

/** Blank so the API's own default (`UTC`) is never overwritten by an empty box. */
const DEFAULT_TIMEZONE = "UTC";

export default function AdminEventFormPage({ params }: Props) {
  const { id } = use(params);
  const isNew = id === "new";
  const t = useTranslations("Admin");
  const tEvents = useTranslations("Events");
  const router = useRouter();

  const [values, setValues] = useState<Record<string, unknown>>({
    aspect_ratio: "",
    name: "",
    en_name: "",
    slug: "",
    starts_at: "",
    ends_at: "",
    is_all_day: false,
    timezone: DEFAULT_TIMEZONE,
    branch: "",
    venue_name: "",
    en_venue_name: "",
    address: "",
    latitude: "",
    longitude: "",
    short_description: "",
    en_short_description: "",
    description: "",
    en_description: "",
    href: "",
    is_featured: false,
    enabled: true,
  });
  const [branches, setBranches] = useState<
    { id: number; name: string; address: string; timezone: string }[]
  >([]);
  // The cover image's uploader and stock picker: one field with two doors.
  const image = useAdminImageField();
  // Pulled out because the load effect below depends on it: this one callback is
  // stable, where `image` itself changes with every pick and keystroke - and an
  // effect keyed on the object would re-fetch the record each time.
  const loadImage = image.load;
  const [existingGallery, setExistingGallery] = useState<
    { id: number; url: string; sort_order?: number }[]
  >([]);
  const [pendingNewGallery, setPendingNewGallery] = useState<NewImage[]>([]);
  const [pendingDeletedGalleryIds, setPendingDeletedGalleryIds] = useState<
    number[]
  >([]);
  const [pendingGalleryOrder, setPendingGalleryOrder] = useState<number[]>([]);
  // Photos picked from a stock bank for the *gallery*. They become rows of their
  // own on save, after the operator's uploads - the picker and the uploader both
  // fill the same slots, so neither replaces the other.
  const [stockImages, setStockImages] = useState<StockImageFile[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const systemId = useSession()?.systemId ?? 0;
  // Prev/next through the CMS list, for the arrows beside Save.
  const siblings = useAdminSiblings({
    basePath: "/admin/events",
    id,
    systemId,
    list: listEvents,
  });

  // The tenant's slug namespace, from the CMS-wide provider. Null while the
  // System loads, which is what the guard below is for: `buildSlug(name, "")`
  // would give this record a leading hyphen and no namespace at all.
  const sitePrefix = useSitePrefix();
  // Auto-populate the slug from the name for new records (the field is
  // read-only). Derived during render rather than in an effect; the guard stops
  // it looping once the slug already matches the name.
  if (isNew && sitePrefix) {
    const derivedSlug = buildSlug(String(values.name ?? ""), sitePrefix);
    if (values.slug !== derivedSlug) {
      setValues((prev) => ({ ...prev, slug: derivedSlug }));
    }
  }

  const handleNameBlur = useCallback(async () => {
    const currentSlug = String(values.slug ?? "");
    if (!currentSlug) return;
    setSlugError(null);
    try {
      const result = await checkSlug(
        "event",
        currentSlug,
        !isNew ? Number(id) : undefined,
      );
      if (!result.available) setSlugError(t("slugTaken"));
    } catch {
      /* ignore */
    }
  }, [values.slug, isNew, id, t]);

  useEffect(() => {
    void (async () => {
      try {
        const rows = await listBranches(systemId);
        setBranches(
          rows.map((row) => ({
            id: row.id as number,
            name: String(row.name ?? `#${row.id}`),
            address: String(row.address ?? ""),
            timezone: String(row.timezone ?? DEFAULT_TIMEZONE),
          })),
        );
      } catch {
        // A missing branch list costs the picker, not the form: an event can
        // always name its place in the free-text fields below.
      }
    })();
  }, [systemId]);

  useEffect(() => {
    if (isNew) return;
    getEvent(Number(id))
      .then((data) => {
        const timezone = String(data.timezone ?? DEFAULT_TIMEZONE);
        setValues({
          aspect_ratio: data.aspect_ratio ?? "",
          name: data.name ?? "",
          en_name: data.en_name ?? "",
          slug: data.slug ?? "",
          // Instants -> wall clock in the event's own zone; see the file header.
          starts_at: instantToWallClock(
            (data.starts_at as string) ?? null,
            timezone,
          ),
          ends_at: instantToWallClock(
            (data.ends_at as string) ?? null,
            timezone,
          ),
          is_all_day: data.is_all_day ?? false,
          timezone,
          branch: data.branch ?? "",
          // The row's *own* location values, never the branch-resolved pair.
          venue_name: data.own_venue_name ?? "",
          en_venue_name: data.own_en_venue_name ?? "",
          address: data.own_address ?? "",
          latitude: data.own_latitude ?? "",
          longitude: data.own_longitude ?? "",
          short_description: data.short_description ?? "",
          en_short_description: data.en_short_description ?? "",
          description: data.description ?? "",
          en_description: data.en_description ?? "",
          href: data.href ?? "",
          is_featured: data.is_featured ?? false,
          enabled: data.enabled ?? true,
        });
        loadImage(data.image, Number(id));
        const imgs = ((data.images as Record<string, unknown>[]) ?? []).map(
          (i) => ({
            id: i.id as number,
            url: String(i.image ?? ""),
            sort_order: i.sort_order as number,
          }),
        );
        setExistingGallery(imgs);
      })
      .catch(() => setError(t("errorLoad")))
      .finally(() => setLoading(false));
  }, [id, isNew, loadImage, t]);

  const handleChange = (key: string, value: unknown) => {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      // Picking a location adopts its timezone, which is the answer in every
      // case but the rare one where a branch hosts an event in another zone -
      // and it saves the author setting the one field they are most likely to
      // leave on the default and least likely to notice is wrong.
      if (key === "branch" && value) {
        const branch = branches.find((b) => String(b.id) === String(value));
        if (branch) next.timezone = branch.timezone;
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const timezone = String(values.timezone || DEFAULT_TIMEZONE);
      const startsAt = wallClockToInstant(
        String(values.starts_at ?? ""),
        timezone,
      );
      if (!startsAt) {
        setError(tEvents("errorNoDate"));
        return;
      }
      const endsAt = wallClockToInstant(String(values.ends_at ?? ""), timezone);
      if (endsAt && endsAt < startsAt) {
        setError(tEvents("errorEndBeforeStart"));
        return;
      }

      const payload: Record<string, unknown> = {
        system: systemId,
        name: values.name,
        en_name: values.en_name,
        short_description: values.short_description,
        en_short_description: values.en_short_description,
        description: values.description,
        en_description: values.en_description,
        is_featured: values.is_featured,
        enabled: values.enabled,
        // The frame the event's photographs are drawn in; "" is auto.
        aspect_ratio: values.aspect_ratio,
        is_all_day: values.is_all_day,
        timezone,
        starts_at: startsAt,
        // Send null, not an omitted key, so clearing the end actually clears it -
        // this is a PATCH, and an absent key means "leave unchanged".
        ends_at: endsAt,
        venue_name: values.venue_name || null,
        en_venue_name: values.en_venue_name || null,
        address: values.address || null,
        latitude: values.latitude === "" ? null : values.latitude,
        longitude: values.longitude === "" ? null : values.longitude,
        branch: values.branch === "" ? null : Number(values.branch),
        href: values.href || null,
      };
      // The slug is derived server-side; omit it when empty.
      if (values.slug) payload.slug = values.slug;
      // The cover, and - when it came from a bank - the credit it owes, which
      // has to be in the same write as the file it describes.
      Object.assign(payload, image.payload());

      let eventId: number;
      if (isNew) {
        const created = await createEvent(payload);
        eventId = created.id as number;
        image.settle(created.image, eventId);
      } else {
        const updated = await updateEvent(Number(id), payload);
        eventId = Number(id);
        image.settle(updated.image, eventId);
      }

      for (const imgId of pendingDeletedGalleryIds) {
        await deleteEventImage(eventId, imgId).catch(() => null);
      }
      for (let i = 0; i < pendingNewGallery.length; i++) {
        await createEventImage(eventId, {
          image: pendingNewGallery?.[i]?.base64,
          sort_order: pendingGalleryOrder.length + i,
        }).catch(() => null);
      }
      // ⚠ Each picked photo's credit goes in the same create call as its file:
      // storing an image clears any attribution, so a second write would lose
      // the credit that makes the photo legal to publish.
      await createStockGalleryRows(
        stockImages,
        pendingGalleryOrder.length + pendingNewGallery.length,
        (payload) => createEventImage(eventId, payload),
      );
      setStockImages([]);
      for (let i = 0; i < pendingGalleryOrder.length; i++) {
        await updateEventImage(eventId, pendingGalleryOrder[i] ?? 0, {
          sort_order: i,
        }).catch(() => null);
      }

      setSuccess(t("saved"));
      if (isNew) router.replace(`/admin/events/${eventId}`);
    } catch {
      setError(t("errorSave"));
    } finally {
      setSaving(false);
    }
  };

  // The location this event is filed under, when it is filed under one.
  const selectedBranch = branches.find(
    (b) => String(b.id) === String(values.branch),
  );
  // ⚠ These are the row's *own* values, not the resolved ones (see the file
  // header) - so this asks "has this event overridden its branch", not "does
  // this event have a location".
  const hasOwnLocation = Boolean(
    values.venue_name ||
    values.en_venue_name ||
    values.address ||
    values.latitude ||
    values.longitude,
  );
  // A branch that names and addresses itself already answers all four location
  // fields through `Event.effective_*`, so the form stops asking for them and
  // says where they come from instead. An event that has already overridden one
  // keeps them: hiding a *filled* field turns it into a value the operator can
  // neither see nor clear, while every public page goes on rendering it. And
  // "Another place" always keeps them - with no branch there is nothing to fall
  // back to, so those fields are the only place the location can come from.
  const inheritsLocation =
    Boolean(selectedBranch?.name && selectedBranch?.address) && !hasOwnLocation;

  const fields: FieldDef[] = [
    { key: "name", label: t("name"), required: true, onBlur: handleNameBlur },
    { key: "en_name", label: "Name (EN)" },
    {
      key: "slug",
      label: "Slug",
      type: "slug",
      disabled: true,
      fieldError: slugError,
    },
    {
      key: "starts_at",
      label: tEvents("startsAtLabel"),
      type: "datetime",
      required: true,
    },
    { key: "ends_at", label: tEvents("endsAtLabel"), type: "datetime" },
    { key: "is_all_day", label: tEvents("allDayLabel"), type: "boolean" },
    {
      key: "timezone",
      label: tEvents("timezoneLabel"),
      type: "select",
      options: timezoneOptions(),
    },
    {
      key: "branch",
      label: tEvents("branchLabel"),
      type: "select",
      placeholder: tEvents("branchNone"),
      options: branches.map((b) => ({ value: b.id, label: b.name })),
    },
    ...(inheritsLocation
      ? []
      : ([
          { key: "venue_name", label: tEvents("venueLabel") },
          { key: "en_venue_name", label: `${tEvents("venueLabel")} (EN)` },
          { key: "address", label: tEvents("addressLabel"), type: "textarea" },
        ] as FieldDef[])),
    // ⚠ No Latitude / Longitude inputs, exactly as on the branch form. The
    // coordinates are the map picker's output (mounted in the slot below, under
    // the address) and are shown there as a readout - two decimal boxes beside a
    // map are a second way to set the same value, and the one that can disagree
    // with the pin. They are still ordinary fields in `values`, so nothing about
    // the payload changed - including that a blank pair still means "use the
    // branch's own".
    { key: "href", label: t("link") ?? "Link", type: "url" },
    {
      key: "short_description",
      label: t("shortDescription") ?? "Short Description (ES)",
      type: "textarea",
    },
    {
      key: "en_short_description",
      label: "Short Description (EN)",
      type: "textarea",
    },
    {
      key: "description",
      label: t("description") ?? "Description (ES)",
      type: "textarea",
    },
    { key: "en_description", label: "Description (EN)", type: "textarea" },
    { key: "is_featured", label: t("featured") ?? "Featured", type: "boolean" },
    { key: "enabled", label: t("enabled"), type: "boolean" },
  ];

  // Both stock-image pickers on this form look for the same thing, so they open
  // on one query - the record's own name, until the operator edits it.
  const imageQuery =
    String(values.name ?? "").trim() || String(values.en_name ?? "").trim();

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t("home"), href: "/" },
          { label: t("breadcrumbAdmin"), href: "/admin" },
          { label: t("events"), href: "/admin/events" },
          { label: isNew ? t("newItem") : t("edit") },
        ]}
      />
      <AdminForm
        title={
          isNew
            ? `${t("newItem")} - ${t("events")}`
            : `${t("edit")} - ${t("events")}`
        }
        editingName={isNew ? undefined : String(values.name ?? "")}
        fields={fields}
        values={values}
        onChange={handleChange}
        onSubmit={handleSubmit}
        loading={loading}
        saving={saving}
        error={error}
        success={success}
        siblings={siblings}
        productionHref={
          isNew
            ? undefined
            : values.slug
              ? `/events/${String(values.slug)}`
              : null
        }
        slots={[
          {
            // Sits above the branch picker, because it is the sentence that
            // explains why every field under it may be left blank.
            beforeKey: "branch",
            node: (
              <Typography
                variant="caption"
                color="var(--muted-foreground, #6b7280)"
              >
                {tEvents("locationHint")}
              </Typography>
            ),
          },
          // Under the address it pins, and above the link - the pin is part
          // of *where this event happens*, not of how it is advertised. With
          // the location inherited there is nothing here to pin, so the map
          // gives way to the one line saying which branch answers for it.
          inheritsLocation
            ? {
                beforeKey: "href",
                node: (
                  <Typography
                    variant="caption"
                    color="var(--muted-foreground, #6b7280)"
                  >
                    {tEvents("locationFromBranch", {
                      branch: selectedBranch?.name ?? "",
                    })}
                  </Typography>
                ),
              }
            : {
                // ⚠ No screenshot is taken here, unlike the branch form's picker:
                // `map_image` is a column on `Branch` alone (it exists for the
                // booking confirmation email), so there is no `capture()` call and
                // no brandmark to draw into one.
                beforeKey: "href",
                node: (
                  <Box flexDirection="column" gap={8}>
                    <MapPicker
                      latitude={String(values.latitude ?? "")}
                      longitude={String(values.longitude ?? "")}
                      onChange={(latitude, longitude) =>
                        setValues((prev) => ({ ...prev, latitude, longitude }))
                      }
                    />
                    {/* The coordinates as a readout, not as inputs - see the note
                    where the two number fields used to be. */}
                    <Typography variant="caption" color="var(--foreground)">
                      {values.latitude && values.longitude
                        ? tEvents("coordinatesValue", {
                            latitude: String(values.latitude),
                            longitude: String(values.longitude),
                          })
                        : tEvents("coordinatesEmpty")}
                    </Typography>
                  </Box>
                ),
              },
        ]}
        imagesSlot={
          <>
            <AdminImageField
              label={t("coverImage") ?? "Cover Image"}
              field={image}
              query={imageQuery}
            />
            <Box display="flex" flexDirection="column" gap="8px">
              <Typography variant="label">
                {t("imagesGallery") ?? "Images for gallery"}
              </Typography>
              <AdminAspectRatioField
                value={values.aspect_ratio}
                onChange={(v) =>
                  setValues((prev) => ({ ...prev, aspect_ratio: v }))
                }
              />
              <AdminImageUploader
                existingImages={existingGallery}
                onChange={(n, d, o) => {
                  setPendingNewGallery(n);
                  setPendingDeletedGalleryIds(d);
                  setPendingGalleryOrder(o);
                }}
                maxImages={GALLERY_MAX}
              />
              <ImageWebSearch
                defaultQuery={imageQuery}
                value={stockImages}
                onChange={setStockImages}
                slots={remainingGallerySlots(
                  GALLERY_MAX,
                  existingGallery,
                  pendingDeletedGalleryIds,
                  pendingNewGallery,
                )}
              />
            </Box>
          </>
        }
      />
    </>
  );
}
