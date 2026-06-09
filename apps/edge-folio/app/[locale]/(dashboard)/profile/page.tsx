import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ProfilePage } from './profile-page';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = (await getTranslations({ locale, namespace: 'ProfilePage' })) as (
    key: string,
  ) => string;
  return { title: t('title') };
}

export default async function ProfileRoute({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ProfilePage />;
}
