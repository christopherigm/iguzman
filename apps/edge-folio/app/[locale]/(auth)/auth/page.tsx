import { setRequestLocale } from "next-intl/server";
import { AuthForm } from "./auth-form";
import { NavbarSpacer } from "@repo/ui/core-elements/navbar";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function AuthPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <NavbarSpacer />
      <AuthForm />
    </>
  );
}
