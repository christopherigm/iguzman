"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@repo/i18n/navigation";
import { AdminForm, type FieldDef } from "@/components/admin/admin-form";
import {
  AdminImageUploader,
  type NewImage,
} from "@/components/admin-image-uploader/admin-image-uploader";
import { timezoneOptions } from "@/components/admin/timezone-options";
import {
  getEvent,
  createEvent,
  updateEvent,
  createEventImage,
  updateEventImage,
  deleteEventImage,
  listBranches,
  checkSlug,
} from "@/lib/admin-api";
import { instantToWallClock, wallClockToInstant } from "@/lib/event-shared";
import { buildSlug } from "@/lib/slug-utils";
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

type Props = { params: Promise<{ locale: string; id: string }> };

/** Blank so the API's own default (`UTC`) is never overwritten by an empty box. */
const DEFAULT_TIMEZONE = "UTC";

export default function AdminEventFormPage({ params }: Props) {
  const { id } = use(params);
  const isNew = id === "new";
  const t = useTranslations("Admin");
  const tEvents = useTranslations("Events");
  const tc = useTranslations("Contact");
  const router = useRouter();

  const [values, setValues] = useState<Record<string, unknown>>({
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
    { id: number; name: string; timezone: string }[]
  >([]);
  const [pendingImage, setPendingImage] = useState<NewImage[]>([]);
  const [existingImage, setExistingImage] = useState<
    { id: number; url: string }[]
  >([]);
  const [existingGallery, setExistingGallery] = useState<
    { id: number; url: string; sort_order?: number }[]
  >([]);
  const [pendingNewGallery, setPendingNewGallery] = useState<NewImage[]>([]);
  const [pendingDeletedGalleryIds, setPendingDeletedGalleryIds] = useState<
    number[]
  >([]);
  const [pendingGalleryOrder, setPendingGalleryOrder] = useState<number[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const systemId = useSession()?.systemId ?? 0;

  // Auto-populate the slug from the name for new records (the field is
  // read-only). Derived during render rather than in an effect; the guard stops
  // it looping once the slug already matches the name.
  if (isNew) {
    const derivedSlug = buildSlug(String(values.name ?? ""), systemId);
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
          name: data.name ?? "",
          en_name: data.en_name ?? "",
          slug: data.slug ?? "",
          // Instants -> wall clock in the event's own zone; see the file header.
          starts_at: instantToWallClock(
            (data.starts_at as string) ?? null,
            timezone,
          ),
          ends_at: instantToWallClock((data.ends_at as string) ?? null, timezone),
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
        if (data.image)
          setExistingImage([{ id: Number(id), url: String(data.image) }]);
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
  }, [id, isNew, t]);

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
      const startsAt = wallClockToInstant(String(values.starts_at ?? ""), timezone);
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
      if (pendingImage.length > 0) {
        payload.image = pendingImage[0]?.base64;
      } else if (existingImage.length === 0) {
        payload.image = null;
      }

      let eventId: number;
      if (isNew) {
        const created = await createEvent(payload);
        eventId = created.id as number;
      } else {
        await updateEvent(Number(id), payload);
        eventId = Number(id);
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
      label: tc("timezone"),
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
    { key: "venue_name", label: tEvents("venueLabel") },
    { key: "en_venue_name", label: `${tEvents("venueLabel")} (EN)` },
    { key: "address", label: tc("address"), type: "textarea" },
    { key: "latitude", label: tc("latitude"), type: "number" },
    { key: "longitude", label: tc("longitude"), type: "number" },
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
        saving={saving}
        error={error}
        success={success}
        productionHref={
          !isNew && values.slug ? `/events/${String(values.slug)}` : undefined
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
        ]}
        imagesSlot={
          <>
            <Box display="flex" flexDirection="column" gap="8px">
              <Typography variant="label">
                {t("coverImage") ?? "Cover Image"}
              </Typography>
              <AdminImageUploader
                existingImages={existingImage}
                onChange={(n, _d, o) => {
                  setPendingImage(n);
                  setExistingImage((prev) =>
                    prev.filter((img) => o.includes(img.id)),
                  );
                }}
                maxImages={1}
              />
            </Box>
            <Box display="flex" flexDirection="column" gap="8px">
              <Typography variant="label">
                {t("images") ?? "Gallery Images"}
              </Typography>
              <AdminImageUploader
                existingImages={existingGallery}
                onChange={(n, d, o) => {
                  setPendingNewGallery(n);
                  setPendingDeletedGalleryIds(d);
                  setPendingGalleryOrder(o);
                }}
                maxImages={20}
              />
            </Box>
          </>
        }
      />
    </>
  );
}
