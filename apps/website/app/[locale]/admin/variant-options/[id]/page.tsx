"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { use } from "react";
import { useRouter } from "@repo/i18n/navigation";
import { AdminForm, type FieldDef } from "@/components/admin/admin-form";
import {
  getVariantOption,
  createVariantOption,
  updateVariantOption,
  checkSlug,
} from "@/lib/admin-api";
import { buildSlug } from "@/lib/slug-utils";
import { getUserFromToken } from "@/lib/auth";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";

type Props = { params: Promise<{ locale: string; id: string }> };

export default function AdminVariantOptionFormPage({ params }: Props) {
  const { id } = use(params);
  const isNew = id === "new";
  const t = useTranslations("Admin");
  const router = useRouter();

  const [values, setValues] = useState<Record<string, unknown>>({
    name: "",
    en_name: "",
    slug: "",
    enabled: true,
  });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const systemId = getUserFromToken()?.systemId ?? 0;

  // Auto-populate slug from name for new records (the slug field is read-only).
  // Derived during render rather than in an effect; the guard stops it looping
  // once the slug already matches the name.
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
        "variant-option",
        currentSlug,
        !isNew ? Number(id) : undefined,
      );
      if (!result.available) setSlugError(t("slugTaken"));
    } catch {
      /* ignore */
    }
  }, [values.slug, isNew, id, t]);

  useEffect(() => {
    if (!isNew) {
      getVariantOption(Number(id))
        .then((data) =>
          setValues({
            name: data.name ?? "",
            en_name: data.en_name ?? "",
            slug: data.slug ?? "",
            enabled: data.enabled ?? true,
          }),
        )
        .catch(() => setError(t("errorLoad")))
        .finally(() => setLoading(false));
    }
  }, [id, isNew, t]);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = { ...values, system: systemId };
      if (isNew) {
        const c = await createVariantOption(payload);
        setSuccess(t("saved"));
        router.replace(`/admin/variant-options/${c.id}`);
      } else {
        await updateVariantOption(Number(id), payload);
        setSuccess(t("saved"));
      }
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
          { label: t("variantOptions"), href: "/admin/variant-options" },
          { label: isNew ? t("newItem") : t("edit") },
        ]}
      />
      <AdminForm
        title={
          isNew
            ? `${t("newItem")} - ${t("variantOptions")}`
            : `${t("edit")} - ${t("variantOptions")}`
        }
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
