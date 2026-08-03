"use client";

import { useState, useEffect, use } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@repo/i18n/navigation";
import { AdminForm, type FieldDef } from "@/components/admin/admin-form";
import {
  BranchHoursEditor,
  type BranchHoursRow,
} from "@/components/admin/branch-hours-editor";
import { timezoneOptions } from "@/components/admin/timezone-options";
import {
  getBranch,
  createBranch,
  updateBranch,
  AdminApiError,
} from "@/lib/admin-api";
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
  "phone",
  "whatsapp",
  "email",
  "latitude",
  "longitude",
];

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
    phone: "",
    whatsapp: "",
    email: "",
    latitude: "",
    longitude: "",
    enabled: true,
    timezone: "UTC",
    booking_capacity: 1,
    booking_slot_minutes: 30,
    booking_min_notice_hours: 2,
    booking_max_days_ahead: 60,
  });
  // Kept out of `values` because the whole week is one editor, not a field the
  // generic AdminForm can render - it is submitted with the rest of the form.
  const [hours, setHours] = useState<BranchHoursRow[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const systemId = useSession()?.systemId ?? 0;

  useEffect(() => {
    if (!isNew) {
      getBranch(Number(id))
        .then((data) => {
          setValues({
            is_main: data.is_main ?? false,
            name: data.name ?? "",
            en_name: data.en_name ?? "",
            address: data.address ?? "",
            phone: data.phone ?? "",
            whatsapp: data.whatsapp ?? "",
            email: data.email ?? "",
            latitude: data.latitude ?? "",
            longitude: data.longitude ?? "",
            enabled: data.enabled ?? true,
            timezone: data.timezone ?? "UTC",
            booking_capacity: data.booking_capacity ?? 1,
            booking_slot_minutes: data.booking_slot_minutes ?? 30,
            booking_min_notice_hours: data.booking_min_notice_hours ?? 2,
            booking_max_days_ahead: data.booking_max_days_ahead ?? 60,
          });
          setHours((data.hours as BranchHoursRow[] | undefined) ?? []);
        })
        .catch(() => setError(t("errorLoad")))
        .finally(() => setLoading(false));
    }
  }, [id, isNew, t]);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: Record<string, unknown> = { ...values, system: systemId };
      NULLABLE_ON_BLANK.forEach((k) => {
        if (payload[k] === "") payload[k] = null;
      });
      // The complete week, always sent: the API replaces the schedule with what
      // arrives, so omitting it would leave a removed day in place and an empty
      // array is a real instruction to close every day.
      payload.hours = hours;
      if (isNew) {
        const created = await createBranch(payload);
        setSuccess(t("saved"));
        router.replace(`/admin/branches/${created.id}`);
      } else {
        await updateBranch(Number(id), payload);
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
    { key: "phone", label: tc("phone") },
    { key: "whatsapp", label: tc("whatsapp") },
    { key: "email", label: tc("email"), type: "text" },
    { key: "latitude", label: tc("latitude"), type: "number" },
    { key: "longitude", label: tc("longitude"), type: "number" },
    {
      key: "timezone",
      label: tc("timezone"),
      type: "select",
      options: timezoneOptions(),
    },
    { key: "booking_capacity", label: tc("capacity"), type: "number" },
    { key: "booking_slot_minutes", label: tc("slotMinutes"), type: "number" },
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
        values={values}
        onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        onSubmit={handleSubmit}
        saving={saving}
        error={error}
        success={success}
      >
        <BranchHoursEditor value={hours} onChange={setHours} />
      </AdminForm>
    </>
  );
}
