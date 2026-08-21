import { setRequestLocale } from "next-intl/server";
import { AccountForm } from "@repo/auth/account-form";
import { RewardsCard } from "./rewards-card";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function MyAccountPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Above the form: the points are what a customer arriving from a confirmation
  // email came here to see, and the profile fields are what they came here to
  // edit. The card renders nothing at all when the tenant runs no program, so
  // this page is unchanged for every other site. `AccountForm` is shared with
  // cinelog and edge-folio through `@repo/auth`, which is why the card sits
  // beside it rather than inside it.
  return (
    <>
      <RewardsCard locale={locale} />
      <AccountForm />
    </>
  );
}
