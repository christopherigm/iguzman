"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@repo/i18n/navigation";
import { AdminForm, type FieldDef } from "@/components/admin/admin-form";
import { AdminImageField } from "@/components/admin/admin-image-field";
import { AdminAspectRatioField } from "@/components/admin/admin-aspect-ratio-field";
import {
  CatalogRefPicker,
  useCatalogRefOptions,
} from "@/components/admin/catalog-ref-picker";
import { SectionBandSection } from "@/components/admin/section-band-section";
import { useAdminImageField } from "@/hooks/use-admin-image-field";
import { useAdminSiblings } from "@/hooks/use-admin-siblings";
import {
  getHomepageFlyer,
  createHomepageFlyer,
  updateHomepageFlyer,
  getSystem,
  listHomepageFlyers,
} from "@/lib/admin-api";
import type { SpotlightRef } from "@/lib/system";
import { useSession } from "@repo/auth/session-provider";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";

type Props = { params: Promise<{ locale: string; id: string }> };

/** How many catalog items one flyer features - the API's own cap. */
const MAX_FLYER_ITEMS = 3;

/**
 * Loaded only so the band preview can paint on the tenant's real page colour -
 * the backgrounds themselves are edited on /admin/logos-and-styles. They are
 * stripped from the payload on save (this form writes a flyer, not the System),
 * exactly as /admin/highlights and /admin/featured-spotlight strip them.
 */
const PREVIEW_ONLY_FIELDS = {
  background_light: "#e5e5e5",
  background_dark: "#3c3c3c",
} as const;

/** A blank band means "no band", which the API stores as NULL, not "". */
const NULL_WHEN_BLANK = ["background"];

/**
 * One homepage flyer: its photograph, its bilingual copy, the up-to-three
 * catalog items it features, which side the photograph sits on, and the colour
 * band the slide is painted on.
 *
 * There is no Sort Order field: the order is dragged on the list page, which is
 * the same arrangement the flyers are read in, and a number typed here could
 * only be a second way to say it. `sort_order` still travels in `values` so a
 * save round-trips the position the list gave the row.
 *
 * The band controls are the very same `SectionBandSection` the two System-level
 * bands use - pointed at this row's own three columns instead of the System's -
 * so an operator tunes a flyer's edges with the control they already know, and
 * the preview renders the real `SectionBand` the slide will draw.
 */
export default function AdminHomepageFlyerFormPage({ params }: Props) {
  const { id } = use(params);
  const isNew = id === "new";
  const t = useTranslations("Admin");
  const router = useRouter();

  const [values, setValues] = useState<Record<string, unknown>>({
    aspect_ratio: "",
    name: "",
    en_name: "",
    description: "",
    en_description: "",
    image_side: "left",
    items: [] as SpotlightRef[],
    background: "",
    top_divider: "none",
    bottom_divider: "none",
    sort_order: 0,
    enabled: true,
    ...PREVIEW_ONLY_FIELDS,
  });
  // The uploader and the stock-image picker, which are one field with two doors.
  const image = useAdminImageField();
  // Pulled out because the load effect depends on it: this callback is stable,
  // where `image` itself changes with every pick and keystroke.
  const loadImage = image.load;
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const systemId = useSession()?.systemId ?? 0;
  const options = useCatalogRefOptions(systemId);
  const siblings = useAdminSiblings({
    basePath: "/admin/homepage-flyers",
    id,
    systemId,
    list: listHomepageFlyers,
  });

  useEffect(() => {
    if (isNew) return;
    getHomepageFlyer(Number(id))
      .then((data) => {
        setValues((prev) => ({
          ...prev,
          aspect_ratio: data.aspect_ratio ?? "",
          name: data.name ?? "",
          en_name: data.en_name ?? "",
          description: data.description ?? "",
          en_description: data.en_description ?? "",
          image_side: data.image_side ?? "left",
          items: (data.items as SpotlightRef[] | undefined) ?? [],
          background: data.background ?? "",
          top_divider: data.top_divider ?? "none",
          bottom_divider: data.bottom_divider ?? "none",
          sort_order: data.sort_order ?? 0,
          enabled: data.enabled ?? true,
        }));
        loadImage(data.image, Number(id));
      })
      .catch(() => setError(t("errorLoad")))
      .finally(() => setLoading(false));
  }, [id, isNew, loadImage, t]);

  // The tenant's page colours, for the band preview's backdrop only.
  useEffect(() => {
    if (!systemId) return;
    getSystem(systemId)
      .then((data) => {
        setValues((prev) => ({
          ...prev,
          ...Object.fromEntries(
            Object.entries(PREVIEW_ONLY_FIELDS).map(([k, fallback]) => [
              k,
              data[k] ?? fallback,
            ]),
          ),
        }));
      })
      .catch(() => {
        // The preview falls back to its neutral defaults; nothing else on the
        // page depends on the System record.
      });
  }, [systemId]);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: Record<string, unknown> = { ...values, system: systemId };
      // Never write back a stale copy of /admin/logos-and-styles' work.
      Object.keys(PREVIEW_ONLY_FIELDS).forEach((k) => delete payload[k]);
      NULL_WHEN_BLANK.forEach((k) => {
        if (payload[k] === "") payload[k] = null;
      });
      // The image, and - when it came from a bank - the credit it owes, which
      // has to be in the same write as the file it describes.
      Object.assign(payload, image.payload());
      if (isNew) {
        const created = await createHomepageFlyer(payload);
        setSuccess(t("saved"));
        image.settle(created.image, created.id as number);
        router.replace(`/admin/homepage-flyers/${created.id}`);
      } else {
        const updated = await updateHomepageFlyer(Number(id), payload);
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
    { key: "name", label: t("name"), required: true },
    { key: "en_name", label: "Name (EN)" },
    {
      key: "description",
      label: t("description") ?? "Description (ES)",
      type: "textarea",
    },
    { key: "en_description", label: "Description (EN)", type: "textarea" },
    {
      key: "image_side",
      label: t("flyerImageSide"),
      type: "select",
      options: [
        { value: "left", label: t("flyerImageSideLeft") },
        { value: "right", label: t("flyerImageSideRight") },
      ],
    },
    { key: "enabled", label: t("enabled"), type: "boolean" },
  ];

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t("home"), href: "/" },
          { label: t("breadcrumbAdmin"), href: "/admin" },
          { label: t("homepageFlyers"), href: "/admin/homepage-flyers" },
          { label: isNew ? t("newItem") : t("edit") },
        ]}
      />
      <AdminForm
        title={
          isNew
            ? `${t("newItem")} - ${t("homepageFlyers")}`
            : `${t("edit")} - ${t("homepageFlyers")}`
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
        imagesSlot={
          <AdminImageField
            label={t("image") ?? "Image"}
            field={image}
            query={
              String(values.name ?? "").trim() ||
              String(values.en_name ?? "").trim()
            }
            afterLabel={
              <AdminAspectRatioField
                value={values.aspect_ratio}
                onChange={(v) =>
                  setValues((prev) => ({ ...prev, aspect_ratio: v }))
                }
                scope="image"
              />
            }
          />
        }
      >
        {/* The items this flyer sells - the same picker the Featured
            Spotlight's trio uses, at this model's own cap. */}
        <CatalogRefPicker
          label={t("flyerItemsLabel")}
          slots={MAX_FLYER_ITEMS}
          value={(values.items as SpotlightRef[] | undefined) ?? []}
          onChange={(refs) => setValues((prev) => ({ ...prev, items: refs }))}
          options={options}
          size={{ xs: 12, sm: 6 }}
        />

        {/* This flyer's own band. Per-record rather than per-section: every
            slide is its own band, which is what makes the slider read as a stack
            of flyers instead of one panel whose contents change. */}
        <SectionBandSection
          title={t("flyerStyle")}
          previewHeading={String(values.name ?? "") || t("homepageFlyers")}
          gradientLabel={t("flyerBg")}
          backgroundKey="background"
          topDividerKey="top_divider"
          bottomDividerKey="bottom_divider"
          values={values}
          onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
        />
      </AdminForm>
    </>
  );
}
