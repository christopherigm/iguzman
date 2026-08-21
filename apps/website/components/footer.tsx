import type { CSSProperties } from "react";
import Image from "next/image";
import { Link } from "@repo/i18n/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { Grid } from "@repo/ui/core-elements/grid";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { ThemeSwitch } from "@repo/ui/theme-switch";
import { BrandmarkCradle, HERO_FRAME_BADGE_SIZE } from "@repo/ui/hero";
import { LocaleSwitcher } from "@repo/ui/core-elements/locale-switcher";
import { routing } from "@repo/i18n/routing";
import { type System } from "@/lib/system";
import { MENU_ALL_PATH } from "@/lib/menu-paths";
import { kindLabel, kindLabels } from "@/lib/kind-labels";
import { getSite } from "@/lib/resolve-site";
import "./footer.css";

type Props = {
  logo: string;
  system: System | null;
};

export async function Footer({ logo, system }: Props) {
  const [t, locale, site] = await Promise.all([
    getTranslations("Footer"),
    getLocale(),
    getSite(),
  ]);

  // Same rule as the navbar: a catalog family only gets a link when the tenant
  // actually has records of that kind, so a services-only business never shows
  // an empty Products page. The listing routes live under /categories/* - the
  // bare /products and /services paths are detail-only ([slug]) and 404.
  // Each family wears whatever the tenant calls it, as in the navbar. The menu
  // link keeps our own word: it leads to the *whole* menu, which is every kind
  // at once and so is nobody's single label.
  const labels = kindLabels(system, locale);
  const navLinks = [
    { label: t("home"), href: "/" },
    ...((system?.product_count ?? 0) > 0
      ? [
          {
            label: kindLabel(labels, "product", t("products")),
            href: "/categories/products",
          },
        ]
      : []),
    ...((system?.service_count ?? 0) > 0
      ? [
          {
            label: kindLabel(labels, "service", t("services")),
            href: "/categories/services",
          },
        ]
      : []),
    ...((system?.menu_item_count ?? 0) > 0
      ? [{ label: t("food"), href: MENU_ALL_PATH }]
      : []),
    { label: t("highlights"), href: "/highlights" },
    { label: t("blog"), href: "/blog" },
    // Both work logged-out - a guest's cart and hearts live in their browser.
    { label: t("favorites"), href: "/favorites" },
    { label: t("cart"), href: "/cart" },
    // A Contact link once the tenant has something to show there: a contact
    // email or at least one physical location. Same rule as the navbar.
    ...(system?.contact_email || (system?.branch_count ?? 0) > 0
      ? [{ label: t("contact"), href: "/contact" }]
      : []),
  ];

  // "About" is not a platform route: each site declares its own /about in its
  // `pages` map, so the link exists only for the sites that built one.
  const companyLinks = site.pages?.["/about"]
    ? [{ label: t("about"), href: "/about" }]
    : [];

  const currentYear = new Date().getFullYear();

  // The tenant's brandmark cradled on the footer's top edge, drawn by the same
  // component the hero's framed heading uses - so the two brand moments are one
  // object rather than two that can drift. It replaces the plain top border, so
  // it is opt-in on the tenant's "Framed heading" setting (`hero_text_frame`),
  // the same switch that decides whether a heading is cradled: a site that
  // wears the frame wears it here too, and one that doesn't keeps the quiet
  // rule. With no brandmark there is nothing to cradle.
  const brandmark = system?.hero_text_frame ? system.img_brandmark : null;

  return (
    <footer
      className={brandmark ? "footer footer--cradled" : "footer"}
      // The disc's diameter drives the space the footer reserves above itself
      // (see footer.css); published as a variable so `@repo/ui` stays the one
      // place that decides how big a cradled brandmark is.
      style={
        brandmark
          ? ({
              "--footer-cradle-badge": HERO_FRAME_BADGE_SIZE,
            } as CSSProperties)
          : undefined
      }
    >
      {brandmark && (
        <BrandmarkCradle
          image={brandmark}
          imageAlt={system?.site_name ?? ""}
          // The hero draws its cradle in white over a video; here it stands in
          // for the footer's own rule, so it wears that border's colour and the
          // disc is a page-background plate that follows the theme.
          color="color-mix(in srgb, var(--foreground) 10%, transparent)"
          // ...and that border's weight. The flanks *are* `.footer`'s
          // `border-top`, and the arch between them is the same rule carrying
          // on, so both are drawn at the 1px this footer's hairlines (the top
          // edge it replaces, the bottom bar's) are drawn at. Anything else
          // reads as a rule that changes thickness at the brandmark.
          strokeWidth={1}
          circleBackground="var(--page-background, var(--background))"
          // The area between the shoulders takes the footer's own background,
          // so the footer reads as swelling up to meet the mark instead of the
          // page showing through a notch in its edge.
          fill="var(--background)"
        />
      )}
      <Container paddingX={10}>
        <Grid container spacing={4}>
          {/* Column 1 - Brand */}
          <Grid size={{ xs: 12, sm: 4 }}>
            <Box display="flex" flexDirection="column" gap="20px">
              <Image
                src={logo}
                alt={system?.site_name ?? ""}
                width={315}
                height={99}
                style={{ objectFit: "contain", objectPosition: "left center" }}
              />
              {system?.site_name && (
                <Typography as="span" variant="h5" fontWeight={700}>
                  {system.site_name}
                </Typography>
              )}
              {system?.slogan && (
                <Typography
                  as="p"
                  variant="body"
                  color="var(--foreground)"
                  styles={{
                    fontStyle: "italic",
                    overflowWrap: "break-word",
                    whiteSpace: "pre-line",
                  }}
                >
                  {system.slogan}
                </Typography>
              )}
              <Box
                display="flex"
                alignItems="center"
                gap="12px"
                flexWrap="wrap"
              >
                <ThemeSwitch />
                <LocaleSwitcher
                  locales={routing.locales}
                  currentLocale={locale}
                />
              </Box>
            </Box>
          </Grid>

          {/* Column 2 - Navigation. Takes the Company column's width when the
              resolved site has no extra pages to list. */}
          <Grid size={{ xs: 12, sm: companyLinks.length > 0 ? 4 : 8 }}>
            <Typography as="h3" variant="h5" fontWeight={700} marginBottom={20}>
              {t("navigationHeading")}
            </Typography>
            <Grid container spacingY={1} spacingX={2}>
              {navLinks.map((link) => (
                <Grid key={link.href} size={{ xs: 6, sm: 6 }}>
                  <Link href={link.href} prefetch className="footer__link">
                    {link.label}
                  </Link>
                </Grid>
              ))}
            </Grid>
          </Grid>

          {/* Column 3 - Company */}
          {companyLinks.length > 0 && (
            <Grid size={{ xs: 12, sm: 4 }}>
              <Typography
                as="h3"
                variant="h5"
                fontWeight={700}
                marginBottom={20}
              >
                {t("companyHeading")}
              </Typography>
              <Grid container spacingY={1} spacingX={2}>
                {companyLinks.map((link) => (
                  <Grid key={link.href} size={{ xs: 6, sm: 12 }}>
                    <Link href={link.href} prefetch className="footer__link">
                      {link.label}
                    </Link>
                  </Grid>
                ))}
              </Grid>
            </Grid>
          )}
        </Grid>

        {/* Bottom bar */}
        <Box
          paddingY={20}
          marginTop={40}
          styles={{
            borderTop:
              "1px solid color-mix(in srgb, var(--foreground) 10%, transparent)",
          }}
        >
          <Typography
            as="p"
            variant="body"
            textAlign="center"
            color="var(--foreground)"
            styles={{ lineHeight: 1.6, overflowWrap: "break-word" }}
          >
            {t("copyright", {
              year: currentYear,
              name: system?.site_name ?? "",
            })}
          </Typography>
          {/*
            The stock-bank credit. Rendered only while this site still shows at
            least one bank photo, and it disappears on its own once the customer
            has replaced them all - `stock_image_count` is what knows.

            It is here, once, rather than over each image: Pexels' API terms ask
            for "a prominent link to Pexels", which a footer line satisfies,
            while a chip on every card would stamp forty catalog tiles with text
            the customer did not write. The per-image credit is still stored
            (`attribution` on every record) - this is a rendering decision, not a
            data one, so a per-image caption can be added later with no
            migration.
          */}
          {(system?.stock_image_count ?? 0) > 0 && (
            <Typography
              as="p"
              variant="caption"
              textAlign="center"
              color="var(--muted-foreground)"
              marginTop={8}
              styles={{ lineHeight: 1.6 }}
            >
              {t.rich("stockPhotos", {
                pexels: (chunks) => (
                  <a
                    href="https://www.pexels.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="footer__link"
                  >
                    {chunks}
                  </a>
                ),
                pixabay: (chunks) => (
                  <a
                    href="https://pixabay.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="footer__link"
                  >
                    {chunks}
                  </a>
                ),
              })}
            </Typography>
          )}
        </Box>
      </Container>
    </footer>
  );
}
