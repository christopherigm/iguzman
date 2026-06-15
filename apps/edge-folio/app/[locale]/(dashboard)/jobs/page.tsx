import { getTranslations, setRequestLocale } from 'next-intl/server';
import { JobsPage } from './jobs-page';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = (await getTranslations({ locale, namespace: 'JobsPage' })) as (
    key: string,
  ) => string;
  return { title: t('title') };
}

export default async function JobsRoute({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <JobsPage />;
}
