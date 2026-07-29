import { getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";

/**
 * What a contribute page renders for a reader who is not signed in.
 *
 * **Deliberately not a redirect, and `/contribute` is deliberately absent from
 * `proxy.ts`'s `protectedPrefixes`.** The FAB is shown to everyone - that is how a
 * reader discovers the site takes contributions at all - so an anonymous press is
 * the *expected* path, not an attempt to reach something private. The prefix guard
 * would answer it by bouncing to `/auth` with no explanation of what the reader was
 * about to do and no way back afterwards (`createAuthProxy`'s redirect carries no
 * return path). This says what the page is for and offers the sign-in.
 *
 * Nothing is protected by rendering this: the endpoint behind the flow requires a
 * session, and Django re-derives that from the token on every call.
 *
 * A server component, so it is rendered on the same pass that read the session -
 * there is no moment where the page shows a form and then takes it away.
 */

interface Props {
  /** Why *this* flow needs an account, in one sentence. The rest is generic. */
  description: string;
}

export async function SignInPrompt({ description }: Props) {
  const t = await getTranslations("Contribute");

  return (
    <Card gap={16} padding={24} maxWidth={520}>
      <Box flexDirection="column" gap={8}>
        <Typography as="h2" variant="h3" fontWeight={700}>
          {t("signInTitle")}
        </Typography>
        <Typography variant="body" color="var(--foreground-muted, #6b7280)">
          {description}
        </Typography>
      </Box>

      <Box alignItems="center" gap={12} flexWrap="wrap">
        {/* `/auth` carries both sign-in and sign-up, so one button covers the
            reader who has an account and the one who is about to make one. */}
        <Button text={t("signIn")} href="/auth" kind="primary" size="lg" />
        <Typography variant="caption" color="var(--foreground-muted, #6b7280)">
          {t("signUpHint")}
        </Typography>
      </Box>
    </Card>
  );
}
