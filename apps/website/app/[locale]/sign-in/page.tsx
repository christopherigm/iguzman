import { setRequestLocale } from 'next-intl/server';
import { getSystem } from '@/lib/system';
import { SignInForm } from './sign-in-form';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function SignInPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const system = await getSystem();

  return <SignInForm systemId={system?.id ?? 1} />;
}
