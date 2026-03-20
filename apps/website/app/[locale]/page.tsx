import { setRequestLocale } from 'next-intl/server';
import { Box } from '@repo/ui/core-elements/box';
import { Container } from '@repo/ui/core-elements/container';
import { getSystem } from '@/lib/system';
import { Hero } from '@/components/hero';
import { SuccessStories } from '@/components/success-stories';
import { CompanyHighlights } from '@/components/company-highlights';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function Home({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const system = await getSystem();

  const highlightsBg =
    system?.highlights_bg ??
    `linear-gradient(135deg, ${system?.primary_color ?? '#2196f3'}1a 0%, ${system?.secondary_color ?? '#e040fb'}0d 100%)`;

  return (
    <>
      <Hero system={system} />
      <Container paddingX={10}>
        <SuccessStories />
      </Container>
      <Box styles={{ width: '100%', background: highlightsBg }}>
        <Container paddingX={10}>
          <CompanyHighlights />
        </Container>
      </Box>
    </>
  );
}
