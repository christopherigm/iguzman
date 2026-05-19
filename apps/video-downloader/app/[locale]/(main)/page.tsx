import { setRequestLocale } from 'next-intl/server';
import { Container } from '@repo/ui/core-elements/container';
import { DownloadPage } from '@/components/download-page';
import { ThemeSwitch } from '@repo/ui/theme-switch';
import { NavbarSpacer, PageBottomSpacer } from '@repo/ui/core-elements/navbar';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function Home({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const serverDate = new Date().toISOString();

  return (
    <>
      <NavbarSpacer />
      <Container
        display="flex"
        alignItems="center"
        flexDirection="column"
        paddingX={10}
        paddingTop={16}
        gap={16}
      >
        <DownloadPage serverDate={serverDate} />
        <ThemeSwitch hideOnMobile />
      </Container>
      <PageBottomSpacer />
    </>
  );
}
