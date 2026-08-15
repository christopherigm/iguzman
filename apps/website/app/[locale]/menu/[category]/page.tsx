import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { permanentRedirect } from "next/navigation";
import { getMenuItem } from "@/lib/catalog";
import { menuItemHref } from "@/lib/menu-paths";
import { getPathname } from "@repo/i18n/navigation";

/**
 * The category-independent permalink for a menu item: `/menu/<slug>` resolves
 * the item and permanently redirects to `/menu/<category>/<slug>`.
 *
 * It exists because the real URL carries the category, and an operator re-filing
 * a dish in the CMS therefore *moves* it - which would break a link already
 * shared or printed on a flyer. A slug is globally unique, so this one is
 * stable forever and is what should be handed out when the address has to
 * outlive an edit.
 *
 * It is also the landing point for the five pre-category paths (`/food/<slug>`,
 * `/drink/<slug>`, …), which `next.config.js` redirects here - a static rule
 * cannot know an item's category, and this does.
 *
 * ⚠ **One segment only**, so it never shadows `/menu/<category>/<slug>` beside
 * it: that route is two segments and Next matches on segment count.
 *
 * ⚠ **The folder is `[category]`, not `[slug]`, and must stay that way** even
 * though what lands in it here is an item slug. Next refuses to build when two
 * routes give the *same* dynamic level different slug names, so this segment and
 * the one in `[category]/[slug]` have to share a name - and `category` is the one
 * that reads correctly on the canonical two-segment URL.
 */

type Props = {
  params: Promise<{ locale: string; category: string }>;
};

export default async function MenuItemPermalinkPage({ params }: Props) {
  // `category` is this route's item slug - see the note above on the folder name.
  const { locale, category: slug } = await params;
  setRequestLocale(locale);

  const item = await getMenuItem(slug);
  if (!item) notFound();

  // `permanentRedirect` takes a real path, not a locale-less href, so the
  // prefix is applied here rather than by the navigation helpers.
  permanentRedirect(
    getPathname({
      href: menuItemHref(item.category_slug, item.slug),
      locale,
    }),
  );
}
