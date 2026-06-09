import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EducationPage } from './education-page';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = (await getTranslations({ locale, namespace: 'EducationPage' })) as (
    key: string,
  ) => string;
  return { title: t('title') };
}

export default async function EducationRoute({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <EducationPage />;
}
