import { setRequestLocale } from "next-intl/server";
import { TvLinkForm } from "./tv-link-form";

type Props = { params: Promise<{ locale: string }> };

export default async function TvLinkPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TvLinkForm />;
}
