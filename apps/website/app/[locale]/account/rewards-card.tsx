import { getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Badge } from "@repo/ui/core-elements/badge";
import { Typography } from "@repo/ui/core-elements/typography";
import { tierName, type RewardsSummary } from "@/lib/rewards";

/**
 * The customer's points, on their account page.
 *
 * It exists because the confirmation email's "See my points" button points
 * here: without it that button is a dead end, which is worse than not sending
 * one. A guest's copy of the same email says "create an account to claim" and
 * leads to `/auth` instead - the points are held against their address until
 * then and are deliberately not spendable, so the two halves of that email must
 * not be collapsed into one.
 *
 * ⚠ **Renders nothing at all when the tenant runs no program**, rather than an
 * empty card saying "0 points": a site with rewards switched off should look
 * exactly as it did before the feature existed. `getRewards` returns the same
 * "off" shape for a signed-out reader and for an unreachable API, so there is
 * one path to nothing rather than three.
 *
 * ⚠ **The summary is a prop, not a read of its own**, because the page has to
 * know whether there is a card *before* it renders one: an element that renders
 * null is still an element, and handing one to `AccountForm`'s `aside` would
 * split the page into two columns and leave the left one empty on every tenant
 * with no program. The page reads `getRewards()` once and decides.
 */
export async function RewardsCard({
  rewards,
  locale,
}: {
  rewards: RewardsSummary;
  locale: string;
}) {
  const t = await getTranslations("Cart");

  if (!rewards.enabled) return null;

  const { tier, next_tier: next } = rewards;
  // How far off the next rung. Measured on the **balance** only as a rough
  // encouragement - the real qualification is points *earned* inside the tier's
  // own trailing window, which the API resolves and this deliberately does not
  // try to re-derive. Saying "about" in the copy is what keeps that honest.
  const toNext = next ? Math.max(0, next.threshold - rewards.balance) : 0;

  return (
    <Card
      gap={12}
      backgroundColor="var(--surface-1)"
      elevation={3}
      border="none"
    >
      <Box
        alignItems="center"
        justifyContent="space-between"
        gap={12}
        flexWrap="wrap"
      >
        <Typography as="h2" variant="h5" margin={0} color="var(--on-surface)">
          {t("rewardsHeading")}
        </Typography>
        {tier && (
          // The tenant's own colour for the rung when they set one; the site's
          // accent otherwise, so an untouched field still produces a badge that
          // looks like the site rather than a default blue.
          <Badge
            variant="filled"
            size="sm"
            color={tier.color || "var(--accent)"}
            textColor="#fff"
          >
            {tierName(tier, locale)}
          </Badge>
        )}
      </Box>

      <Typography
        as="p"
        variant="h2"
        margin={0}
        fontWeight={700}
        color="var(--accent-text)"
      >
        {t("pointsPrice", { points: rewards.balance })}
      </Typography>

      {next && (
        <Typography variant="caption" margin={0} color="var(--foreground)">
          {t("pointsToNextTier", {
            points: toNext,
            tier: tierName(next, locale),
          })}
        </Typography>
      )}

      {rewards.transactions.length > 0 && (
        <>
          <Box height={1} flex="0 0 auto" backgroundColor="var(--border)" />
          <Box flexDirection="column" gap={6}>
            {rewards.transactions.map((row) => (
              <Box
                key={row.id}
                alignItems="baseline"
                justifyContent="space-between"
                gap={10}
              >
                <Typography
                  as="span"
                  variant="caption"
                  color="var(--foreground)"
                >
                  {/* The tenant's own words, written when the points moved.
                      Never translated: it is authored once by whoever moved
                      them, and a key would have to guess the language. */}
                  {row.note || t(`pointsKind_${row.kind}`)}
                </Typography>
                <Typography
                  as="span"
                  variant="caption"
                  fontWeight={700}
                  // Signed, and coloured by the sign rather than by the kind -
                  // there are five kinds and only two directions.
                  color={
                    row.points > 0 ? "var(--accent-text)" : "var(--foreground)"
                  }
                >
                  {row.points > 0 ? `+${row.points}` : row.points}
                </Typography>
              </Box>
            ))}
          </Box>
        </>
      )}
    </Card>
  );
}
