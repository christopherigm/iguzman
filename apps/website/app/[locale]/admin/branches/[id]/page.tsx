"use client";

import { useState, useEffect, use, useRef, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@repo/i18n/navigation";
import { AdminForm, type FieldDef } from "@/components/admin/admin-form";
import {
  BranchHoursEditor,
  type BranchHoursRow,
} from "@/components/admin/branch-hours-editor";
import { MapPicker, type MapPickerHandle } from "@/components/admin/map-picker";
import {
  ResourcePoolsEditor,
  type ResourcePoolRow,
} from "@/components/admin/resource-pools-editor";
import { timezoneOptions } from "@/components/admin/timezone-options";
import {
  getBranch,
  createBranch,
  updateBranch,
  getSystem,
  AdminApiError,
  listBranches,
} from "@/lib/admin-api";
import { useAdminSiblings } from "@/hooks/use-admin-siblings";
import { useSession } from "@repo/auth/session-provider";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";

type Props = { params: Promise<{ locale: string; id: string }> };

/** Fields sent as null when left blank, rather than "". */
const NULLABLE_ON_BLANK = [
  "name",
  "en_name",
  "address",
  "location_details",
  "en_location_details",
  "phone",
  "whatsapp",
  "email",
  "latitude",
  "longitude",
];

/** The timezone read below is a constant of the environment - it never changes
 *  while the form is open - so the store it is read from has nothing to notify. */
const subscribeToNothing = () => () => {};

/**
 * Flatten a DRF validation body (`{ field: ["msg", …] }` or `{ detail: "…" }`)
 * from an AdminApiError into a single readable line. Returns null for anything
 * that isn't a field-validation error, so the caller falls back to its generic
 * message.
 */
function fieldErrorMessage(err: unknown): string | null {
  if (!(err instanceof AdminApiError)) return null;
  const parts: string[] = [];
  for (const [field, value] of Object.entries(err.data)) {
    const messages = Array.isArray(value) ? value : [value];
    for (const msg of messages) {
      if (typeof msg !== "string") continue;
      parts.push(field === "detail" ? msg : `${field}: ${msg}`);
    }
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

export default function AdminBranchFormPage({ params }: Props) {
  const { id } = use(params);
  const isNew = id === "new";
  const t = useTranslations("Admin");
  const tc = useTranslations("AdminBranches");
  const router = useRouter();

  const [values, setValues] = useState<Record<string, unknown>>({
    is_main: false,
    name: "",
    en_name: "",
    address: "",
    location_details: "",
    en_location_details: "",
    phone: "",
    whatsapp: "",
    email: "",
    latitude: "",
    longitude: "",
    enabled: true,
    // Blank until the operator picks one - see `detectedTimezone`.
    timezone: "",
    booking_capacity: 1,
    // ⚠ No slot-interval field. Start times are spaced by each service's own
    // duration and by nothing else (`slot_step_minutes` in website-api) - a
    // per-branch grid applied to every service sold here and could only
    // disagree with the duration it sat beside.
    booking_min_notice_hours: 2,
    booking_max_days_ahead: 60,
  });
  // Kept out of `values` because the whole week is one editor, not a field the
  // generic AdminForm can render - it is submitted with the rest of the form.
  const [hours, setHours] = useState<BranchHoursRow[]>([]);
  // Same reasoning as `hours`, and the same submission: one editor, not a field
  // the generic AdminForm can render.
  const [pools, setPools] = useState<ResourcePoolRow[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const systemId = useSession()?.systemId ?? 0;
  // Prev/next through the CMS list, for the arrows beside Save.
  const siblings = useAdminSiblings({
    basePath: "/admin/branches",
    id,
    systemId,
    list: listBranches,
  });

  // ── The map screenshot ──────────────────────────────────────────────────
  //
  // `Branch.map_image` is a picture of this location that a booking
  // confirmation email shows - an email cannot draw a live map, and Django
  // cannot fetch map tiles for every message it sends, so the picture is taken
  // here, in the browser, at the one moment a map of this place is already on
  // screen. See `lib/map-capture.ts`.
  const pickerRef = useRef<MapPickerHandle>(null);
  /**
   * The coordinates and the screenshot as the **server** currently holds them,
   * which is what makes the capture conditional: a save that only changed the
   * phone number must not spend six tile requests and an upload re-taking a
   * picture of a pin that did not move.
   */
  const [savedPin, setSavedPin] = useState("");
  const [savedMap, setSavedMap] = useState<string | null>(null);
  /** The tenant's brandmark, worn by the captured pin exactly as the live maps' pins wear it. */
  const [brandmark, setBrandmark] = useState<string | null>(null);

  useEffect(() => {
    if (!isNew) {
      getBranch(Number(id))
        .then((data) => {
          setValues({
            is_main: data.is_main ?? false,
            name: data.name ?? "",
            en_name: data.en_name ?? "",
            address: data.address ?? "",
            location_details: data.location_details ?? "",
            en_location_details: data.en_location_details ?? "",
            phone: data.phone ?? "",
            whatsapp: data.whatsapp ?? "",
            email: data.email ?? "",
            latitude: data.latitude ?? "",
            longitude: data.longitude ?? "",
            enabled: data.enabled ?? true,
            timezone: data.timezone ?? "",
            booking_capacity: data.booking_capacity ?? 1,
            booking_min_notice_hours: data.booking_min_notice_hours ?? 2,
            booking_max_days_ahead: data.booking_max_days_ahead ?? 60,
          });
          setHours((data.hours as BranchHoursRow[] | undefined) ?? []);
          setPools(
            (data.resource_pools as ResourcePoolRow[] | undefined) ?? [],
          );
          setSavedPin(`${data.latitude ?? ""},${data.longitude ?? ""}`);
          setSavedMap((data.map_image as string | null) ?? null);
        })
        .catch(() => setError(t("errorLoad")))
        .finally(() => setLoading(false));
    }
  }, [id, isNew, t]);

  // The brandmark the captured pin wears - the tenant's mark, not its logo: the
  // pin's head is a 34 px circle that crops what it is given, so a wide wordmark
  // comes out as three letters from its own middle. A failure here costs the
  // capture its glyph and nothing else, so it is deliberately unreported.
  useEffect(() => {
    if (!systemId) return;
    getSystem(systemId)
      .then((data) => setBrandmark((data.img_brandmark as string) || null))
      .catch(() => setBrandmark(null));
  }, [systemId]);

  // What an unset timezone means: the operator's own zone, not the model's
  // "UTC" default. A branch left on UTC is not an inert default - opening hours
  // are read against it, so a Los Cabos shop that never touched the field opens
  // at 02:00 local, labels every slot in the wrong zone, and loses same-day
  // booking for most of the working day. The operator can still pick any zone.
  //
  // Read through `useSyncExternalStore` rather than in a `useState` initializer
  // because the zone only exists in the browser: the server would render the
  // fallback and the client would want another value, which is a hydration
  // mismatch on the select. The server snapshot keeps both renders on "UTC" and
  // React swaps in the real one straight after.
  const detectedTimezone = useSyncExternalStore(
    subscribeToNothing,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    () => "UTC",
  );
  const timezone = (values.timezone as string) || detectedTimezone;

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: Record<string, unknown> = {
        ...values,
        // The resolved value, not the raw blank one: a new branch is saved with
        // the zone the form was showing all along.
        timezone,
        system: systemId,
      };
      NULLABLE_ON_BLANK.forEach((k) => {
        if (payload[k] === "") payload[k] = null;
      });
      // The complete week, always sent: the API replaces the schedule with what
      // arrives, so omitting it would leave a removed day in place and an empty
      // array is a real instruction to close every day.
      payload.hours = hours;
      // Always sent, like `hours`, so an emptied list can actually clear the
      // pools. Unlike `hours` the API **upserts** these by id rather than
      // replacing them - `Booking.resource` points at a resource, and a
      // delete-and-recreate would strip the assigned boat off every appointment
      // on any save of this form.
      payload.resource_pools = pools;

      // The map screenshot, taken only when it would actually differ from the
      // stored one: the pin moved, or there is a pin and no picture yet. Omitted
      // from the payload means "leave the stored one alone" - which is what a
      // save that only touched the opening hours has to mean.
      const pinKey = `${values.latitude ?? ""},${values.longitude ?? ""}`;
      const hasPin = Boolean(values.latitude && values.longitude);
      if (!hasPin) {
        // A cleared pin clears the picture with it. A map of nowhere is worse
        // than no map, and the email's Directions button has no coordinate left
        // to point at anyway.
        if (savedMap) payload.map_image = null;
      } else if (pinKey !== savedPin || !savedMap) {
        // `null` here is an ordinary outcome, not a failure to report: a tile
        // host that answers without CORS headers, or an offline moment. The
        // coordinates save either way, and the customer still gets directions.
        const captured = await pickerRef.current?.capture();
        if (captured) payload.map_image = captured;
      }

      if (isNew) {
        const created = await createBranch(payload);
        setSuccess(t("saved"));
        router.replace(`/admin/branches/${created.id}`);
      } else {
        const updated = await updateBranch(Number(id), payload);
        // Re-read from the response rather than from what was sent: it is what
        // decides whether the *next* save re-captures, and the API is the one
        // that knows whether the upload actually landed.
        setSavedPin(`${updated.latitude ?? ""},${updated.longitude ?? ""}`);
        setSavedMap((updated.map_image as string | null) ?? null);
        setSuccess(t("saved"));
      }
    } catch (err) {
      // Surface the server's per-field validation message (e.g. a coordinate
      // out of range) rather than a generic toast that hides which field failed.
      setError(fieldErrorMessage(err) ?? t("errorSave"));
    } finally {
      setSaving(false);
    }
  };

  const fields: FieldDef[] = [
    { key: "is_main", label: tc("isMain"), type: "boolean" },
    { key: "name", label: tc("nameLabel") },
    { key: "en_name", label: tc("enNameLabel") },
    { key: "address", label: tc("address"), type: "textarea" },
    // Beside the address rather than merged into it: the address is what a
    // geocoder and a postal label want, this is what a customer standing
    // outside wants, and the storefront renders them as two labelled lines.
    {
      key: "location_details",
      label: tc("locationDetails"),
      type: "textarea",
      placeholder: tc("locationDetailsPlaceholder"),
    },
    // The same note in English, beside its Spanish original exactly as
    // `en_name` sits beside `name`. Left blank, the storefront falls back to
    // the line above rather than showing an English reader nothing.
    {
      key: "en_location_details",
      label: tc("enLocationDetails"),
      type: "textarea",
      placeholder: tc("locationDetailsPlaceholder"),
    },
    { key: "phone", label: tc("phone") },
    { key: "whatsapp", label: tc("whatsapp") },
    { key: "email", label: tc("email"), type: "text" },
    // ⚠ No Latitude / Longitude inputs. The coordinates are the map picker's
    // output (mounted in the slot below, ahead of the booking group) and are
    // shown there as a readout - two decimal boxes beside a map are a second
    // way to set the same value, and the one that can disagree with the pin the
    // screenshot was taken of. They are still ordinary fields in `values`, so
    // nothing about the payload changed.
    {
      key: "timezone",
      label: tc("timezone"),
      type: "select",
      options: timezoneOptions(),
    },
    { key: "booking_capacity", label: tc("capacity"), type: "number" },
    {
      key: "booking_min_notice_hours",
      label: tc("minNoticeHours"),
      type: "number",
    },
    {
      key: "booking_max_days_ahead",
      label: tc("maxDaysAhead"),
      type: "number",
    },
    { key: "enabled", label: t("enabled"), type: "boolean" },
  ];

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t("home"), href: "/" },
          { label: t("breadcrumbAdmin"), href: "/admin" },
          { label: tc("title"), href: "/admin/branches" },
          { label: isNew ? t("newItem") : t("edit") },
        ]}
      />
      <AdminForm
        title={
          isNew
            ? `${t("newItem")} - ${tc("title")}`
            : `${t("edit")} - ${tc("title")}`
        }
        editingName={isNew ? undefined : String(values.name ?? "")}
        fields={fields}
        values={{ ...values, timezone }}
        onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        onSubmit={handleSubmit}
        loading={loading}
        saving={saving}
        error={error}
        success={success}
        siblings={siblings}
        slots={[
          {
            // Between the contact details and the booking group: the pin is
            // part of *where this place is*, alongside the address it belongs
            // with, not part of how it takes appointments.
            beforeKey: "timezone",
            node: (
              <Box flexDirection="column" gap={8}>
                <MapPicker
                  ref={pickerRef}
                  latitude={String(values.latitude ?? "")}
                  longitude={String(values.longitude ?? "")}
                  onChange={(latitude, longitude) =>
                    setValues((prev) => ({ ...prev, latitude, longitude }))
                  }
                  pinIcon={brandmark}
                />
                {/* The coordinates as a readout, not as inputs - see the note
                    where the two number fields used to be. */}
                <Typography variant="caption" color="var(--foreground)">
                  {values.latitude && values.longitude
                    ? tc("coordinatesValue", {
                        latitude: String(values.latitude),
                        longitude: String(values.longitude),
                      })
                    : tc("coordinatesEmpty")}
                </Typography>
                <Typography
                  variant="caption"
                  color="var(--muted-foreground, #6b7280)"
                >
                  {tc("mapImageHint")}
                </Typography>
              </Box>
            ),
          },
        ]}
      >
        <BranchHoursEditor value={hours} onChange={setHours} />
        <ResourcePoolsEditor
          value={pools}
          onChange={setPools}
          branchCapacity={Number(values.booking_capacity) || 1}
        />
      </AdminForm>
    </>
  );
}
