import { setRequestLocale } from "next-intl/server";
import { AccountForm } from "@repo/auth/account-form";

type Props = { params: Promise<{ locale: string }> };

export default async function AccountPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AccountForm />;
}
