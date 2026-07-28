import { setRequestLocale } from 'next-intl/server';
import { VerifyEmail } from '@repo/auth/verify-email';

type Props = { params: Promise<{ locale: string; token: string }> };

export default async function VerifyEmailPage({ params }: Props) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  return <VerifyEmail token={token} />;
}
