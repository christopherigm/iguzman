import { setRequestLocale } from "next-intl/server";
import { NavbarSpacer } from "@repo/ui/core-elements/navbar";
import { AuthFormWithNext } from "./auth-form-with-next";

type Props = {
  params: Promise<{ locale: string }>;
  // Where to land after signing in, set by whatever sent the visitor here - see
  // `AuthFormWithNext`, which is also what validates it.
  searchParams: Promise<{ next?: string }>;
};

export default async function AuthPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { next } = await searchParams;

  return (
    <>
      <NavbarSpacer />
      <AuthFormWithNext next={next} />
    </>
  );
}
