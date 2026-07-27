import Image from "next/image";
import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { Grid } from "@repo/ui/core-elements/grid";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { ThemeSwitch } from "@repo/ui/theme-switch";
import { LocaleSwitcher } from "@repo/ui/core-elements/locale-switcher";
import { routing } from "@repo/i18n/routing";
import { type System } from "@/lib/system";
import { MENU_ALL_PATH } from "@/lib/menu-kinds";
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
  const navLinks = [
    { label: t("home"), href: "/" },
    ...((system?.product_count ?? 0) > 0
      ? [{ label: t("products"), href: "/categories/products" }]
      : []),
    ...((system?.service_count ?? 0) > 0
      ? [{ label: t("services"), href: "/categories/services" }]
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

  return (
    <footer className="footer">
      <Container paddingX={10}>
        <Grid container spacing={4}>
          {/* Column 1 - Brand */}
          <Grid size={{ xs: 12, sm: 4 }}>
            <Box display="flex" flexDirection="column" gap="20px">
              <Image
                src={logo}
                alt={system?.site_name ?? ""}
                width={140}
                height={44}
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
        </Box>
      </Container>
    </footer>
  );
}
