import { setRequestLocale } from 'next-intl/server';
import { Container } from '@repo/ui/core-elements/container';
import { DownloadForm } from '../../components/download-form';
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
      <DownloadForm />
      <br />
      <ThemeSwitch />
    </Container>
  );
}
