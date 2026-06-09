import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ApplicationsPage } from './applications-page';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = (await getTranslations({ locale, namespace: 'ApplicationsPage' })) as (
    key: string,
  ) => string;
  return { title: t('title') };
}

export default async function ApplicationsRoute({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ApplicationsPage />;
}
