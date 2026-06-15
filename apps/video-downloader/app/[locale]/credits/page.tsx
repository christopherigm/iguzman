import { setRequestLocale } from "next-intl/server";
import { CreditsPageContent } from "@/components/credits-page";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function CreditsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <CreditsPageContent />;
}
