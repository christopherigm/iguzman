import { getTranslations, getLocale } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Container } from "@repo/ui/core-elements/container";
import { Grid } from "@repo/ui/core-elements/grid";
import { Typography } from "@repo/ui/core-elements/typography";
import { getSystem } from "@/lib/system";
import {
  getAllProducts,
  getAllServices,
  getAllMenuItems,
} from "@/lib/catalog";
import { BuyableCard, type BuyableItem } from "./buyable-card";

/**
 * Spotlight - a shared landing block that pairs an editorial promo panel with a
 * trio of hand-picked catalog items. Café de Altura uses it as the wholesale
 * (mayoreo) invitation; Pan Orgánico as its "vegan breads" showcase - one
 * component, driven entirely by the tenant's `System` record so each site fills
 * it with its own copy and its own three items in the CMS.
 *
 * The panel is a single bordered surface (a deliberately different shape from
 * the card grids around it, so a landing never reads as five stacked grids). Its
 * left column is label → title → text → button; its right column is an inner
 * grid of the selected items, rendered with the same `BuyableCard` every other
 * grid in the app uses. The `spotlight_items` refs ({kind, id}) are resolved to
 * live cards here against the cached catalog, so a deleted or disabled item
 * simply drops out rather than breaking the section.
 *
 * Renders nothing until the tenant has set both a title and at least one still-
 * live item, so an unconfigured site (or one whose picks were all removed) shows
 * no empty panel - exactly like the other DB-driven blocks.
 */
function pick(
  locale: string,
  es: string | null | undefined,
  en: string | null | undefined,
): string {
  const primary = locale === "en" ? en : es;
  return (primary || es || en || "").trim();
}

export async function Spotlight() {
  const [system, locale] = await Promise.all([getSystem(), getLocale()]);

  // The tenant's master switch for this block - off hides it entirely, even
  // when copy and items are filled in. Defaults on for legacy rows with no flag.
  if (system && system.spotlight_enabled === false) return null;

  const refs = (system?.spotlight_items ?? []).slice(0, 3);
  const title = pick(locale, system?.spotlight_title, system?.en_spotlight_title);

  // Nothing to show without a title AND at least one picked item.
  if (!title || refs.length === 0) return null;

  const [products, services, menuItems, tMenu] = await Promise.all([
    getAllProducts(),
    getAllServices(),
    getAllMenuItems(),
    getTranslations("Menu"),
  ]);

  const productById = new Map(products.map((p) => [p.id, p]));
  const serviceById = new Map(services.map((s) => [s.id, s]));
  const menuById = new Map(menuItems.map((m) => [m.id, m]));

  // Resolve each ref in order, dropping any that no longer exist (deleted or
  // disabled). A ref that survives becomes the exact card its family renders.
  const items: BuyableItem[] = [];
  for (const ref of refs) {
    if (ref.kind === "product") {
      const data = productById.get(ref.id);
      if (data) items.push({ kind: "product", data });
    } else if (ref.kind === "service") {
      const data = serviceById.get(ref.id);
      if (data) items.push({ kind: "service", data });
    } else if (ref.kind === "food") {
      const data = menuById.get(ref.id);
      if (data) items.push({ kind: "food", data });
    }
  }

  if (items.length === 0) return null;

  const label = pick(locale, system?.spotlight_label, system?.en_spotlight_label);
  const text = pick(locale, system?.spotlight_text, system?.en_spotlight_text);
  const buttonLabel = pick(
    locale,
    system?.spotlight_button_label,
    system?.en_spotlight_button_label,
  );
  const buttonLink = (system?.spotlight_button_link ?? "").trim();

  return (
    <Container paddingX={10}>
      <Box paddingY={64}>
        <Grid container spacing={4} alignItems="center">
          <Grid size={{ xs: 12, md: 5 }}>
            <Box flexDirection="column" gap="14px">
              {label && (
                <Typography
                  as="span"
                  variant="label"
                  color="var(--accent)"
                  fontWeight={700}
                  styles={{
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                  }}
                >
                  {label}
                </Typography>
              )}
              <Typography as="h2" variant="h2" fontWeight={800}>
                {title}
              </Typography>
              {text && (
                <Typography as="p" variant="body" styles={{ lineHeight: 1.7 }}>
                  {text}
                </Typography>
              )}
              {buttonLabel && buttonLink && (
                <Box marginTop={4}>
                  <Button
                    text={buttonLabel}
                    href={buttonLink}
                    kind="primary"
                    size="lg"
                  />
                </Box>
              )}
            </Box>
          </Grid>

          <Grid size={{ xs: 12, md: 7 }}>
            <Grid container spacing={2}>
              {items.map((item, index) => (
                <Grid
                  key={`${item.kind}-${item.data.id}`}
                  size={{ xs: 6, sm: 4 }}
                  // Only the third card wraps to a lonely row on xs (2-up);
                  // hide it below sm so mobile shows a clean pair, all three sm+.
                  hidden={{ xs: index === 2 }}
                >
                  <BuyableCard
                    item={item}
                    locale={locale}
                    fromLabel={tMenu("from")}
                  />
                </Grid>
              ))}
            </Grid>
          </Grid>
        </Grid>
      </Box>
    </Container>
  );
}
