import { setRequestLocale } from 'next-intl/server';
import { Box } from '@repo/ui/core-elements/box';
import { Container } from '@repo/ui/core-elements/container';
import { getSystem } from '@/lib/system';
import { Hero } from '@/components/hero';
import { SuccessStories } from '@/components/success-stories';
import { CompanyHighlights } from '@/components/company-highlights';
import { CatalogCategories } from '@/components/catalog-categories';
import { CatalogItems } from '@/components/catalog-items';

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

  const catalogItemsBg =
    system?.catalog_items_bg ??
    `linear-gradient(135deg, ${system?.secondary_color ?? '#e040fb'}0d 50%, ${system?.primary_color ?? '#177ed2'}1a 100%)`;

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
      <Container paddingX={10}>
        <CatalogCategories />
      </Container>
      <Box styles={{ width: '100%', background: catalogItemsBg }}>
        <Container paddingX={10}>
          <CatalogItems />
        </Container>
      </Box>
    </>
  );
}
