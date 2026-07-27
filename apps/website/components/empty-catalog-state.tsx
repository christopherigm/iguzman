import { getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { getSystem } from "@/lib/system";
import { MENU_ALL_PATH } from "@/lib/menu-kinds";
import { CatalogCategories } from "./catalog-categories";

interface EmptyCatalogStateProps {
  /** Why the page is empty, in the caller's own words (`Cart.empty`,
   *  `Favorites.empty`, …). Everything below it is the same on every page. */
  message: string;
}

/**
 * What a page with nothing in it shows: the "why it's empty" line, a "browse"
 * call to action, then the same Categories grid the landing page renders.
 *
 * The buttons are decided by what this tenant actually sells - the same three
 * counts the navbar keys its Products/Services/Food links on - so a
 * services-only site never offers "Browse products" and a link to an empty
 * catalog page.
 *
 * It is a *server* component so `CatalogCategories` (itself async) can be
 * rendered here. The guest cart and guest favorites are client components and
 * cannot render this themselves; their pages build it and pass it down as an
 * element instead.
 */
export async function EmptyCatalogState({ message }: EmptyCatalogStateProps) {
  const [system, t] = await Promise.all([
    getSystem(),
    getTranslations("CatalogItems"),
  ]);

  const links = [
    ...(system?.product_count
      ? [{ label: t("browseProducts"), href: "/categories/products" }]
      : []),
    ...(system?.service_count
      ? [{ label: t("browseServices"), href: "/categories/services" }]
      : []),
    ...(system?.menu_item_count
      ? [{ label: t("browseFood"), href: MENU_ALL_PATH }]
      : []),
  ];

  return (
    <Box flexDirection="column" alignItems="stretch" gap={20}>
      <Typography variant="body">{message}</Typography>
      {links.length > 0 && (
        <Box flexWrap="wrap" gap={12}>
          {links.map((link, index) => (
            <Button
              key={link.href}
              text={link.label}
              href={link.href}
              // Only the first is the primary action; the rest stay neutral.
              kind={index === 0 ? "primary" : undefined}
            />
          ))}
        </Box>
      )}
      <CatalogCategories />
    </Box>
  );
}
