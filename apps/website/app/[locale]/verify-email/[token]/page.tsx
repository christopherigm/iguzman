import { setRequestLocale } from 'next-intl/server';
import { API_URL } from '@/lib/config';
import { VerifyEmailClient } from './verify-email-client';

type Props = {
  params: Promise<{ locale: string; token: string }>;
};

export default async function VerifyEmailPage({ params }: Props) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  const apiUrl = API_URL;

  return <VerifyEmailClient token={token} apiUrl={apiUrl} />;
}
