import { setRequestLocale } from "next-intl/server";
import { AccountForm } from "@repo/auth/account-form";
import { getRewards } from "@/lib/rewards";
import { RewardsCard } from "./rewards-card";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function MyAccountPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  // The rewards card goes in `AccountForm`'s `aside` column, not above it. The
  // form owns the page's only container - the one that clears the fixed navbar -
  // so a sibling rendered before it had nothing holding it below the bar and was
  // painted underneath it. The prop is also what widens the page to two columns
  // (`sm` and up), which is where the next site-specific card - addresses, say -
  // goes; `AccountForm` is shared with cinelog and edge-folio through
  // `@repo/auth`, which is why these cards sit beside it rather than inside it.
  //
  // ⚠ The rewards read happens **here**, not in the card, because an element
  // that renders null is still an element: passing one unconditionally would
  // give every tenant with no program a two-column page with an empty half.
  const rewards = await getRewards();

  return (
    <AccountForm
      aside={
        rewards.enabled ? (
          <RewardsCard rewards={rewards} locale={locale} />
        ) : undefined
      }
    />
  );
}
