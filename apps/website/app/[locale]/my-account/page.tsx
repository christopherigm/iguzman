import { setRequestLocale } from 'next-intl/server';
import { API_URL } from '@/lib/config';
import { MyAccountForm } from './my-account-form';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function MyAccountPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <MyAccountForm apiUrl={API_URL} />;
}
