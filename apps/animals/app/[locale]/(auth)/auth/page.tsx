import { setRequestLocale } from 'next-intl/server';
import { NavbarSpacer } from '@repo/ui/core-elements/navbar';
import { AuthForm } from '@repo/auth/auth-form';

type Props = { params: Promise<{ locale: string }> };

export default async function AuthPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  // AuthForm takes an optional `resolveRedirect` - where to land once the user is
  // authenticated (it defaults to '/'). An app that needs to send, say, a user with
  // an incomplete profile to /onboarding wraps this in a thin 'use client' component:
  // a function cannot cross the server/client boundary.
  return (
    <>
      <NavbarSpacer />
      <AuthForm />
    </>
  );
}
