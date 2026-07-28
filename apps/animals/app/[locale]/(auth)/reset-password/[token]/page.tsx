import { setRequestLocale } from 'next-intl/server';
import { ResetPasswordForm } from '@repo/auth/reset-password-form';

type Props = { params: Promise<{ locale: string; token: string }> };

export default async function ResetPasswordPage({ params }: Props) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  return <ResetPasswordForm token={token} />;
}
