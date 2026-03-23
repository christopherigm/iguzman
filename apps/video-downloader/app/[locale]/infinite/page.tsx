import { setRequestLocale } from 'next-intl/server';
import { InfinitePage } from '@/components/infinite-page';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <InfinitePage />;
}
