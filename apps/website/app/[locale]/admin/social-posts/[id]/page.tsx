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
import { Slider } from "@repo/ui/core-elements/slider";
import { Switch } from "@repo/ui/core-elements/switch";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Spinner } from "@repo/ui/core-elements/spinner";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { Toast } from "@repo/ui/core-elements/toast";
import type { HeroLogoBackground } from "@repo/ui/hero";
import {
  AdminImageUploader,
  type NewImage,
} from "@/components/admin-image-uploader/admin-image-uploader";
import { SiblingArrow } from "@/components/admin/sibling-arrows";
import { useAdminSiblings } from "@/hooks/use-admin-siblings";
import { toSameOriginDataUrl } from "@/lib/same-origin-image";
import {
  catalogOptionLabel,
  catalogRowCategory,
} from "@/components/admin/catalog-option-label";
import {
  LOGO_BACKGROUND_SHAPES,
  LOGO_BACKGROUND_LABEL_KEY,
  SCALE_STEPS,
} from "@/components/admin/logo-background-options";
import {
  getSocialPost,
  createSocialPost,
  updateSocialPost,
  listSocialPosts,
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
  /** The category the row is filed under, or "" - see `catalogRowCategory`. */
  category: string;
  image: string | null;
  price: string | null;
  comparePrice: string | null;
  currency: string | null;
}

/**
 * The post's own artwork fields. Tracked outside `values` because each is an
 * uploader with its own existing/pending pair, exactly as the system page tracks
 * its images; `handleSubmit` folds the pending base64 back into the payload.
 */
const IMAGE_FIELDS = ["img_item", "img_background"] as const;
type ImageField = (typeof IMAGE_FIELDS)[number];

interface ImageState {
  existing: { id: number; url: string }[];
  pending: NewImage[];
}

const EMPTY_IMAGES: Record<ImageField, ImageState> = {
  img_item: { existing: [], pending: [] },
  img_background: { existing: [], pending: [] },
};

/**
 * Largest on-screen preview width in CSS px; the flyer is drawn at 1080 and
 * scaled to fit. On a narrow grid item the measured column width wins, so the
 * preview shrinks instead of bleeding out of its cell.
 */
const PREVIEW_MAX_W = 440;

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
  // Prev/next through the CMS list, for the arrows beside Save.
  const siblings = useAdminSiblings({
    basePath: "/admin/social-posts",
    id,
    systemId,
    list: listSocialPosts,
  });

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
    badge_shape: "circle",
    badge_scale: 100,
    badge_image_scale: 100,
    brand_logo_background: "none",
    brand_logo_background_scale: 70,
    brand_logo_scale: 100,
    enabled: true,
  });

  const [images, setImages] =
    useState<Record<ImageField, ImageState>>(EMPTY_IMAGES);

  const [itemOptions, setItemOptions] = useState<ItemOption[]>([]);
  const [selectedItem, setSelectedItem] = useState<ItemOption | null>(null);
  const [brand, setBrand] = useState<{
    logo: string | null;
    name: string | null;
    slogan: string | null;
    primary: string;
    secondary: string;
  }>({
    logo: null,
    name: null,
    slogan: null,
    primary: "#2196f3",
    secondary: "#e040fb",
  });

  // Same-origin data URLs used by both the preview and the export.
  const [itemImageData, setItemImageData] = useState<string | undefined>();
  const [brandLogoData, setBrandLogoData] = useState<string | undefined>();
  const [overrideImageData, setOverrideImageData] = useState<string>();
  const [backgroundImageData, setBackgroundImageData] = useState<string>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const flyerRef = useRef<HTMLDivElement>(null);

  // The preview column is half a Grid at `sm` and up but full width at `xs`,
  // where it can be far narrower than PREVIEW_MAX_W. Measure the column and
  // scale the flyer to whichever is smaller, so it always fits its cell.
  const [previewWidth, setPreviewWidth] = useState(PREVIEW_MAX_W);
  const previewColumnRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    // Fires once on observe, so there is no synchronous measure (and no
    // set-state-in-effect) to pair with it.
    const observer = new ResizeObserver(([entry]) => {
      const available = entry?.contentRect.width ?? 0;
      if (available > 0) setPreviewWidth(Math.min(PREVIEW_MAX_W, available));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

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
            category: catalogRowCategory(r),
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
        // A native <select> with no matching option still *shows* its first
        // entry, so a new post looked like it had that item picked while the
        // preview (and the Generate/Download buttons) had nothing selected.
        // Adopt the first option so the state matches what the control says.
        const first = options[0];
        if (isNew && first) {
          setSelectedItem(first);
          setValues((prev) => ({
            ...prev,
            related_kind: first.kind,
            related_id: first.id,
          }));
        }
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
            badge_shape: post.badge_shape ?? "circle",
            badge_scale: post.badge_scale ?? 100,
            badge_image_scale: post.badge_image_scale ?? 100,
            brand_logo_background: post.brand_logo_background ?? "none",
            brand_logo_background_scale:
              post.brand_logo_background_scale ?? 100,
            brand_logo_scale: post.brand_logo_scale ?? 100,
            enabled: post.enabled ?? true,
          });
          setImages({
            img_item: {
              existing: post.img_item
                ? [{ id: post.id, url: post.img_item }]
                : [],
              pending: [],
            },
            img_background: {
              existing: post.img_background
                ? [{ id: post.id, url: post.img_background }]
                : [],
              pending: [],
            },
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
                  // The API's snapshot carries no category, and none is needed:
                  // this stand-in only ever feeds the preview - it is not in
                  // `itemOptions`, so no option label is ever built from it.
                  category: "",
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

  // The post's own artwork. A pending upload is already a data URL, so it needs
  // no round-trip; a stored one comes back as an API URL and goes through the
  // optimizer like every other image the export touches.
  const overrideSrc =
    images.img_item.pending[0]?.preview ?? images.img_item.existing[0]?.url;
  const backgroundSrc =
    images.img_background.pending[0]?.preview ??
    images.img_background.existing[0]?.url;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const resolved = overrideSrc
        ? await toSameOriginDataUrl(overrideSrc)
        : undefined;
      if (!cancelled) setOverrideImageData(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [overrideSrc]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const resolved = backgroundSrc
        ? await toSameOriginDataUrl(backgroundSrc)
        : undefined;
      if (!cancelled) setBackgroundImageData(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [backgroundSrc]);

  const set = useCallback(
    (k: string, v: unknown) => setValues((prev) => ({ ...prev, [k]: v })),
    [],
  );

  const onImageChange = useCallback(
    (field: ImageField, newImages: NewImage[], orderedExistingIds: number[]) =>
      setImages((prev) => ({
        ...prev,
        [field]: {
          existing: prev[field].existing.filter((img) =>
            orderedExistingIds.includes(img.id),
          ),
          pending: newImages,
        },
      })),
    [],
  );

  // ── Derived flyer data ──────────────────────────────────────────────────────
  const format = values.format as SocialFormat;
  // Guarded like the hero's: an unknown shape (a legacy row, a hand-written
  // payload) would otherwise leave the badge unclipped with nothing to say why.
  const badgeShape = (
    LOGO_BACKGROUND_SHAPES.includes(values.badge_shape as HeroLogoBackground)
      ? values.badge_shape
      : "circle"
  ) as HeroLogoBackground;
  // Same guard for the brand logo's own plate; its neutral value is "none" (no
  // plate), which is how every post rendered before this control existed.
  const brandLogoBackground = (
    LOGO_BACKGROUND_SHAPES.includes(
      values.brand_logo_background as HeroLogoBackground,
    )
      ? values.brand_logo_background
      : "none"
  ) as HeroLogoBackground;
  const flyerData: FlyerData = useMemo(
    () => ({
      format,
      // The uploaded override wins over the catalog photo in every template -
      // that is the whole point of the field.
      //
      // ⚠ Deliberately no `?? selectedItem?.image` fallback, and none on
      // `brandLogo` below: those are the raw CDN URLs, and a cross-origin image
      // inside the captured node taints the canvas, so `toDataURL` throws and
      // the download fails outright. `toSameOriginDataUrl` already returns the
      // original URL when it cannot proxy, so the only thing a fallback bought
      // was the frame before the round-trip resolves - during which a press of
      // Download captured a URL that could not be exported. The templates draw
      // their own placeholder for an absent image, which is what that frame
      // shows now. Same rule as the coupon flyer.
      itemImage: overrideImageData ?? itemImageData,
      backgroundImage: backgroundImageData,
      itemName: selectedItem?.name,
      imageText: String(values.image_text ?? ""),
      price: selectedItem?.price ?? null,
      comparePrice: selectedItem?.comparePrice ?? null,
      currency: selectedItem?.currency ?? null,
      discountPercent: discountPercent(
        selectedItem?.price ?? null,
        selectedItem?.comparePrice ?? null,
      ),
      brandLogo: brandLogoData,
      brandName: brand.name ?? undefined,
      brandSlogan: brand.slogan ?? undefined,
      primaryColor: brand.primary,
      secondaryColor: brand.secondary,
      includeItemData: Boolean(values.include_item_data),
      includeBrand: Boolean(values.include_brand),
      badgeShape: badgeShape,
      badgeScale: Number(values.badge_scale ?? 100),
      badgeImageScale: Number(values.badge_image_scale ?? 100),
      brandLogoBackground,
      brandLogoBackgroundScale: Number(
        values.brand_logo_background_scale ?? 100,
      ),
      brandLogoScale: Number(values.brand_logo_scale ?? 100),
    }),
    [
      format,
      itemImageData,
      overrideImageData,
      backgroundImageData,
      brandLogoData,
      brand,
      selectedItem,
      values,
      badgeShape,
      brandLogoBackground,
    ],
  );

  const template = getTemplate(String(values.template_id));
  const TemplateComponent = template.Component;
  const dims = FORMAT_DIMENSIONS[format];
  const previewScale = previewWidth / dims.w;

  const templateOptions = SOCIAL_TEMPLATES.map((tpl) => ({
    value: tpl.id,
    label: t(`socialTemplate_${tpl.id}`) ?? tpl.name,
  }));
  const formatOptions: { value: SocialFormat; label: string }[] = [
    { value: "1x1", label: t("socialFormatSquare") },
    { value: "4x5", label: t("socialFormatPortrait") },
  ];
  // Family glyph, then the category the item is filed under, then its name -
  // "🍽️ Pizzas · Margherita". The category is what tells two similarly-named
  // rows apart in a list of two hundred; the family label only stands in when a
  // row has no category. See `components/admin/catalog-option-label.ts`.
  const ITEM_FAMILY_LABEL: Record<SocialItemKind, string> = {
    product: t("spotlightKindProduct"),
    service: t("spotlightKindService"),
    food: t("spotlightKindFood"),
  };
  const itemSelectOptions = itemOptions.map((o) => ({
    value: `${o.kind}:${o.id}`,
    label: catalogOptionLabel(
      o.kind,
      o.category || ITEM_FAMILY_LABEL[o.kind],
      o.name,
    ),
  }));

  const onSelectItem = (value: string) => {
    const [kind, rawId] = value.split(":");
    const match =
      itemOptions.find((o) => o.kind === kind && o.id === Number(rawId)) ??
      null;
    setSelectedItem(match);
    set("related_kind", kind);
    set("related_id", match?.id ?? null);
  };

  // ── AI generation ───────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!selectedItem) return;
    resetLlm();
    setError(null);
    const disc = discountPercent(selectedItem.price, selectedItem.comparePrice);
    const facts = [
      `Item: ${selectedItem.name}`,
      selectedItem.price
        ? `Price: ${selectedItem.price} ${selectedItem.currency ?? ""}`
        : "",
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
      const payload: Record<string, unknown> = {
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
        badge_shape: values.badge_shape,
        badge_scale: values.badge_scale,
        badge_image_scale: values.badge_image_scale,
        brand_logo_background: values.brand_logo_background,
        brand_logo_background_scale: values.brand_logo_background_scale,
        brand_logo_scale: values.brand_logo_scale,
        enabled: values.enabled,
      };
      // Artwork travels as base64 (what the uploader produces). A field is only
      // named when it changed: a pending upload replaces it, an emptied uploader
      // clears it, and an untouched one is left out so the API keeps what it has.
      IMAGE_FIELDS.forEach((field) => {
        const state = images[field];
        if (state.pending.length > 0) {
          payload[field] = state.pending[0]?.base64;
        } else if (state.existing.length === 0) {
          payload[field] = null;
        }
      });
      let postId: number;
      if (isNew) {
        const created = await createSocialPost(payload);
        postId = created.id as number;
      } else {
        await updateSocialPost(Number(id), payload);
        postId = Number(id);
      }
      // Stay on the form and show the success toast rather than bouncing to the
      // list, matching the other admin edit pages. A new record swaps its URL
      // segment to its own id so a second save updates instead of re-creating.
      setSuccess(t("saved"));
      if (isNew) router.replace(`/admin/social-posts/${postId}`);
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
      const node = flyerRef.current;
      const options = {
        quality: 0.95,
        // The node is laid out at 1080 natural width regardless of the scaled
        // on-screen preview; capture at that true size.
        width: dims.w,
        height: dims.h,
        pixelRatio: 1,
        backgroundColor: "#ffffff",
        cacheBust: true,
      };
      // `html-to-image` walks every stylesheet on the page to inline the
      // @font-face rules the flyer uses, and reading the rules of a stylesheet
      // the browser considers cross-origin throws a SecurityError. The tenant's
      // own Google Fonts link is loaded in CORS mode for exactly this reason
      // (see `[locale]/layout.tsx`), but a stylesheet this app does not control
      // - a browser extension's, most often - can still poison the walk. When
      // that happens, fall back to a capture with the fonts skipped: the flyer
      // comes out in a fallback face, which is a far better answer than a
      // download button that refuses for a reason nobody can see. Same fallback
      // as the coupon flyer, which draws through the same library.
      const dataUrl = await toJpeg(node, options).catch(() =>
        toJpeg(node, { ...options, skipFonts: true }),
      );
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
  const showCaptionBlock = captionText !== "" || hashtags !== "";

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
            text={isNew ? tCommon("cancel") : t("back")}
            size="md"
            href="/admin/social-posts"
          />
          <Button
            text={saving ? t("saving") : t("save")}
            kind="primary"
            size="md"
            onClick={() => void handleSubmit()}
            disabled={saving || loading}
          />
        </Box>
      </Box>

      {/* Save progress, directly under the header action row — mirrors the
          standard AdminForm so a save shows the same feedback everywhere. */}
      {(saving || loading) && <ProgressBar />}

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

            {/* ── Artwork ──
                The item's own photo and no backdrop is the default; both fields
                are overrides, so an untouched post renders exactly as before.

                Deliberately `xs: 6` (no `sm` override): the two uploaders are a
                pair - a photo and the backdrop behind it - and only read as a
                pair side by side, so they stay two-up down to the narrowest
                phone rather than stacking below `sm` like the rest of the page.
                The dropzone is square and scales with its cell, so a half-width
                column is still a usable target; only the caption under it wraps
                onto more lines, which is why each caption breaks long words
                instead of pushing its column wider. */}
            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <Box flexDirection="column" gap={8}>
                  <Typography
                    variant="label"
                    styles={{ overflowWrap: "anywhere" }}
                  >
                    {t("socialImageOverride")}
                  </Typography>
                  <AdminImageUploader
                    existingImages={images.img_item.existing}
                    onChange={(newImages, _deleted, orderedExistingIds) =>
                      onImageChange("img_item", newImages, orderedExistingIds)
                    }
                    maxImages={1}
                    compact
                  />
                  <Typography
                    variant="caption"
                    styles={{ overflowWrap: "anywhere" }}
                  >
                    {t("socialImageOverrideHint")}
                  </Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Box flexDirection="column" gap={8}>
                  <Typography
                    variant="label"
                    styles={{ overflowWrap: "anywhere" }}
                  >
                    {t("socialBackgroundImage")}
                  </Typography>
                  <AdminImageUploader
                    existingImages={images.img_background.existing}
                    onChange={(newImages, _deleted, orderedExistingIds) =>
                      onImageChange(
                        "img_background",
                        newImages,
                        orderedExistingIds,
                      )
                    }
                    maxImages={1}
                    compact
                  />
                  <Typography
                    variant="caption"
                    styles={{ overflowWrap: "anywhere" }}
                  >
                    {template.supportsBackground
                      ? t("socialBackgroundImageHint")
                      : t("socialBackgroundImageUnused")}
                  </Typography>
                </Box>
              </Grid>
            </Grid>

            {/* The badge controls only exist for templates that frame the photo;
                elsewhere they would be controls with no effect. Hiding them keeps
                the stored values, so switching back restores what was picked. */}
            {template.supportsBadge && (
              <>
                <Select
                  label={t("socialBadgeShape")}
                  value={badgeShape}
                  onChange={(v) => set("badge_shape", v)}
                  options={LOGO_BACKGROUND_SHAPES.map((value) => ({
                    value,
                    label: t(LOGO_BACKGROUND_LABEL_KEY[value]),
                  }))}
                />
                {badgeShape !== "none" && (
                  <Slider
                    label={t("socialBadgeSize")}
                    steps={SCALE_STEPS}
                    value={Number(values.badge_scale ?? 100)}
                    onChange={(v) => set("badge_scale", Number(v))}
                  />
                )}
                <Slider
                  label={t("socialBadgeImageSize")}
                  steps={SCALE_STEPS}
                  value={Number(values.badge_image_scale ?? 100)}
                  onChange={(v) => set("badge_image_scale", Number(v))}
                />
              </>
            )}

            {/* Between the artwork and the copy: these two decide what else the
                flyer image carries, so they belong with the image, not with the
                post text below. */}
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

              {/* The brand logo's own plate - every template draws the logo, so
                  unlike the item badge above these are not template-specific.
                  They hang off the toggle: with the brand off there is no logo
                  to put a plate behind. Only the *plate* slider is shape-gated
                  (with no plate there is nothing to size); the logo slider is
                  always offered, because the logo is drawn either way and the
                  bare one needs sizing just as much. Hiding the plate slider
                  keeps its stored value, so turning a shape back on restores
                  what was picked. */}
              {Boolean(values.include_brand) && (
                <Box flexDirection="column" gap={12} paddingTop={4}>
                  <Select
                    label={t("socialBrandLogoBackground")}
                    value={brandLogoBackground}
                    onChange={(v) => set("brand_logo_background", v)}
                    options={LOGO_BACKGROUND_SHAPES.map((value) => ({
                      value,
                      label: t(LOGO_BACKGROUND_LABEL_KEY[value]),
                    }))}
                  />
                  {brandLogoBackground !== "none" && (
                    <Slider
                      label={t("socialBrandLogoBgSize")}
                      steps={SCALE_STEPS}
                      value={Number(values.brand_logo_background_scale ?? 100)}
                      onChange={(v) =>
                        set("brand_logo_background_scale", Number(v))
                      }
                    />
                  )}
                  <Slider
                    label={t("socialBrandLogoSize")}
                    steps={SCALE_STEPS}
                    value={Number(values.brand_logo_scale ?? 100)}
                    onChange={(v) => set("brand_logo_scale", Number(v))}
                  />
                </Box>
              )}
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
                disabled={!selectedItem || isGenerating || loading}
              />
              {isGenerating && (
                <Spinner size={18} label={t("socialGenerating")} />
              )}
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
          </Box>
        </Grid>

        {/* ── Preview ── */}
        <Grid size={{ xs: 12, sm: 6 }}>
          <Box ref={previewColumnRef} flexDirection="column" gap={12}>
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
              width={previewWidth}
              height={dims.h * previewScale}
              borderRadius={10}
              elevation={5}
              styles={{ overflow: "hidden" }}
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
                width={previewWidth}
                border="1px solid color-mix(in srgb, var(--foreground) 12%, transparent)"
              >
                {captionText ? (
                  <Typography variant="body" color="var(--foreground)">
                    {captionText}
                  </Typography>
                ) : null}
                {hashtags ? (
                  <Typography
                    variant="body"
                    color="var(--accent-text, #06b6d4)"
                  >
                    {hashtags}
                  </Typography>
                ) : null}
              </Box>
            )}

            <Box width={previewWidth}>
              <Button
                text={exporting ? t("socialExporting") : t("socialDownload")}
                kind="primary"
                size="lg"
                icon="/icons/download.svg"
                onClick={() => void handleDownload()}
                disabled={exporting || !selectedItem || loading}
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
        borderRadius={8}
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
        <SiblingArrow direction="prev" siblings={siblings} />
        <Button
          text={saving ? t("saving") : t("save")}
          kind="primary"
          size="lg"
          onClick={() => void handleSubmit()}
          disabled={saving || loading}
        />
        <SiblingArrow direction="next" siblings={siblings} />
      </Box>

      {error && <Toast message={error} variant="error" />}
      {success && (
        <Toast message={success} variant="success" position="top-center" />
      )}
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
