import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Container } from '@repo/ui/core-elements/container';
import { Typography } from '@repo/ui/core-elements/typography';
import { Box } from '@repo/ui/core-elements/box';
import { NavbarSpacer, PageBottomSpacer } from '@repo/ui/core-elements/navbar';
import './terms.css';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function TermsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('TermsPage');

  return (
    <>
      <NavbarSpacer />
      <Container size="sm" paddingX={24}>
        <Box marginTop={48} marginBottom={8}>
          <Typography as="h1" variant="h2">
            {t('title')}
          </Typography>
          <Typography variant="caption" marginTop={8} className="terms-meta">
            {t('lastUpdated')}
          </Typography>
        </Box>

        <Typography variant="body" marginBottom={40} className="terms-intro">
          {t('intro')}
        </Typography>

        <Box className="terms-section">
          <Typography as="h2" variant="h5" marginBottom={10}>{t('s1Title')}</Typography>
          <Typography variant="body">{t('s1Body')}</Typography>
        </Box>

        <Box className="terms-section">
          <Typography as="h2" variant="h5" marginBottom={10}>{t('s2Title')}</Typography>
          <Typography variant="body">{t('s2Body')}</Typography>
        </Box>

        <Box className="terms-section">
          <Typography as="h2" variant="h5" marginBottom={10}>{t('s3Title')}</Typography>
          <Typography variant="body">{t('s3Body')}</Typography>
        </Box>

        <Box className="terms-section">
          <Typography as="h2" variant="h5" marginBottom={10}>{t('s4Title')}</Typography>
          <Typography variant="body">{t('s4Body')}</Typography>
        </Box>

        <Box className="terms-section">
          <Typography as="h2" variant="h5" marginBottom={10}>{t('s5Title')}</Typography>
          <Typography variant="body">{t('s5Body')}</Typography>
        </Box>

        <Box className="terms-section">
          <Typography as="h2" variant="h5" marginBottom={10}>{t('s6Title')}</Typography>
          <Typography variant="body">{t('s6Body')}</Typography>
        </Box>

        <Box className="terms-section">
          <Typography as="h2" variant="h5" marginBottom={10}>{t('s7Title')}</Typography>
          <Typography variant="body">{t('s7Body')}</Typography>
        </Box>

        <Box className="terms-section">
          <Typography as="h2" variant="h5" marginBottom={10}>{t('s8Title')}</Typography>
          <Typography variant="body">{t('s8Body')}</Typography>
        </Box>

        <Box className="terms-section">
          <Typography as="h2" variant="h5" marginBottom={10}>{t('s9Title')}</Typography>
          <Typography variant="body">{t('s9Body')}</Typography>
        </Box>

        <Box className="terms-section">
          <Typography as="h2" variant="h5" marginBottom={10}>{t('s10Title')}</Typography>
          <Typography variant="body">{t('s10Body')}</Typography>
        </Box>

        <Box className="terms-section">
          <Typography as="h2" variant="h5" marginBottom={10}>{t('s11Title')}</Typography>
          <Typography variant="body">{t('s11Body')}</Typography>
        </Box>

        <Box className="terms-section">
          <Typography as="h2" variant="h5" marginBottom={10}>{t('s12Title')}</Typography>
          <Typography variant="body">{t('s12Body')}</Typography>
        </Box>
      </Container>
      <PageBottomSpacer />
    </>
  );
}
