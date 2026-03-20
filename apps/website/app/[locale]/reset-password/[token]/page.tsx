import { setRequestLocale } from 'next-intl/server';
import { API_URL } from '@/lib/config';
import { ResetPasswordClient } from './reset-password-client';

type Props = {
  params: Promise<{ locale: string; token: string }>;
};

export default async function ResetPasswordPage({ params }: Props) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  const apiUrl = API_URL;

  return <ResetPasswordClient token={token} apiUrl={apiUrl} />;
}
