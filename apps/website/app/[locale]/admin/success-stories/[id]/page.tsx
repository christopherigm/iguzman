"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { use } from "react";
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
import {
  getSuccessStory,
  createSuccessStory,
  updateSuccessStory,
  createSuccessStoryImage,
  createStockGalleryRows,
  type StockImageFile,
  updateSuccessStoryImage,
  deleteSuccessStoryImage,
  checkSlug,
  listSuccessStories,
} from "@/lib/admin-api";
import { useAdminSiblings } from "@/hooks/use-admin-siblings";
import { buildSlug } from "@/lib/slug-utils";
import { useSitePrefix } from "../../site-prefix-provider";
import { useSession } from "@repo/auth/session-provider";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";

/** How many photos one story's gallery holds, uploads and picks together. */
const GALLERY_MAX = 20;

type Props = { params: Promise<{ locale: string; id: string }> };

export default function AdminSuccessStoryFormPage({ params }: Props) {
  const { id } = use(params);
  const isNew = id === "new";
  const t = useTranslations("Admin");
  const router = useRouter();

  const [values, setValues] = useState<Record<string, unknown>>({
    aspect_ratio: "",
    name: "",
    en_name: "",
    slug: "",
    description: "",
    en_description: "",
    short_description: "",
    en_short_description: "",
    href: "",
    enabled: true,
  });
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
    basePath: "/admin/success-stories",
    id,
    systemId,
    list: listSuccessStories,
  });

  // The tenant's slug namespace, from the CMS-wide provider. Null while the
  // System loads, which is what the guard below is for: `buildSlug(name, "")`
  // would give this record a leading hyphen and no namespace at all.
  const sitePrefix = useSitePrefix();
  // Auto-populate slug from name for new records (the slug field is read-only).
  // Derived during render rather than in an effect; the guard stops it looping
  // once the slug already matches the name.
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
        "success-story",
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
      getSuccessStory(Number(id))
        .then((data) => {
          setValues({
            aspect_ratio: data.aspect_ratio ?? "",
            name: data.name ?? "",
            en_name: data.en_name ?? "",
            slug: data.slug ?? "",
            description: data.description ?? "",
            en_description: data.en_description ?? "",
            short_description: data.short_description ?? "",
            en_short_description: data.en_short_description ?? "",
            href: data.href ?? "",
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
      // The slug is read-only and derived server-side; omit it when empty.
      if (!payload.slug) delete payload.slug;
      // The cover, and - when it came from a bank - the credit it owes, which
      // has to be in the same write as the file it describes.
      Object.assign(payload, image.payload());

      let storyId: number;
      if (isNew) {
        const c = await createSuccessStory(payload);
        storyId = c.id as number;
        image.settle(c.image, storyId);
      } else {
        const updated = await updateSuccessStory(Number(id), payload);
        storyId = Number(id);
        image.settle(updated.image, storyId);
      }

      // Handle deleted gallery images
      for (const imgId of pendingDeletedGalleryIds) {
        await deleteSuccessStoryImage(storyId, imgId).catch(() => null);
      }
      // Handle new gallery images
      for (let i = 0; i < pendingNewGallery.length; i++) {
        await createSuccessStoryImage(storyId, {
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
        (payload) => createSuccessStoryImage(storyId, payload),
      );
      setStockImages([]);
      // Update sort orders for existing gallery images
      for (let i = 0; i < pendingGalleryOrder.length; i++) {
        await updateSuccessStoryImage(storyId, pendingGalleryOrder[i] ?? 0, {
          sort_order: i,
        }).catch(() => null);
      }

      setSuccess(t("saved"));
      if (isNew) router.replace(`/admin/success-stories/${storyId}`);
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
          { label: t("successStories"), href: "/admin/success-stories" },
          { label: isNew ? t("newItem") : t("edit") },
        ]}
      />
      <AdminForm
        title={
          isNew
            ? `${t("newItem")} - ${t("successStories")}`
            : `${t("edit")} - ${t("successStories")}`
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
              ? `/blog/${String(values.slug)}`
              : null
        }
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
