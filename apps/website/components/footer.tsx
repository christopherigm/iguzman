import Image from 'next/image';
import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';
import { Container } from '@repo/ui/core-elements/container';
import { Grid } from '@repo/ui/core-elements/grid';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { ThemeSwitch } from '@repo/ui/theme-switch';
import { LocaleSwitcher } from '@repo/ui/core-elements/locale-switcher';
import { routing } from '@repo/i18n/routing';
import { type System } from '@/lib/system';
import './footer.css';

type Props = {
  system: System | null;
};

export async function Footer({ system }: Props) {
  const [t, locale] = await Promise.all([
    getTranslations('Footer'),
    getLocale(),
  ]);

  const description =
    locale === 'en'
      ? (system?.en_site_description ?? system?.site_description)
      : system?.site_description;

  const navLinks = [
    { label: t('home'), href: '/' },
    { label: t('products'), href: '/products' },
    { label: t('services'), href: '/services' },
    { label: t('blog'), href: '/blog' },
    { label: t('successStories'), href: '/success-stories' },
  ];

  const companyLinks = [
    { label: t('about'), href: '/about' },
    { label: t('careers'), href: '/careers' },
    { label: t('privacyPolicy'), href: '/privacy-policy' },
    { label: t('terms'), href: '/terms' },
    { label: t('userData'), href: '/user-data' },
  ];

  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer">
      <Container paddingX={10}>
        <Grid container spacing={4}>
          {/* Column 1 – Brand */}
          <Grid size={{ xs: 12, sm: 4 }}>
            <Box display="flex" flexDirection="column" gap="20px">
              {system?.img_logo && (
                <Image
                  src={system.img_logo}
                  alt={system.site_name}
                  width={140}
                  height={44}
                  className="footer__logo"
                />
              )}
              {system?.site_name && (
                <Typography as="span" variant="h5" fontWeight={700}>
                  {system.site_name}
                </Typography>
              )}
              {system?.slogan && (
                <Typography as="p" variant="body-sm" className="footer__slogan">
                  {system.slogan}
                </Typography>
              )}
              {description && (
                <Typography
                  as="p"
                  variant="body-sm"
                  className="footer__description"
                >
                  {description}
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

          {/* Column 2 – Navigation */}
          <Grid size={{ xs: 12, sm: 4, md: 4 }}>
            <Typography
              as="h3"
              variant="h5"
              fontWeight={700}
              className="footer__col-heading"
            >
              {t('navigationHeading')}
            </Typography>
            <Grid container spacingY={1} spacingX={2}>
              {navLinks.map((link) => (
                <Grid key={link.href} size={{ xs: 6, sm: 12 }}>
                  <Link href={link.href} prefetch className="footer__link">
                    {link.label}
                  </Link>
                </Grid>
              ))}
            </Grid>
          </Grid>

          {/* Column 3 – Company */}
          <Grid size={{ xs: 12, sm: 4, md: 4 }}>
            <Typography
              as="h3"
              variant="h5"
              fontWeight={700}
              className="footer__col-heading"
            >
              {t('companyHeading')}
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
        </Grid>

        {/* Bottom bar */}
        <Box className="footer__bottom">
          <Typography
            as="p"
            variant="body-sm"
            textAlign="center"
            className="footer__description"
          >
            {t('copyright', {
              year: currentYear,
              name: system?.site_name ?? '',
            })}
          </Typography>
        </Box>
      </Container>
    </footer>
  );
}
