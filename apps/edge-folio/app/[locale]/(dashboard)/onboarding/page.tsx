import { getTranslations } from 'next-intl/server';
import { OnboardingForm } from './onboarding-form';

export async function generateMetadata() {
  const t = await getTranslations('OnboardingPage');
  return { title: t('title') };
}

export default async function OnboardingPage() {
  return <OnboardingForm />;
}
