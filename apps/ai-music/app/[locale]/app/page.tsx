import { setRequestLocale } from 'next-intl/server';
import { MusicForm } from '@/components/music-form';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function AppPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <MusicForm />;
}
