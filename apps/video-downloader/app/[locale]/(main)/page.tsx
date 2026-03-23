import { setRequestLocale } from 'next-intl/server';
import { Container } from '@repo/ui/core-elements/container';
import { DownloadPage } from '@/components/download-page';
import { ThemeSwitch } from '@repo/ui/theme-switch';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function Home({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <Container
      display="flex"
      alignItems="center"
      flexDirection="column"
      paddingX={10}
    >
      <br />
      <br />
      <br />
      <br />
      <DownloadPage />
      <br />
      <ThemeSwitch hideOnMobile />
      <br />
      <br />
    </Container>
  );
}
