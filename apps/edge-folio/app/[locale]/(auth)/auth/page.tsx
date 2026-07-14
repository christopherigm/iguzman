import { setRequestLocale } from "next-intl/server";
import { NavbarSpacer } from "@repo/ui/core-elements/navbar";
import { EdgeFolioAuthForm } from "./auth-form";

type Props = { params: Promise<{ locale: string }> };

export default async function AuthPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <NavbarSpacer />
      <EdgeFolioAuthForm />
    </>
  );
}
