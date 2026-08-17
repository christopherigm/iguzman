import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getSession } from "@repo/auth/session";
import { getAllMenuItems, getAllProducts, getAllServices } from "@/lib/catalog";
import type { PosCatalogItem } from "@/lib/pos";
import { PosTerminal } from "./pos-terminal";

type Props = {
  params: Promise<{ locale: string }>;
};

/**
 * The point-of-sale screen: a store associate rings up a walk-in customer.
 *
 * Admin-only, and guarded twice on purpose. `proxy.ts` keeps an anonymous
 * visitor off the route entirely, and the `isAdmin` check below covers the case
 * the proxy cannot - a *signed-in but ordinary* customer, who has a valid
 * session and so sails past a prefix guard. Django re-derives both from the
 * token on every call, so neither check is what actually protects the money;
 * they decide what is worth rendering.
 *
 * The whole catalog is loaded here, server-side, and handed down as one flat
 * list. A till is used offline-ish over a shop's wifi with a queue waiting: it
 * should paint once and then be pure client-side state, rather than fetching a
 * category per tap.
 */
export default async function PosPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getSession();
  if (session?.isAdmin !== true) notFound();

  const [products, services, menuItems] = await Promise.all([
    getAllProducts(),
    getAllServices(),
    getAllMenuItems(),
  ]);

  // The API carries both languages on every row; the till speaks one. Resolved
  // here so no tile has to know about locales.
  const localized = (name: string | null, enName: string | null) =>
    ((locale === "en" ? enName : name) ?? name ?? "").trim();

  const items: PosCatalogItem[] = [
    ...products.map(
      (p): PosCatalogItem => ({
        kind: "product",
        id: p.id,
        name: localized(p.name, p.en_name),
        image: p.image,
        price: p.price,
        currency: p.currency,
        available: p.in_stock,
        category: null,
        ingredients: [],
        sizes: [],
      }),
    ),
    ...services.map(
      (s): PosCatalogItem => ({
        kind: "service",
        id: s.id,
        name: localized(s.name, s.en_name),
        image: s.image,
        price: s.price,
        currency: s.currency,
        // A service is always orderable - it has no stock to run out of, which
        // is the same rule `_in_stock` applies server-side.
        available: true,
        category: null,
        ingredients: [],
        sizes: [],
      }),
    ),
    ...menuItems.map(
      (m): PosCatalogItem => ({
        kind: "menu_item",
        id: m.id,
        name: localized(m.name, m.en_name),
        image: m.image,
        price: m.price,
        currency: m.currency,
        available: m.is_available,
        // The list endpoint carries one category label, not a bilingual pair.
        category: m.category_name,
        ingredients: m.ingredients ?? [],
        // Already the effective list (own rows else the category's), resolved by
        // the API - the till must never re-derive that rule.
        sizes: m.sizes ?? [],
      }),
    ),
  ];

  return <PosTerminal items={items} locale={locale} />;
}
