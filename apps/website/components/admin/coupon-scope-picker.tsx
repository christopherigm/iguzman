"use client";

import { useEffect, useState } from "react";
import { Box } from "@repo/ui/core-elements/box";
import { Select } from "@repo/ui/core-elements/select";
import { Typography } from "@repo/ui/core-elements/typography";
import {
  listProducts,
  listServices,
  listMenuItems,
  listProductCategories,
  listServiceCategories,
  listMenuCategories,
  COUPON_SCOPE_CATEGORY_KINDS,
  type CouponScopeKind,
  type CouponScopeCategoryKind,
  type CouponScopeItemKind,
} from "@/lib/admin-api";
import { catalogOptionLabel, catalogRowCategory } from "./catalog-option-label";

/**
 * The CMS control that aims a coupon at one catalog target.
 *
 * Two selects - every category on the site, and every buyable on it - over one
 * value. **A coupon has exactly one target**, so picking in either select clears
 * the other: a coupon that was "all Pizzas" and is now "the Margherita" is not
 * both, and leaving the abandoned select showing its old pick would be a control
 * saying something the coupon does not.
 *
 * It is deliberately not `CatalogRefPicker`, which is the other cross-family
 * picker here. That one fills a fixed number of **slots** from the three buyable
 * families and never sees a category; this is a single-value, mutually-exclusive
 * choice over **six** families. The `${kind}:${id}` encoding is the only thing
 * they would have shared, and it is two lines.
 *
 * ⚠ **This picks, it does not price.** What the target actually does to a
 * basket is decided in `orders/services/coupons.py`, off the stored
 * `scope_kind` + `scope_id`. Nothing here may grow an opinion about the
 * discount.
 */

/** `${kind}:${id}` keeps three families in a single `Select`. `""` is "none". */
function encode(kind: CouponScopeKind, id: number | null): string {
  return kind && id ? `${kind}:${id}` : "";
}

interface Option {
  kind: Exclude<CouponScopeKind, "">;
  id: number;
  name: string;
  /**
   * The category this row is filed under, or `""` when it has none - which is
   * every category option (a category is filed under nothing) and an
   * uncategorized product or service. It is what the option is prefixed with,
   * the family label standing in when it is blank.
   */
  category: string;
  /** The row's photograph, for the flyer preview. Null when it has none. */
  image: string | null;
}

/** Build one family's options from an admin catalog listing. */
function toOptions(
  rows: Record<string, unknown>[],
  kind: Exclude<CouponScopeKind, "">,
): Option[] {
  return rows
    .map((row) => {
      const id = Number(row.id);
      if (!Number.isFinite(id)) return null;
      // The CMS does not localize tenant copy - the primary-language `name` is
      // what every other admin list and select labels a row with.
      const name = (row.name as string) || (row.en_name as string) || `#${id}`;
      return {
        kind,
        id,
        name,
        category: catalogRowCategory(row),
        image: (row.image as string | null) ?? null,
      };
    })
    .filter((o): o is Option => o !== null);
}

interface Props {
  scopeKind: CouponScopeKind;
  scopeId: number | null;
  /**
   * Writes both halves at once - they are one value and never move apart - plus
   * the picked row itself.
   *
   * ⚠ **That third argument is what keeps the flyer preview honest.** The saved
   * coupon's `scope` snapshot comes from the API and cannot know about a pick
   * made a second ago, so a form relying on it would draw the *previous*
   * target's photograph until the operator saved and reloaded - on a screen
   * whose entire job is showing them what they are about to print. The row's
   * `category` travels with it for the same reason: the flyer prints it beside
   * the name, so it has to follow the pick rather than the last save.
   */
  onChange: (
    kind: CouponScopeKind,
    id: number | null,
    target: { name: string; category: string; image: string | null } | null,
  ) => void;
  systemId: number;
  /** `Admin` namespace translator, passed in so this stays a plain component. */
  t: (key: string) => string;
}

export function CouponScopePicker({
  scopeKind,
  scopeId,
  onChange,
  systemId,
  t,
}: Props) {
  const [categories, setCategories] = useState<Option[]>([]);
  const [items, setItems] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);

  // The catalog is per tenant, which is why this is a component and not a pair
  // of `FieldDef`s on the flat admin form.
  useEffect(() => {
    if (!systemId) return;
    let cancelled = false;
    void (async () => {
      try {
        const [
          productCategories,
          serviceCategories,
          menuCategories,
          products,
          services,
          menuItems,
        ] = await Promise.all([
          listProductCategories(systemId),
          listServiceCategories(systemId),
          listMenuCategories(systemId),
          listProducts(systemId),
          listServices(systemId),
          listMenuItems(systemId),
        ]);
        if (cancelled) return;
        setCategories([
          ...toOptions(productCategories, "product_category"),
          ...toOptions(serviceCategories, "service_category"),
          ...toOptions(menuCategories, "menu_category"),
        ]);
        setItems([
          ...toOptions(products, "product"),
          ...toOptions(services, "service"),
          ...toOptions(menuItems, "menu_item"),
        ]);
      } catch {
        // A catalog that will not load leaves both selects at "the whole order",
        // which is the coupon's own default and a safe thing to save. Surfacing
        // an error here would be a second failure message on a page that
        // already has one for the coupon itself.
        if (!cancelled) {
          setCategories([]);
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [systemId]);

  const isCategoryScope = (
    COUPON_SCOPE_CATEGORY_KINDS as readonly string[]
  ).includes(scopeKind);

  // Only the select that owns the current pick shows it; the other reads
  // "the whole order", because that is what it contributes to this coupon.
  const categoryValue = isCategoryScope ? encode(scopeKind, scopeId) : "";
  const itemValue = !isCategoryScope ? encode(scopeKind, scopeId) : "";

  const handle = (value: string) => {
    if (!value) return onChange("", null, null);
    const [kind, rawId] = value.split(":");
    const id = Number(rawId);
    if (!kind || !Number.isFinite(id)) return onChange("", null, null);
    const picked = [...categories, ...items].find(
      (o) => o.kind === kind && o.id === id,
    );
    onChange(
      kind as CouponScopeKind,
      id,
      picked
        ? { name: picked.name, category: picked.category, image: picked.image }
        : null,
    );
  };

  // A row reads as its family glyph, then the category it is filed under, then
  // its own name - "🍽️ Pizzas · Margherita". `familyKey` is only the fallback
  // prefix, for a row with no category (every option in the *category* select,
  // and an uncategorized product or service); see `catalog-option-label.ts`.
  const options = (rows: Option[], familyKey: Record<string, string>) => [
    { value: "", label: t("couponScopeWholeOrder") },
    ...rows.map((o) => ({
      value: `${o.kind}:${o.id}`,
      label: catalogOptionLabel(
        o.kind,
        o.category || t(familyKey[o.kind] ?? ""),
        o.name,
      ),
    })),
  ];

  const CATEGORY_LABEL: Record<CouponScopeCategoryKind, string> = {
    product_category: "productCategories",
    service_category: "serviceCategories",
    menu_category: "menuCategories",
  };
  const ITEM_LABEL: Record<CouponScopeItemKind, string> = {
    product: "products",
    service: "services",
    menu_item: "menuItems",
  };

  return (
    <Box flexDirection="column" gap={8}>
      <Typography
        as="span"
        variant="label"
        fontWeight={600}
        color="var(--foreground)"
      >
        {t("couponScope")}
      </Typography>

      <Box display="flex" gap={16}>
        <Box flex={1}>
          <Select
            label={t("couponScopeCategory")}
            value={categoryValue}
            onChange={handle}
            options={options(categories, CATEGORY_LABEL)}
            disabled={loading}
          />
        </Box>
        <Box flex={1}>
          <Select
            label={t("couponScopeItem")}
            value={itemValue}
            onChange={handle}
            options={options(items, ITEM_LABEL)}
            disabled={loading}
          />
        </Box>
      </Box>

      <Typography variant="caption">
        {scopeKind ? t("couponScopeHintScoped") : t("couponScopeHintOrder")}
      </Typography>
    </Box>
  );
}
