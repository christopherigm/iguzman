import { setRequestLocale } from "next-intl/server";
import { StorageForm } from "./storage-form";

type Props = { params: Promise<{ locale: string }> };

export default async function StoragePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <StorageForm />;
}
