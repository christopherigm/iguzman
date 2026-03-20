import { setRequestLocale } from 'next-intl/server';
import { getSystem } from '@/lib/system';
import { API_URL } from '@/lib/config';
import { SignInForm } from './auth-form';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function AuthPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const system = await getSystem();
  const apiUrl = API_URL;

  return <SignInForm systemId={system?.id ?? 1} apiUrl={apiUrl} />;
}
