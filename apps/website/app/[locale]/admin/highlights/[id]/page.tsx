"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { use } from "react";
import { useRouter } from "@repo/i18n/navigation";
import { AdminForm, type FieldDef } from "@/components/admin/admin-form";
import { AdminImageField } from "@/components/admin/admin-image-field";
import { useAdminImageField } from "@/hooks/use-admin-image-field";
import {
  getHighlight,
  createHighlight,
  updateHighlight,
  checkSlug,
  listHighlights,
} from "@/lib/admin-api";
import { useAdminSiblings } from "@/hooks/use-admin-siblings";
import { buildSlug } from "@/lib/slug-utils";
import { useSession } from "@repo/auth/session-provider";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";

type Props = { params: Promise<{ locale: string; id: string }> };

const SIZE_OPTIONS = [
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "Extra Large" },
];

export default function AdminHighlightFormPage({ params }: Props) {
  const { id } = use(params);
  const isNew = id === "new";
  const t = useTranslations("Admin");
  const router = useRouter();

  const [values, setValues] = useState<Record<string, unknown>>({
    name: "",
    en_name: "",
    category: "",
    en_category: "",
    slug: "",
    description: "",
    en_description: "",
    short_description: "",
    en_short_description: "",
    icon: "",
    size: "md",
    sort_order: 0,
    href: "",
    enabled: true,
  });
  // The uploader and the stock-image picker, which are one field with two doors.
  const image = useAdminImageField();
  // Pulled out because the load effect below depends on it: this one callback is
  // stable, where `image` itself changes with every pick and keystroke - and an
  // effect keyed on the object would re-fetch the record each time.
  const loadImage = image.load;
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const systemId = useSession()?.systemId ?? 0;
  // Prev/next through the CMS list, for the arrows beside Save.
  const siblings = useAdminSiblings({
    basePath: "/admin/highlights",
    id,
    systemId,
    list: listHighlights,
  });

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
        "highlight",
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
      getHighlight(Number(id))
        .then((data) => {
          setValues({
            name: data.name ?? "",
            en_name: data.en_name ?? "",
            category: data.category ?? "",
            en_category: data.en_category ?? "",
            slug: data.slug ?? "",
            description: data.description ?? "",
            en_description: data.en_description ?? "",
            short_description: data.short_description ?? "",
            en_short_description: data.en_short_description ?? "",
            icon: data.icon ?? "",
            size: data.size ?? "md",
            sort_order: data.sort_order ?? 0,
            href: data.href ?? "",
            enabled: data.enabled ?? true,
          });
          loadImage(data.image, Number(id));
        })
        .catch(() => setError(t("errorLoad")))
        .finally(() => setLoading(false));
    }
  }, [id, isNew, loadImage, t]);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: Record<string, unknown> = { ...values, system: systemId };
      // Send null (not an omitted key) so a cleared field is actually cleared -
      // this is a PATCH, and an absent key means "leave unchanged".
      if (!payload.href) payload.href = null;
      if (!payload.icon) payload.icon = null;
      // The slug is read-only and derived server-side; omit it when empty.
      if (!payload.slug) delete payload.slug;
      // The image, and - when it came from a bank - the credit it owes, which
      // has to be in the same write as the file it describes.
      Object.assign(payload, image.payload());
      if (isNew) {
        const c = await createHighlight(payload);
        setSuccess(t("saved"));
        image.settle(c.image, c.id as number);
        router.replace(`/admin/highlights/${c.id}`);
      } else {
        const updated = await updateHighlight(Number(id), payload);
        setSuccess(t("saved"));
        image.settle(updated.image, Number(id));
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
    { key: "category", label: t("category") ?? "Category (ES)" },
    { key: "en_category", label: "Category (EN)" },
    {
      key: "slug",
      label: "Slug",
      type: "slug",
      disabled: true,
      fieldError: slugError,
    },
    {
      key: "size",
      label: t("size") ?? "Size",
      type: "select",
      options: SIZE_OPTIONS,
    },
    { key: "sort_order", label: t("order") ?? "Sort Order", type: "number" },
    { key: "icon", label: t("icon") ?? "Icon (CSS class or URL)" },
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
    { key: "enabled", label: t("enabled"), type: "boolean" },
  ];

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t("home"), href: "/" },
          { label: t("breadcrumbAdmin"), href: "/admin" },
          { label: t("highlights"), href: "/admin/highlights" },
          { label: isNew ? t("newItem") : t("edit") },
        ]}
      />
      <AdminForm
        title={
          isNew
            ? `${t("newItem")} - ${t("highlights")}`
            : `${t("edit")} - ${t("highlights")}`
        }
        editingName={isNew ? undefined : String(values.name ?? "")}
        fields={fields}
        values={values}
        onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
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
              ? `/highlights/${String(values.slug)}`
              : null
        }
        imagesSlot={
          <AdminImageField
            label={t("image") ?? "Image"}
            field={image}
            query={
              String(values.name ?? "").trim() ||
              String(values.en_name ?? "").trim()
            }
          />
        }
      />
    </>
  );
}
