"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { AdminForm, type FieldDef } from "@/components/admin/admin-form";
import { getSystem, updateSystem } from "@/lib/admin-api";
import { useSession } from "@repo/auth/session-provider";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";

/**
 * The System fields this page owns and writes - the tenant's long-form copy:
 * the company story and the three legal texts. Everything else on the record
 * belongs to /admin/system or /admin/logos-and-styles; the API PATCHes, so a
 * payload of just these keys leaves the rest untouched - which is what keeps
 * the pages from clobbering each other when more than one is open.
 */
const OWNED_FIELDS = [
  "about",
  "en_about",
  "mission",
  "en_mission",
  "vision",
  "en_vision",
  "privacy_policy",
  "en_privacy_policy",
  "terms_and_conditions",
  "en_terms_and_conditions",
  "user_data",
  "en_user_data",
] as const;

export default function AdminAboutPage() {
  const t = useTranslations("Admin");

  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(OWNED_FIELDS.map((k) => [k, ""])),
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const systemId = useSession()?.systemId ?? 0;

  useEffect(() => {
    if (!systemId) return;
    getSystem(systemId)
      .then((data) => {
        setValues(
          Object.fromEntries(OWNED_FIELDS.map((k) => [k, data[k] ?? ""])),
        );
      })
      .catch(() => setError(t("errorLoad")))
      .finally(() => setLoading(false));
  }, [systemId, t]);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: Record<string, unknown> = Object.fromEntries(
        OWNED_FIELDS.map((k) => [k, values[k]]),
      );
      await updateSystem(systemId, payload);
      setSuccess(t("saved"));
    } catch {
      setError(t("errorSave"));
    } finally {
      setSaving(false);
    }
  };

  const fields: FieldDef[] = [
    { key: "about", label: t("about") ?? "About (ES)", type: "textarea" },
    { key: "en_about", label: "About (EN)", type: "textarea" },
    { key: "mission", label: t("mission") ?? "Mission (ES)", type: "textarea" },
    { key: "en_mission", label: "Mission (EN)", type: "textarea" },
    { key: "vision", label: t("vision") ?? "Vision (ES)", type: "textarea" },
    { key: "en_vision", label: "Vision (EN)", type: "textarea" },
    {
      key: "privacy_policy",
      label: t("privacyPolicy") ?? "Privacy Policy (ES)",
      type: "textarea",
    },
    {
      key: "en_privacy_policy",
      label: "Privacy Policy (EN)",
      type: "textarea",
    },
    {
      key: "terms_and_conditions",
      label: t("terms") ?? "Terms & Conditions (ES)",
      type: "textarea",
    },
    {
      key: "en_terms_and_conditions",
      label: "Terms & Conditions (EN)",
      type: "textarea",
    },
    {
      key: "user_data",
      label: t("userData") ?? "User Data Policy (ES)",
      type: "textarea",
    },
    { key: "en_user_data", label: "User Data Policy (EN)", type: "textarea" },
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
          { label: t("aboutPage") },
        ]}
      />
      <AdminForm
        title={t("aboutPage")}
        hideCancel
        fields={fields}
        values={values}
        onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        onSubmit={handleSubmit}
        saving={saving}
        error={error}
        success={success}
      />
    </>
  );
}
