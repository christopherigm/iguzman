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
import './footer.css';

export async function Footer({ logo }: { logo: string }) {
  const [t, locale] = await Promise.all([
    getTranslations('Footer'),
    getLocale(),
  ]);

  const appLinks = [
    { label: t('home'), href: '/' },
    { label: t('account'), href: '/account' },
  ];

  const legalLinks = [
    { label: t('privacyPolicy'), href: '/privacy-policy' },
    { label: t('terms'), href: '/terms' },
    { label: t('userData'), href: '/user-data' },
  ];

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
                alt="Edge Folio"
                width={140}
                height={44}
                className="footer__logo"
              />
              <Typography as="span" variant="h5" fontWeight={700}>
                Edge Folio
              </Typography>
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

          {/* Column 2 - App */}
          <Grid size={{ xs: 12, sm: 4 }}>
            <Typography
              as="h3"
              variant="h5"
              fontWeight={700}
              className="footer__col-heading"
            >
              {t('appHeading')}
            </Typography>
            <Grid container spacingY={1} spacingX={2}>
              {appLinks.map((link) => (
                <Grid key={link.href} size={{ xs: 6, sm: 12 }}>
                  <Link href={link.href} prefetch className="footer__link">
                    {link.label}
                  </Link>
                </Grid>
              ))}
            </Grid>
          </Grid>

          {/* Column 3 - Legal */}
          <Grid size={{ xs: 12, sm: 4 }}>
            <Typography
              as="h3"
              variant="h5"
              fontWeight={700}
              className="footer__col-heading"
            >
              {t('legalHeading')}
            </Typography>
            <Grid container spacingY={1} spacingX={2}>
              {legalLinks.map((link) => (
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
            {t('copyright', { year: currentYear })}
          </Typography>
        </Box>
      </Container>
    </footer>
  );
}
