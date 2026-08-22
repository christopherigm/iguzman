import { notFound, permanentRedirect } from "next/navigation";
import { getPathname } from "@repo/i18n/navigation";
import type { CatalogFamily } from "@/lib/catalog-paths";
import { itemHref } from "@/lib/catalog-paths";
import { getMenuItem, getProduct, getService } from "@/lib/catalog";

/**
 * What `/<family>/<slug>` does when the slug is **not** one of that family's
 * categories: look it up as an *item* and permanently redirect to its canonical
 * `/<family>/<category>/<slug>`, or 404.
 *
 * Every family's one-segment route is primarily its category page. This is the
 * fallback underneath it, and it earns the whole arrangement:
 *
 * - It is the **category-independent permalink**. The real URL carries the
 *   category, so an operator re-filing an item in the CMS *moves* it. A slug is
 *   unique within its family, so `/<family>/<slug>` is stable forever and is
 *   what should be handed out when an address has to outlive an edit.
 * - It is what keeps **every link printed before the categories existed**
 *   working. Products and services used to live at exactly `/products/<slug>`
 *   and `/services/<slug>`; those URLs are on invoices, in inboxes and in
 *   search indexes, and they all still arrive - as a 301, with no per-slug
 *   redirect rule to maintain.
 * - It is the landing point for the five pre-category menu paths
 *   (`/food/<slug>`, `/drink/<slug>`, …) that `next.config.js` redirects here.
 *   A static rule cannot know an item's category; this does.
 *
 * ⚠ **A category slug wins over an item slug.** The caller tries its category
 * lookup first and only falls through to here, so an item sharing a slug with a
 * category in the same family becomes unreachable at its permalink (its
 * canonical three-segment URL is unaffected). Slugs are unique per table, not
 * across the two, so nothing in the database prevents it - it is a content
 * mistake, and the CMS is where to catch it.
 *
 * ⚠ **One segment only**, so it never shadows `/<family>/<category>/<slug>`
 * beside it: that route is two segments and Next matches on segment count.
 *
 * ⚠ **The folder is `[category]`, not `[slug]`, and must stay that way** even
 * though what lands in it here is an item slug. Next refuses to build when two
 * routes give the *same* dynamic level different slug names, so this segment
 * and the one in `[category]/[slug]` have to share a name - and `category` is
 * the one that reads correctly on the canonical URL.
 */
export async function redirectToItemOrNotFound({
  family,
  slug,
  locale,
}: {
  family: CatalogFamily;
  slug: string;
  locale: string;
}): Promise<never> {
  const item =
    family === "product"
      ? await getProduct(slug)
      : family === "service"
        ? await getService(slug)
        : await getMenuItem(slug);

  // Neither a category nor an item: this is not a page.
  if (!item?.category_slug) notFound();

  // `permanentRedirect` takes a real path, not a locale-less href, so the
  // prefix is applied here rather than by the navigation helpers.
  permanentRedirect(
    getPathname({
      href: itemHref(family, item.category_slug, item.slug),
      locale,
    }),
  );
}
