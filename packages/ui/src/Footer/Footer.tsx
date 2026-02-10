'use client';

import { useState, useMemo, useCallback } from 'react';
import type { HTMLAttributes } from 'react';

import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import ButtonGroup from '@mui/material/ButtonGroup';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import GitHubIcon from '@mui/icons-material/GitHub';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import XIcon from '@mui/icons-material/X';
import EmailIcon from '@mui/icons-material/Email';
import LanguageIcon from '@mui/icons-material/Language';

import type { Language } from '@iguzman/helpers/types';
import ThemeModeToggle from '@iguzman/ui/ThemeModeToggle/ThemeModeToggle';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/** Single navigation link inside a footer column. */
interface FooterLink {
  /** Display label for the link. */
  label: string;
  /** URL the link points to. */
  href: string;
}

/** A titled group of links rendered as a footer column. */
interface FooterSection {
  /** Column heading. */
  title: string;
  /** Links listed under this heading. */
  links: FooterLink[];
}

/**
 * Props for the {@link Footer} component.
 *
 * @example
 * ```tsx
 * <Footer
 *   language="en"
 *   brandName="Acme Inc."
 *   github="https://github.com/acme"
 * />
 * ```
 */
export interface FooterProps extends Omit<
  HTMLAttributes<HTMLElement>,
  'children'
> {
  /** Active language code. Defaults to `"en"`. */
  language?: Language;
  /** Brand / company name shown in the footer. */
  brandName?: string;
  /** Short tagline rendered below the brand name. */
  tagline?: string;
  /** GitHub profile URL. */
  github?: string;
  /** LinkedIn profile URL. */
  linkedin?: string;
  /** X (Twitter) profile URL. */
  twitter?: string;
  /** Contact email address. */
  email?: string;
  /** Override the default navigation sections. */
  sections?: FooterSection[];
  /** Callback fired when the language changes. */
  onLanguageChange?: (language: Language) => void;
  /** Background colour override (CSS value). */
  bgColor?: string;
}

/* ------------------------------------------------------------------ */
/*  i18n labels                                                       */
/* ------------------------------------------------------------------ */

const LABELS: Record<Language, Record<string, string>> = {
  en: {
    product: 'Product',
    features: 'Features',
    pricing: 'Pricing',
    docs: 'Documentation',
    changelog: 'Changelog',
    company: 'Company',
    about: 'About Us',
    careers: 'Careers',
    blog: 'Blog',
    contact: 'Contact',
    resources: 'Resources',
    community: 'Community',
    support: 'Support',
    guides: 'Guides',
    api: 'API Reference',
    legal: 'Legal',
    privacy: 'Privacy Policy',
    terms: 'Terms of Service',
    cookies: 'Cookies',
    licenses: 'Licenses',
    rights: 'All rights reserved.',
    language: 'Language',
  },
  es: {
    product: 'Producto',
    features: 'Características',
    pricing: 'Precios',
    docs: 'Documentación',
    changelog: 'Historial',
    company: 'Empresa',
    about: 'Nosotros',
    careers: 'Carreras',
    blog: 'Blog',
    contact: 'Contacto',
    resources: 'Recursos',
    community: 'Comunidad',
    support: 'Soporte',
    guides: 'Guías',
    api: 'Referencia API',
    legal: 'Legal',
    privacy: 'Política de Privacidad',
    terms: 'Términos de Servicio',
    cookies: 'Cookies',
    licenses: 'Licencias',
    rights: 'Todos los derechos reservados.',
    language: 'Idioma',
  },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Build the default navigation sections from the current label set. */
const buildDefaultSections = (t: Record<string, string>): FooterSection[] => [
  {
    title: t.product,
    links: [
      { label: t.features, href: '/features' },
      { label: t.pricing, href: '/pricing' },
      { label: t.docs, href: '/docs' },
      { label: t.changelog, href: '/changelog' },
    ],
  },
  {
    title: t.company,
    links: [
      { label: t.about, href: '/about' },
      { label: t.careers, href: '/careers' },
      { label: t.blog, href: '/blog' },
      { label: t.contact, href: '/contact' },
    ],
  },
  {
    title: t.resources,
    links: [
      { label: t.community, href: '/community' },
      { label: t.support, href: '/support' },
      { label: t.guides, href: '/guides' },
      { label: t.api, href: '/api' },
    ],
  },
  {
    title: t.legal,
    links: [
      { label: t.privacy, href: '/privacy' },
      { label: t.terms, href: '/terms' },
      { label: t.cookies, href: '/cookies' },
      { label: t.licenses, href: '/licenses' },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */

/** Renders a single navigation column. */
const FooterColumn = ({ section }: { section: FooterSection }) => (
  <Box>
    <Typography
      variant="subtitle2"
      fontWeight={700}
      textTransform="uppercase"
      letterSpacing={1}
      gutterBottom
      color="text.primary"
    >
      {section.title}
    </Typography>

    <Stack spacing={1} mt={1}>
      {section.links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          underline="none"
          color="text.secondary"
          variant="body2"
          sx={{
            transition: 'color 0.2s',
            '&:hover': { color: 'primary.main' },
          }}
        >
          {link.label}
        </Link>
      ))}
    </Stack>
  </Box>
);

/** Social icon button with consistent sizing. */
const SocialButton = ({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) => (
  <IconButton
    component="a"
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    aria-label={label}
    size="small"
    sx={{
      color: 'text.secondary',
      transition: 'color 0.2s, transform 0.2s',
      '&:hover': { color: 'primary.main', transform: 'translateY(-2px)' },
    }}
  >
    {children}
  </IconButton>
);

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

/**
 * Full-width responsive footer with navigation columns, social links,
 * a language toggle, and a theme-mode toggle.
 *
 * The layout collapses into a single-column stack on mobile and expands
 * to a multi-column grid on larger screens.
 *
 * @example
 * ```tsx
 * import Footer from '@iguzman/ui/Footer';
 *
 * function App() {
 *   return (
 *     <Footer
 *       language="en"
 *       brandName="My App"
 *       github="https://github.com/my-app"
 *       onLanguageChange={(lang) => console.log(lang)}
 *     />
 *   );
 * }
 * ```
 */
const Footer = ({
  language: initialLanguage = 'en',
  brandName = 'iguzman',
  tagline,
  github,
  linkedin,
  twitter,
  email,
  sections,
  onLanguageChange,
  bgColor,
  ...rest
}: FooterProps) => {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const t = useMemo(() => LABELS[language], [language]);

  const defaultTagline = useMemo(
    () =>
      language === 'en'
        ? 'Building exceptional digital experiences.'
        : 'Creando experiencias digitales excepcionales.',
    [language],
  );

  const resolvedSections = useMemo(
    () => sections ?? buildDefaultSections(t),
    [sections, t],
  );

  const handleLanguageChange = useCallback(
    (lang: Language) => {
      setLanguage(lang);
      onLanguageChange?.(lang);
    },
    [onLanguageChange],
  );

  const currentYear = new Date().getFullYear();

  const hasSocialLinks = github || linkedin || twitter || email;

  return (
    <Box
      component="footer"
      sx={{
        bgcolor: bgColor ?? 'background.paper',
        borderTop: '1px solid',
        borderColor: 'divider',
        pt: { xs: 6, md: 8 },
        pb: { xs: 3, md: 4 },
      }}
      {...rest}
    >
      <Container maxWidth="lg">
        {/* ---- Top section: brand + nav columns ---- */}
        <Grid container spacing={{ xs: 4, md: 6 }}>
          {/* Brand column */}
          <Grid size={{ xs: 12, md: 3 }}>
            <Typography variant="h6" fontWeight={800} color="text.primary">
              {brandName}
            </Typography>

            <Typography
              variant="body2"
              color="text.secondary"
              mt={1}
              maxWidth={280}
              lineHeight={1.7}
            >
              {tagline ?? defaultTagline}
            </Typography>

            {/* Social icons */}
            {hasSocialLinks && (
              <Stack direction="row" spacing={0.5} mt={2}>
                {github && (
                  <SocialButton href={github} label="GitHub">
                    <GitHubIcon fontSize="small" />
                  </SocialButton>
                )}
                {linkedin && (
                  <SocialButton href={linkedin} label="LinkedIn">
                    <LinkedInIcon fontSize="small" />
                  </SocialButton>
                )}
                {twitter && (
                  <SocialButton href={twitter} label="X (Twitter)">
                    <XIcon fontSize="small" />
                  </SocialButton>
                )}
                {email && (
                  <SocialButton href={`mailto:${email}`} label="Email">
                    <EmailIcon fontSize="small" />
                  </SocialButton>
                )}
              </Stack>
            )}
          </Grid>

          {/* Navigation columns */}
          {resolvedSections.map((section) => (
            <Grid key={section.title} size={{ xs: 6, sm: 3, md: 'grow' }}>
              <FooterColumn section={section} />
            </Grid>
          ))}
        </Grid>

        <Divider sx={{ my: { xs: 4, md: 5 } }} />

        {/* ---- Bottom bar: copyright + toggles ---- */}
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          justifyContent="space-between"
          spacing={2}
        >
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            spacing={2}
          >
            {/* Language toggle */}
            <Stack direction="row" alignItems="center" spacing={1}>
              <LanguageIcon fontSize="small" sx={{ color: 'text.secondary' }} />
              <ButtonGroup size="small" variant="outlined">
                <Button
                  variant={language === 'en' ? 'contained' : 'outlined'}
                  onClick={() => handleLanguageChange('en')}
                  sx={{ textTransform: 'none', minWidth: 48 }}
                >
                  EN
                </Button>
                <Button
                  variant={language === 'es' ? 'contained' : 'outlined'}
                  onClick={() => handleLanguageChange('es')}
                  sx={{ textTransform: 'none', minWidth: 48 }}
                >
                  ES
                </Button>
              </ButtonGroup>
              {/* Theme toggle */}
              <ThemeModeToggle language={language} mini fullWidth={false} />
            </Stack>
          </Stack>

          <Divider sx={{ my: { xs: 4, md: 5 } }} />

          <Typography variant="caption" color="text.secondary">
            &copy; {currentYear} {brandName}. {t.rights}
          </Typography>
        </Stack>
      </Container>
    </Box>
  );
};

export default Footer;
