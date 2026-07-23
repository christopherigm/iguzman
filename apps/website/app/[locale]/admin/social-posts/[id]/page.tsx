"use client";

import { useState, useEffect, useCallback, useMemo, useRef, use } from "react";
import { useTranslations } from "next-intl";
import { toJpeg } from "html-to-image";
import { useRouter } from "@repo/i18n/navigation";
import { useSession } from "@repo/auth/session-provider";
import { useLlmProxy, type LlmMessage } from "@repo/ui/use-llm";
import { Box } from "@repo/ui/core-elements/box";
import { Grid } from "@repo/ui/core-elements/grid";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import { Button } from "@repo/ui/core-elements/button";
import { Select } from "@repo/ui/core-elements/select";
import { Switch } from "@repo/ui/core-elements/switch";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Spinner } from "@repo/ui/core-elements/spinner";
import { Toast } from "@repo/ui/core-elements/toast";
import {
  getSocialPost,
  createSocialPost,
  updateSocialPost,
  getSystem,
  listProducts,
  listServices,
  listMenuItems,
  type SocialFormat,
  type SocialItemKind,
} from "@/lib/admin-api";
import {
  SOCIAL_TEMPLATES,
  DEFAULT_TEMPLATE_ID,
  getTemplate,
} from "@/components/admin/social-templates/registry";
import {
  FORMAT_DIMENSIONS,
  type FlyerData,
} from "@/components/admin/social-templates/types";

type Props = { params: Promise<{ locale: string; id: string }> };

/** A picked catalog item, flattened from the three list endpoints. */
interface ItemOption {
  kind: SocialItemKind;
  id: number;
  name: string;
  image: string | null;
  price: string | null;
  comparePrice: string | null;
  currency: string | null;
}

const KIND_ICON: Record<SocialItemKind, string> = {
  product: "📦",
  service: "🛠️",
  food: "🍽️",
};

/** On-screen preview width in CSS px; the flyer is drawn at 1080 and scaled to fit. */
const PREVIEW_W = 440;

/**
 * Route an API image URL through the same-origin Next optimizer and read it back
 * as a data URL, so the export canvas is never tainted by a cross-origin fetch.
 * Returns the original URL on failure (preview still shows; export may be blocked).
 */
async function toSameOriginDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  try {
    const optimized = `/_next/image?url=${encodeURIComponent(url)}&w=1080&q=90`;
    const res = await fetch(optimized);
    if (!res.ok) return url;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}

/** Whole-percent discount from a compare/sale pair, or null when there is none. */
function discountPercent(
  price: string | null,
  compare: string | null,
): number | null {
  const p = Number(price);
  const c = Number(compare);
  if (!Number.isFinite(p) || !Number.isFinite(c) || c <= 0 || p >= c)
    return null;
  return Math.round((1 - p / c) * 100);
}

/** Pull the JSON object out of an LLM reply that may be fenced or chatty. */
function parseLlmJson(
  text: string,
): { image_text?: string; caption?: string; hashtags?: unknown } | null {
  const fenced = text.replace(/```json/gi, "```").split("```");
  const candidate =
    fenced.length > 1 ? fenced[1] : text.slice(text.indexOf("{"));
  try {
    return JSON.parse((candidate ?? "").trim());
  } catch {
    try {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start >= 0 && end > start)
        return JSON.parse(text.slice(start, end + 1));
    } catch {
      /* fall through */
    }
    return null;
  }
}

export default function AdminSocialPostFormPage({ params }: Props) {
  const { id } = use(params);
  const isNew = id === "new";
  const t = useTranslations("Admin");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const systemId = useSession()?.systemId ?? 0;

  const [values, setValues] = useState<Record<string, unknown>>({
    name: "",
    related_kind: "product",
    related_id: null,
    template_id: DEFAULT_TEMPLATE_ID,
    format: "1x1",
    prompt: "",
    image_text: "",
    caption: "",
    hashtags: "",
    include_item_data: true,
    include_brand: true,
    include_hashtags: true,
    enabled: true,
  });

  const [itemOptions, setItemOptions] = useState<ItemOption[]>([]);
  const [selectedItem, setSelectedItem] = useState<ItemOption | null>(null);
  const [brand, setBrand] = useState<{
    logo: string | null;
    name: string | null;
    slogan: string | null;
    primary: string;
    secondary: string;
  }>({ logo: null, name: null, slogan: null, primary: "#2196f3", secondary: "#e040fb" });

  // Same-origin data URLs used by both the preview and the export.
  const [itemImageData, setItemImageData] = useState<string | undefined>();
  const [brandLogoData, setBrandLogoData] = useState<string | undefined>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const flyerRef = useRef<HTMLDivElement>(null);
  const {
    isGenerating,
    error: llmError,
    generate,
    reset: resetLlm,
  } = useLlmProxy({ temperature: 0.8 });

  // ── Load catalogs, brand, and (in edit mode) the post ──────────────────────
  useEffect(() => {
    if (!systemId) return;
    let cancelled = false;
    void (async () => {
      try {
        const [products, services, menuItems, system] = await Promise.all([
          listProducts(systemId),
          listServices(systemId),
          listMenuItems(systemId),
          getSystem(systemId),
        ]);
        const flatten = (
          rows: Record<string, unknown>[],
          kind: SocialItemKind,
        ): ItemOption[] =>
          rows.map((r) => ({
            kind,
            id: r.id as number,
            name: String(r.name ?? ""),
            image: (r.image as string | null) ?? null,
            price: (r.price as string | null) ?? null,
            comparePrice: (r.compare_price as string | null) ?? null,
            currency: (r.currency as string | null) ?? null,
          }));
        const options = [
          ...flatten(products, "product"),
          ...flatten(services, "service"),
          ...flatten(menuItems, "food"),
        ];
        if (cancelled) return;
        setItemOptions(options);
        setBrand({
          logo: (system.img_logo as string | null) ?? null,
          name: (system.site_name as string | null) ?? null,
          slogan: (system.slogan as string | null) ?? null,
          primary: String(system.primary_color ?? "#2196f3"),
          secondary: String(system.secondary_color ?? "#e040fb"),
        });

        if (!isNew) {
          const post = await getSocialPost(Number(id));
          if (cancelled) return;
          setValues({
            name: post.name ?? "",
            related_kind: post.related_kind ?? "product",
            related_id: post.related_id ?? null,
            template_id: post.template_id ?? DEFAULT_TEMPLATE_ID,
            format: post.format ?? "1x1",
            prompt: post.prompt ?? "",
            image_text: post.image_text ?? "",
            caption: post.caption ?? "",
            hashtags: post.hashtags ?? "",
            include_item_data: post.include_item_data ?? true,
            include_brand: post.include_brand ?? true,
            include_hashtags: post.include_hashtags ?? true,
            enabled: post.enabled ?? true,
          });
          const match =
            options.find(
              (o) => o.kind === post.related_kind && o.id === post.related_id,
            ) ??
            (post.item
              ? {
                  kind: post.item.kind,
                  id: post.item.id,
                  name: post.item.name ?? "",
                  image: post.item.image,
                  comparePrice: post.item.compare_price,
                  price: post.item.price,
                  currency: post.item.currency,
                }
              : null);
          setSelectedItem(match);
        }
      } catch {
        if (!cancelled) setError(t("errorLoad"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [systemId, id, isNew, t]);

  // Resolve item image + brand logo to same-origin data URLs whenever they change.
  // The setState lives inside an async IIFE (never the effect's synchronous body)
  // so it can't trigger the cascading-render lint.
  useEffect(() => {
    let cancelled = false;
    const src = selectedItem?.image;
    void (async () => {
      const resolved = src ? await toSameOriginDataUrl(src) : undefined;
      if (!cancelled) setItemImageData(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedItem?.image]);

  useEffect(() => {
    let cancelled = false;
    const src = brand.logo;
    void (async () => {
      const resolved = src ? await toSameOriginDataUrl(src) : undefined;
      if (!cancelled) setBrandLogoData(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [brand.logo]);

  const set = useCallback(
    (k: string, v: unknown) => setValues((prev) => ({ ...prev, [k]: v })),
    [],
  );

  // ── Derived flyer data ──────────────────────────────────────────────────────
  const format = values.format as SocialFormat;
  const flyerData: FlyerData = useMemo(
    () => ({
      format,
      itemImage: itemImageData ?? selectedItem?.image ?? undefined,
      itemName: selectedItem?.name,
      imageText: String(values.image_text ?? ""),
      price: selectedItem?.price ?? null,
      comparePrice: selectedItem?.comparePrice ?? null,
      currency: selectedItem?.currency ?? null,
      discountPercent: discountPercent(
        selectedItem?.price ?? null,
        selectedItem?.comparePrice ?? null,
      ),
      brandLogo: brandLogoData ?? brand.logo ?? undefined,
      brandName: brand.name ?? undefined,
      brandSlogan: brand.slogan ?? undefined,
      primaryColor: brand.primary,
      secondaryColor: brand.secondary,
      includeItemData: Boolean(values.include_item_data),
      includeBrand: Boolean(values.include_brand),
    }),
    [format, itemImageData, brandLogoData, brand, selectedItem, values],
  );

  const template = getTemplate(String(values.template_id));
  const TemplateComponent = template.Component;
  const dims = FORMAT_DIMENSIONS[format];
  const previewScale = PREVIEW_W / dims.w;

  const templateOptions = SOCIAL_TEMPLATES.map((tpl) => ({
    value: tpl.id,
    label: t(`socialTemplate_${tpl.id}`) ?? tpl.name,
  }));
  const formatOptions: { value: SocialFormat; label: string }[] = [
    { value: "1x1", label: t("socialFormatSquare") },
    { value: "4x5", label: t("socialFormatPortrait") },
  ];
  const itemSelectOptions = itemOptions.map((o) => ({
    value: `${o.kind}:${o.id}`,
    label: `${KIND_ICON[o.kind]}  ${o.name}`,
  }));

  const onSelectItem = (value: string) => {
    const [kind, rawId] = value.split(":");
    const match =
      itemOptions.find((o) => o.kind === kind && o.id === Number(rawId)) ?? null;
    setSelectedItem(match);
    set("related_kind", kind);
    set("related_id", match?.id ?? null);
  };

  // ── AI generation ───────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!selectedItem) return;
    resetLlm();
    setError(null);
    const disc = discountPercent(
      selectedItem.price,
      selectedItem.comparePrice,
    );
    const facts = [
      `Item: ${selectedItem.name}`,
      selectedItem.price ? `Price: ${selectedItem.price} ${selectedItem.currency ?? ""}` : "",
      disc ? `Discount: ${disc}% off (was ${selectedItem.comparePrice})` : "",
      brand.name ? `Brand: ${brand.name}` : "",
      brand.slogan ? `Slogan: ${brand.slogan}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const messages: LlmMessage[] = [
      {
        role: "system",
        content:
          "You are a social-media copywriter for a small business. Reply with ONLY a JSON object, no prose, no markdown fences, with exactly these keys: " +
          '"image_text" (a very short punchy headline for the flyer image, max ~7 words), ' +
          '"caption" (an engaging post caption of 1-3 sentences), ' +
          '"hashtags" (an array of 4-8 relevant hashtag strings, each starting with #). ' +
          "Write in the same language as the item name and the brief. Do not invent prices or facts beyond those given.",
      },
      {
        role: "user",
        content: `Write a social post for this item.\n\n${facts}\n\nBrief from the business:\n${String(values.prompt ?? "") || "(no extra brief; use the item and brand above)"}`,
      },
    ];
    try {
      const full = await generate(messages);
      const parsed = parseLlmJson(full);
      if (parsed) {
        setValues((prev) => ({
          ...prev,
          ...(parsed.image_text != null
            ? { image_text: String(parsed.image_text) }
            : {}),
          ...(parsed.caption != null
            ? { caption: String(parsed.caption) }
            : {}),
          ...(Array.isArray(parsed.hashtags)
            ? { hashtags: parsed.hashtags.join(" ") }
            : typeof parsed.hashtags === "string"
              ? { hashtags: parsed.hashtags }
              : {}),
        }));
      }
    } catch {
      setError(t("socialGenerateError"));
    }
  };

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        name: values.name,
        related_kind: values.related_kind,
        related_id: values.related_id,
        template_id: values.template_id,
        format: values.format,
        prompt: values.prompt || null,
        image_text: values.image_text || null,
        caption: values.caption || null,
        hashtags: values.hashtags || null,
        include_item_data: values.include_item_data,
        include_brand: values.include_brand,
        include_hashtags: values.include_hashtags,
        enabled: values.enabled,
      };
      if (isNew) {
        await createSocialPost(payload);
      } else {
        await updateSocialPost(Number(id), payload);
      }
      setSuccess(t("saved"));
      router.push("/admin/social-posts");
    } catch {
      setError(t("errorSave"));
    } finally {
      setSaving(false);
    }
  };

  // ── Download JPG ────────────────────────────────────────────────────────────
  const handleDownload = async () => {
    if (!flyerRef.current) return;
    setExporting(true);
    setError(null);
    try {
      const dataUrl = await toJpeg(flyerRef.current, {
        quality: 0.95,
        // The node is laid out at 1080 natural width regardless of the scaled
        // on-screen preview; capture at that true size.
        width: dims.w,
        height: dims.h,
        pixelRatio: 1,
        backgroundColor: "#ffffff",
        cacheBust: true,
      });
      const link = document.createElement("a");
      const base =
        String(values.name || selectedItem?.name || "social-post")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "") || "social-post";
      link.download = `${base}-${format}.jpg`;
      link.href = dataUrl;
      link.click();
    } catch {
      setError(t("socialExportError"));
    } finally {
      setExporting(false);
    }
  };

  const hashtags = String(values.hashtags ?? "").trim();
  const captionText = String(values.caption ?? "");
  const includeHashtags = Boolean(values.include_hashtags);
  const showCaptionBlock =
    captionText !== "" || (includeHashtags && hashtags !== "");

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
          { label: t("socialPosts"), href: "/admin/social-posts" },
          { label: isNew ? t("newItem") : t("edit") },
        ]}
      />
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        gap={16}
        marginBottom={24}
      >
        <Typography as="h1" variant="h3" margin={0}>
          {isNew ? t("socialPostNew") : t("socialPostEdit")}
        </Typography>
        <Box display="flex" alignItems="center" gap={8}>
          <Button
            text={tCommon("cancel")}
            size="md"
            href="/admin/social-posts"
          />
          <Button
            text={saving ? t("saving") : t("save")}
            kind="primary"
            size="md"
            onClick={() => void handleSubmit()}
            disabled={saving}
          />
        </Box>
      </Box>

      {/* Enabled status toggle, above the form — matches the CMS inner pages. */}
      <Box
        display="flex"
        alignItems="center"
        flexWrap="wrap"
        gap={24}
        marginBottom={24}
        paddingBottom={16}
        styles={{
          borderBottom:
            "1px solid color-mix(in srgb, var(--foreground) 20%, transparent)",
        }}
      >
        <Box display="flex" alignItems="center" gap={10}>
          <Switch
            checked={Boolean(values.enabled)}
            onChange={(v) => set("enabled", v)}
          />
          <Typography
            as="span"
            variant="body"
            fontWeight={500}
            color="var(--foreground)"
          >
            {t("enabled")}
          </Typography>
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* ── Controls ── */}
        <Grid size={{ xs: 12, sm: 6 }}>
          <Box flexDirection="column" gap={20}>
            <TextInput
              label={t("socialPostName")}
              value={String(values.name ?? "")}
              onChange={(v) => set("name", v)}
            />

            <Select
              label={t("socialPostItem")}
              value={
                values.related_id
                  ? `${values.related_kind}:${values.related_id}`
                  : ""
              }
              onChange={onSelectItem}
              options={itemSelectOptions}
            />

            <Box display="flex" gap={16}>
              <Box flex={1}>
                <Select
                  label={t("socialPostTemplate")}
                  value={String(values.template_id)}
                  onChange={(v) => set("template_id", v)}
                  options={templateOptions}
                />
              </Box>
              <Box flex={1}>
                <Select
                  label={t("socialPostFormat")}
                  value={String(values.format)}
                  onChange={(v) => set("format", v as SocialFormat)}
                  options={formatOptions}
                />
              </Box>
            </Box>

            <TextInput
              label={t("socialPostPrompt")}
              value={String(values.prompt ?? "")}
              onChange={(v) => set("prompt", v)}
              multirow
              rows={4}
              helperText={t("socialPostPromptHint")}
            />

            <Box display="flex" alignItems="center" gap={12} flexWrap="wrap">
              <Button
                text={t("socialGenerate")}
                kind="primary"
                size="md"
                icon="/icons/enhance.svg"
                onClick={() => void handleGenerate()}
                disabled={!selectedItem || isGenerating}
              />
              {isGenerating && <Spinner size={18} label={t("socialGenerating")} />}
            </Box>
            {llmError && (
              <Typography variant="body" color="var(--error, #c62828)">
                {t("socialGenerateError")}
              </Typography>
            )}

            <TextInput
              label={t("socialImageText")}
              value={String(values.image_text ?? "")}
              onChange={(v) => set("image_text", v)}
              helperText={t("socialImageTextHint")}
            />
            <TextInput
              label={t("socialCaption")}
              value={String(values.caption ?? "")}
              onChange={(v) => set("caption", v)}
              multirow
              rows={3}
            />
            <TextInput
              label={t("socialHashtags")}
              value={String(values.hashtags ?? "")}
              onChange={(v) => set("hashtags", v)}
            />

            {/* Toggles */}
            <Box flexDirection="column" gap={12}>
              <ToggleRow
                label={t("socialIncludeItemData")}
                checked={Boolean(values.include_item_data)}
                onChange={(v) => set("include_item_data", v)}
              />
              <ToggleRow
                label={t("socialIncludeBrand")}
                checked={Boolean(values.include_brand)}
                onChange={(v) => set("include_brand", v)}
              />
              <ToggleRow
                label={t("socialIncludeHashtags")}
                checked={Boolean(values.include_hashtags)}
                onChange={(v) => set("include_hashtags", v)}
              />
            </Box>
          </Box>
        </Grid>

        {/* ── Preview ── */}
        <Grid size={{ xs: 12, sm: 6 }}>
          <Box flexDirection="column" gap={12}>
            <Typography
              as="span"
              variant="label"
              fontWeight={600}
              color="var(--foreground)"
            >
              {t("socialPreview")}
            </Typography>

            {/* Scaled preview window; the flyer inside is drawn at 1080. */}
            <Box
              width={PREVIEW_W}
              height={dims.h * previewScale}
              borderRadius={10}
              elevation={5}
              styles={{ overflow: "hidden", maxWidth: "100%" }}
            >
              <div
                style={{
                  width: dims.w,
                  height: dims.h,
                  transform: `scale(${previewScale})`,
                  transformOrigin: "top left",
                }}
              >
                <div ref={flyerRef}>
                  <TemplateComponent data={flyerData} />
                </div>
              </div>
            </Box>

            {/* Post caption + hashtags */}
            {showCaptionBlock && (
              <Box
                flexDirection="column"
                gap={8}
                padding={16}
                borderRadius={10}
                width={PREVIEW_W}
                border="1px solid color-mix(in srgb, var(--foreground) 12%, transparent)"
                styles={{ maxWidth: "100%" }}
              >
                {captionText ? (
                  <Typography variant="body" color="var(--foreground)">
                    {captionText}
                  </Typography>
                ) : null}
                {includeHashtags && hashtags ? (
                  <Typography variant="body" color="var(--accent, #06b6d4)">
                    {hashtags}
                  </Typography>
                ) : null}
              </Box>
            )}

            <Box width={PREVIEW_W} styles={{ maxWidth: "100%" }}>
              <Button
                text={exporting ? t("socialExporting") : t("socialDownload")}
                kind="primary"
                size="lg"
                icon="/icons/download.svg"
                onClick={() => void handleDownload()}
                disabled={exporting || !selectedItem}
              />
            </Box>
          </Box>
        </Grid>
      </Grid>

      {/* Clears the fixed Save bar so trailing content is never hidden under it. */}
      <Box styles={{ height: 96 }} />

      {/* Fixed action bar, centered at the bottom of the viewport. */}
      <Box
        display="flex"
        alignItems="center"
        gap={12}
        padding={10}
        borderRadius={12}
        border="1px solid color-mix(in srgb, var(--foreground) 12%, transparent)"
        backgroundColor="var(--background)"
        styles={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          boxShadow:
            "0 4px 16px color-mix(in srgb, var(--foreground) 12%, transparent)",
          zIndex: 100,
        }}
      >
        <Button
          text={saving ? t("saving") : t("save")}
          kind="primary"
          size="lg"
          onClick={() => void handleSubmit()}
          disabled={saving}
        />
      </Box>

      {error && <Toast message={error} variant="error" />}
      {success && <Toast message={success} variant="success" />}
    </>
  );
}

/** A labelled Switch row, matching the hero-video section's toggle rows. */
function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Box display="flex" alignItems="center" gap={10}>
      <Switch checked={checked} onChange={onChange} />
      <Typography
        as="span"
        variant="body"
        fontWeight={500}
        color="var(--foreground)"
      >
        {label}
      </Typography>
    </Box>
  );
}
