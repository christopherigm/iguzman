"use client";

import { useState, useEffect, useCallback, useMemo, useRef, use } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toJpeg } from "html-to-image";
import { useRouter } from "@repo/i18n/navigation";
import { useSession } from "@repo/auth/session-provider";
import { Box } from "@repo/ui/core-elements/box";
import { Grid } from "@repo/ui/core-elements/grid";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import { Button } from "@repo/ui/core-elements/button";
import { Select } from "@repo/ui/core-elements/select";
import { Slider } from "@repo/ui/core-elements/slider";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { Toast } from "@repo/ui/core-elements/toast";
import type { HeroLogoBackground } from "@repo/ui/hero";
import { AdminForm, type FieldDef } from "@/components/admin/admin-form";
import { SiblingArrow } from "@/components/admin/sibling-arrows";
import { useAdminSiblings } from "@/hooks/use-admin-siblings";
import {
  AdminImageUploader,
  type NewImage,
} from "@/components/admin-image-uploader/admin-image-uploader";
import { toSameOriginDataUrl } from "@/lib/same-origin-image";
import {
  LOGO_BACKGROUND_SHAPES,
  LOGO_BACKGROUND_LABEL_KEY,
  SCALE_STEPS,
} from "@/components/admin/logo-background-options";
import { couponValueLabel, hasMinOrder } from "@/lib/coupon-shared";
import { formatPrice } from "@/lib/price";
import {
  getCoupon,
  createCoupon,
  updateCoupon,
  getSystem,
  type CouponKind,
  type CouponScopeKind,
  listCoupons,
} from "@/lib/admin-api";
import { CouponScopePicker } from "@/components/admin/coupon-scope-picker";
import {
  COUPON_TEMPLATES,
  DEFAULT_COUPON_TEMPLATE_ID,
  getCouponTemplate,
} from "@/components/admin/coupon-templates/registry";
import {
  FORMAT_DIMENSIONS,
  type CouponFlyerData,
  type CouponFormat,
} from "@/components/admin/coupon-templates/types";

type Props = { params: Promise<{ locale: string; id: string }> };

/**
 * Largest on-screen preview width in CSS px; the flyer is drawn at 1080 and
 * scaled to fit. On a narrow grid item the measured column width wins, so the
 * preview shrinks instead of bleeding out of its cell. Same rule as the
 * social-post form, which this page mirrors.
 */
const PREVIEW_MAX_W = 440;

/** The CURRENCY_CHOICES the API accepts, for the fixed-amount currency picker. */
const CURRENCIES = [
  "USD",
  "EUR",
  "MXN",
  "GBP",
  "CAD",
  "ARS",
  "COP",
  "CLP",
  "BRL",
] as const;

/**
 * A `datetime-local` value (`YYYY-MM-DDTHH:mm`) from an instant, in the
 * **browser's** zone, and back again.
 *
 * Unlike an event's dates - which are wall clock at the venue and so convert
 * against the record's own timezone - a coupon window is a plain instant with no
 * place attached to it. "Expires at midnight" means midnight where the operator
 * setting it is sitting, which is exactly what the browser's zone gives, so
 * these two are the whole conversion and there is no `timezone` field to read.
 */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}` +
    `T${pad(when.getHours())}:${pad(when.getMinutes())}`
  );
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const when = new Date(value);
  return Number.isNaN(when.getTime()) ? null : when.toISOString();
}

export default function AdminCouponFormPage({ params }: Props) {
  const { id } = use(params);
  const isNew = id === "new";
  const t = useTranslations("Admin");
  const tCommon = useTranslations("Common");
  const format = useFormatter();
  const router = useRouter();
  const systemId = useSession()?.systemId ?? 0;
  // Prev/next through the CMS list, for the arrows beside Save.
  const siblings = useAdminSiblings({
    basePath: "/admin/coupons",
    id,
    systemId,
    list: listCoupons,
  });

  const [values, setValues] = useState<Record<string, unknown>>({
    code: "",
    name: "",
    description: "",
    kind: "percent",
    value: "10",
    currency: "USD",
    max_redemptions: 0,
    starts_at: "",
    expires_at: "",
    min_order_amount: "0",
    // "" is the whole order - what every coupon is until it is aimed at
    // something, and what the API defaults a row to.
    scope_kind: "",
    scope_id: null,
    template_id: DEFAULT_COUPON_TEMPLATE_ID,
    brand_logo_background: "none",
    brand_logo_background_scale: 100,
    brand_logo_scale: 100,
    enabled: true,
  });

  // Read-only facts the form shows but never writes: the API owns them.
  const [stats, setStats] = useState({
    timesRedeemed: 0,
    qrCode: null as string | null,
    landingUrl: "",
  });

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

  // Same-origin data URLs used by both the preview and the export. Everything
  // drawn into the flyer must go through this: `html-to-image` taints the canvas
  // on a cross-origin fetch and the download then fails outright.
  const [brandLogoData, setBrandLogoData] = useState<string>();
  const [qrData, setQrData] = useState<string>();
  const [backgroundData, setBackgroundData] = useState<string>();
  const [targetImageData, setTargetImageData] = useState<string>();

  /**
   * The coupon's target as the flyer draws it - its name and the URL of its
   * photograph.
   *
   * Held beside `values` rather than in it because it is **not** part of the
   * payload: the API stores `scope_kind` + `scope_id` and resolves the rest
   * itself. It is seeded from the loaded coupon's `scope` snapshot and then
   * replaced by whatever the picker reports, so the preview follows the operator
   * rather than the last save.
   */
  const [target, setTarget] = useState<{
    name: string;
    /**
     * The category the target is filed under, or `""` - a category target is
     * filed under nothing, and a product or service may be uncategorized.
     */
    category: string;
    image: string | null;
  } | null>(null);

  const [background, setBackground] = useState<NewImage[]>([]);
  const [format4x5, setFormat4x5] = useState<CouponFormat>("1x1");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const flyerRef = useRef<HTMLDivElement>(null);

  const [previewWidth, setPreviewWidth] = useState(PREVIEW_MAX_W);
  const previewColumnRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const available = entry?.contentRect.width ?? 0;
      if (available > 0) setPreviewWidth(Math.min(PREVIEW_MAX_W, available));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // ── Load the brand kit, and (in edit mode) the coupon ──────────────────────
  useEffect(() => {
    if (!systemId) return;
    let cancelled = false;
    void (async () => {
      try {
        const system = await getSystem(systemId);
        if (cancelled) return;
        setBrand({
          logo: (system.img_logo as string | null) ?? null,
          name: (system.site_name as string | null) ?? null,
          slogan: (system.slogan as string | null) ?? null,
          primary: String(system.primary_color ?? "#2196f3"),
          secondary: String(system.secondary_color ?? "#e040fb"),
        });

        if (!isNew) {
          const coupon = await getCoupon(Number(id));
          if (cancelled) return;
          setValues({
            code: coupon.code ?? "",
            name: coupon.name ?? "",
            description: coupon.description ?? "",
            kind: coupon.kind ?? "percent",
            value: coupon.value ?? "10",
            currency: coupon.currency ?? "USD",
            max_redemptions: coupon.max_redemptions ?? 0,
            starts_at: toLocalInput(coupon.starts_at),
            expires_at: toLocalInput(coupon.expires_at),
            min_order_amount: coupon.min_order_amount ?? "0",
            scope_kind: coupon.scope_kind ?? "",
            scope_id: coupon.scope_id ?? null,
            template_id: coupon.template_id ?? DEFAULT_COUPON_TEMPLATE_ID,
            brand_logo_background: coupon.brand_logo_background ?? "none",
            brand_logo_background_scale:
              coupon.brand_logo_background_scale ?? 100,
            brand_logo_scale: coupon.brand_logo_scale ?? 100,
            enabled: coupon.enabled ?? true,
          });
          setStats({
            timesRedeemed: coupon.times_redeemed ?? 0,
            qrCode: coupon.qr_code,
            landingUrl: coupon.landing_url ?? "",
          });
          // Null for an order-wide coupon and for one whose target has been
          // deleted alike - both draw no thumbnail, which is the honest answer
          // in either case.
          setTarget(
            coupon.scope
              ? {
                  name:
                    coupon.scope.name ||
                    coupon.scope.en_name ||
                    `#${coupon.scope.id}`,
                  category: coupon.scope.category_name ?? "",
                  image: coupon.scope.image,
                }
              : null,
          );
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

  // The setState lives inside an async IIFE (never the effect's synchronous
  // body) so it cannot trigger the cascading-render lint.
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

  useEffect(() => {
    let cancelled = false;
    const src = stats.qrCode;
    void (async () => {
      const resolved = src ? await toSameOriginDataUrl(src) : undefined;
      if (!cancelled) setQrData(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [stats.qrCode]);

  // Same rule as the logo and the QR: the photograph is served from R2 on a CDN
  // hostname, so an <img> pointed straight at it taints the export canvas and
  // every download fails.
  const targetImageSrc = target?.image ?? null;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const resolved = targetImageSrc
        ? await toSameOriginDataUrl(targetImageSrc)
        : undefined;
      if (!cancelled) setTargetImageData(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [targetImageSrc]);

  // A pending upload is already a data URL and needs no round-trip.
  const backgroundSrc = background[0]?.preview;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const resolved = backgroundSrc
        ? await toSameOriginDataUrl(backgroundSrc)
        : undefined;
      if (!cancelled) setBackgroundData(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [backgroundSrc]);

  const set = useCallback(
    (k: string, v: unknown) => setValues((prev) => ({ ...prev, [k]: v })),
    [],
  );

  // ── Derived flyer data ─────────────────────────────────────────────────────
  const kind = String(values.kind ?? "percent") as CouponKind;
  const currency = String(values.currency ?? "USD");

  // Guarded exactly as the social flyer's is: an unknown shape (a legacy row, a
  // hand-written payload) would otherwise leave the plate unclipped with nothing
  // to say why. Its neutral value is "none" - no plate - which is how every
  // coupon rendered before this control existed.
  const brandLogoBackground = (
    LOGO_BACKGROUND_SHAPES.includes(
      values.brand_logo_background as HeroLogoBackground,
    )
      ? values.brand_logo_background
      : "none"
  ) as HeroLogoBackground;

  const scopeKind = String(values.scope_kind ?? "") as CouponScopeKind;
  // Which of the two labels the thumbnail wears. A category is "valid on all
  // <name>", an item is "valid on <name>" - two different promises, and the
  // flyer is the only place a customer will read either of them.
  const isCategoryScope = scopeKind.endsWith("_category");

  const flyerData: CouponFlyerData = useMemo(() => {
    const expiresAt = String(values.expires_at ?? "");
    const minOrder = String(values.min_order_amount ?? "0");
    return {
      format: format4x5,
      code: String(values.code ?? "") || "CODE",
      valueLabel: `${couponValueLabel(kind, String(values.value ?? "0"), currency)} ${t("couponOff")}`,
      description: String(values.description ?? ""),
      expiryLabel: expiresAt
        ? `${t("couponValidUntil")} ${format.dateTime(new Date(expiresAt), {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}`
        : undefined,
      minOrderLabel: hasMinOrder(minOrder)
        ? `${t("couponMinShort")} ${formatPrice(minOrder, currency)}`
        : undefined,
      qrImage: qrData,
      // Only while the coupon has no row of its own: the API mints the PNG on
      // create, so this is the one state in which the space is genuinely empty
      // and about to be filled. A saved coupon whose PNG write failed gets
      // nothing here on purpose - there is no "once saved" left to promise.
      qrPlaceholder: isNew ? t("couponQrPlaceholder") : undefined,
      // The landing URL is resolved by the API from the tenant's own `host`; a
      // new coupon has no row yet and so no URL to print.
      landingUrl: stats.landingUrl || undefined,
      // Undefined for an order-wide coupon, so every template's optional block
      // simply does not render - the contract each of them already follows.
      target: scopeKind
        ? {
            // The category and the name travel as two fields, and every
            // template draws them as two lines - the category quiet and small
            // above the name, which is the thing the reader is looking for.
            // They used to be composed here into one "Pizzas - Margherita"
            // string, which printed the shelf and the dish at one size in one
            // ink; splitting them is what lets a flyer still say where on the
            // menu the offer sits without burying the dish in that sentence.
            name: target?.name ?? "",
            // Empty for every category scope (a category is filed under
            // nothing) and for an uncategorized product or service, in which
            // case the templates draw the name alone.
            category: target?.category || undefined,
            image: targetImageData,
            label: isCategoryScope ? t("couponValidOnAll") : t("couponValidOn"),
          }
        : undefined,
      brandLogo: brandLogoData ?? undefined,
      brandName: brand.name ?? undefined,
      brandSlogan: brand.slogan ?? undefined,
      primaryColor: brand.primary,
      secondaryColor: brand.secondary,
      backgroundImage: backgroundData,
      includeBrand: true,
      brandLogoBackground,
      brandLogoBackgroundScale: Number(
        values.brand_logo_background_scale ?? 100,
      ),
      brandLogoScale: Number(values.brand_logo_scale ?? 100),
    };
  }, [
    values,
    kind,
    currency,
    format4x5,
    qrData,
    backgroundData,
    brandLogoData,
    brand,
    stats.landingUrl,
    t,
    format,
    isNew,
    brandLogoBackground,
    scopeKind,
    isCategoryScope,
    target,
    targetImageData,
  ]);

  const template = getCouponTemplate(String(values.template_id));
  const TemplateComponent = template.Component;
  const dims = FORMAT_DIMENSIONS[format4x5];
  const previewScale = previewWidth / dims.w;

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: Record<string, unknown> = {
        code: values.code,
        name: values.name || "",
        description: values.description || "",
        kind: values.kind,
        value: values.value,
        currency: values.currency,
        max_redemptions: Number(values.max_redemptions ?? 0),
        starts_at: fromLocalInput(String(values.starts_at ?? "")),
        expires_at: fromLocalInput(String(values.expires_at ?? "")),
        min_order_amount: values.min_order_amount || "0",
        // Always sent as a pair, including when both are empty: clearing a
        // coupon's target has to actually write the order-wide scope back, and
        // the API refuses one half without the other.
        scope_kind: values.scope_kind || "",
        scope_id: values.scope_kind ? values.scope_id : null,
        template_id: values.template_id,
        brand_logo_background: values.brand_logo_background,
        brand_logo_background_scale: values.brand_logo_background_scale,
        brand_logo_scale: values.brand_logo_scale,
        enabled: values.enabled,
      };
      // No `system`: the API takes the tenant from the admin's own token, and a
      // body that could name one would be a body that could write to another.
      let coupon;
      if (isNew) {
        coupon = await createCoupon(payload);
      } else {
        coupon = await updateCoupon(Number(id), payload);
      }
      // The API writes (and, on a rename, rewrites) the QR - so re-read both it
      // and the landing URL rather than keeping a stale code on screen beside
      // the new one.
      setStats({
        timesRedeemed: coupon.times_redeemed,
        qrCode: coupon.qr_code,
        landingUrl: coupon.landing_url,
      });
      setSuccess(t("saved"));
      if (isNew) router.replace(`/admin/coupons/${coupon.id}`);
    } catch {
      setError(t("errorSave"));
    } finally {
      setSaving(false);
    }
  };

  // ── Download JPG ───────────────────────────────────────────────────────────
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
      // download button that refuses for a reason nobody can see.
      const dataUrl = await toJpeg(node, options).catch(() =>
        toJpeg(node, { ...options, skipFonts: true }),
      );
      const link = document.createElement("a");
      const base =
        String(values.code || "coupon")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "") || "coupon";
      link.download = `${base}-${format4x5}.jpg`;
      link.href = dataUrl;
      link.click();
    } catch {
      setError(t("couponExportError"));
    } finally {
      setExporting(false);
    }
  };

  const fields: FieldDef[] = [
    { key: "code", label: t("couponCode"), required: true },
    { key: "name", label: t("couponName") },
    { key: "description", label: t("couponDescription"), type: "textarea" },
    {
      key: "kind",
      label: t("couponKind"),
      type: "select",
      options: [
        { value: "percent", label: t("couponKindPercent") },
        { value: "fixed", label: t("couponKindFixed") },
      ],
    },
    { key: "value", label: t("couponValue"), type: "number", required: true },
    // Only a fixed-amount coupon is denominated: a percentage carries no
    // currency and applies to a basket in any of them, so offering the picker
    // there would be a control with no effect (and one the API ignores).
    ...(kind === "fixed"
      ? ([
          {
            key: "currency",
            label: t("couponCurrency"),
            type: "select",
            options: CURRENCIES.map((c) => ({ value: c, label: c })),
          },
        ] as FieldDef[])
      : []),
    {
      key: "max_redemptions",
      label: t("couponMaxRedemptions"),
      type: "number",
      placeholder: t("couponUnlimitedHint"),
    },
    { key: "min_order_amount", label: t("couponMinOrder"), type: "number" },
    { key: "starts_at", label: t("couponStartsAt"), type: "datetime" },
    { key: "expires_at", label: t("couponExpiresAt"), type: "datetime" },
    { key: "enabled", label: t("enabled"), type: "boolean" },
  ];

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t("home"), href: "/" },
          { label: t("breadcrumbAdmin"), href: "/admin" },
          { label: t("coupons"), href: "/admin/coupons" },
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
          {isNew ? t("couponNew") : t("couponEdit")}
        </Typography>
        <Box display="flex" alignItems="center" gap={8}>
          <Button
            text={isNew ? tCommon("cancel") : t("back")}
            size="md"
            href="/admin/coupons"
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

      {(saving || loading) && <ProgressBar />}

      <Grid container spacing={3}>
        {/* ── Controls ── */}
        <Grid size={{ xs: 12, sm: 6 }}>
          <AdminForm
            title=""
            embedded
            fields={fields}
            values={values}
            onChange={set}
            onSubmit={handleSubmit}
            loading={loading}
            saving={saving}
            slots={[
              {
                // Directly below Description, above the discount's own terms -
                // "what this applies to" is part of describing the coupon, not
                // part of pricing it.
                //
                // It is a slot rather than two `FieldDef`s because it needs the
                // tenant's catalog, which `FieldDef` cannot fetch, and because
                // the pair is one mutually-exclusive value that no flat field
                // list can express.
                beforeKey: "kind",
                node: (
                  <CouponScopePicker
                    scopeKind={scopeKind}
                    scopeId={
                      typeof values.scope_id === "number"
                        ? values.scope_id
                        : null
                    }
                    onChange={(nextKind, nextId, nextTarget) => {
                      // Both halves move together, always. The API refuses a
                      // kind without an id, and the model carries a check
                      // constraint saying the same thing.
                      setValues((prev) => ({
                        ...prev,
                        scope_kind: nextKind,
                        scope_id: nextId,
                      }));
                      setTarget(nextTarget);
                    }}
                    systemId={systemId}
                    t={t}
                  />
                ),
              },
            ]}
          />
        </Grid>

        {/* ── Flyer ── */}
        <Grid size={{ xs: 12, sm: 6 }}>
          <Box ref={previewColumnRef} flexDirection="column" gap={12}>
            <Typography
              as="span"
              variant="label"
              fontWeight={600}
              color="var(--foreground)"
            >
              {t("couponFlyer")}
            </Typography>

            <Box display="flex" gap={16}>
              <Box flex={1}>
                <Select
                  label={t("couponTemplate")}
                  value={String(values.template_id)}
                  onChange={(v) => set("template_id", v)}
                  options={COUPON_TEMPLATES.map((tpl) => ({
                    value: tpl.id,
                    label: t(`couponTemplate_${tpl.id}`) ?? tpl.name,
                  }))}
                />
              </Box>
              <Box flex={1}>
                <Select
                  label={t("socialPostFormat")}
                  value={format4x5}
                  onChange={(v) => setFormat4x5(v as CouponFormat)}
                  options={[
                    { value: "1x1", label: t("socialFormatSquare") },
                    { value: "4x5", label: t("socialFormatPortrait") },
                  ]}
                />
              </Box>
            </Box>

            {/* The brand logo's plate. Rendered only when the tenant actually
                has a logo - with nothing to frame, these would be three
                controls that change nothing anyone can see. Only the *plate*
                slider is shape-gated (with no plate there is nothing to size);
                the logo slider is always offered, because the logo is drawn
                either way and a bare one needs sizing just as much. Hiding the
                plate slider keeps its stored value, so turning a shape back on
                restores what was picked.

                The three labels are the social flyer's own keys, deliberately:
                they are the same three controls over the same shape vocabulary,
                and the copy says nothing about a post - a `coupon*` alias would
                be five more locale entries that can only ever drift from these. */}
            {brand.logo ? (
              <Box flexDirection="column" gap={12}>
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
            ) : null}

            {/* The backdrop is an override and is deliberately **not saved** on
                the coupon: it only decorates the exported image, and the one
                template that paints it says so below. Persisting it would add a
                stored file per coupon that no customer-facing surface ever
                reads. */}
            <Box flexDirection="column" gap={8}>
              <Typography variant="label">{t("couponBackground")}</Typography>
              <AdminImageUploader
                existingImages={[]}
                onChange={(newImages) => setBackground(newImages)}
                maxImages={1}
                compact
              />
              <Typography variant="caption">
                {template.supportsBackground
                  ? t("couponBackgroundHint")
                  : t("socialBackgroundImageUnused")}
              </Typography>
            </Box>

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

            {/* A new coupon has no row yet, so no QR and no landing URL. Saying
                so beats a flyer that silently comes out without the one thing it
                exists to carry. */}
            {isNew ? (
              <Typography variant="caption" color="var(--foreground)">
                {t("couponSaveForQr")}
              </Typography>
            ) : (
              <Box flexDirection="column" gap={6}>
                <Typography variant="caption" color="var(--foreground)">
                  {t("couponRedemptions")}: {stats.timesRedeemed}
                </Typography>
                {stats.landingUrl ? (
                  <Typography
                    variant="caption"
                    color="var(--accent, #06b6d4)"
                    styles={{ overflowWrap: "anywhere" }}
                  >
                    {stats.landingUrl}
                  </Typography>
                ) : null}
              </Box>
            )}

            <Box width={previewWidth}>
              <Button
                text={exporting ? t("socialExporting") : t("couponDownload")}
                kind="primary"
                size="lg"
                icon="/icons/download.svg"
                onClick={() => void handleDownload()}
                disabled={exporting || isNew || loading}
              />
            </Box>
          </Box>
        </Grid>
      </Grid>

      {/* Clears the fixed Save bar so trailing content is never hidden under it. */}
      <Box styles={{ height: 96 }} />

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
