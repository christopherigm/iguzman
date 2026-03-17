import { setRequestLocale } from 'next-intl/server';
import { VerifyEmailClient } from './verify-email-client';

type Props = {
  params: Promise<{ locale: string; token: string }>;
};

export default async function VerifyEmailPage({ params }: Props) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';

  return <VerifyEmailClient token={token} apiUrl={apiUrl} />;
}
