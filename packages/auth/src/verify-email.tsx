"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@repo/i18n/navigation";
import { Container } from "@repo/ui/core-elements/container";
import { Box } from "@repo/ui/core-elements/box";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { Typography } from "@repo/ui/core-elements/typography";
import { verifyEmail, ApiError } from "./client";

/**
 * The page a verification email links to: redeems the token on mount, then
 * counts down and sends the user home. Text comes from the app's own
 * `VerifyEmailPage` namespace.
 *
 * Redeeming the link also **signs the user in** - the API returns a token pair
 * with the verification and the route handler puts it in the cookies (see
 * `verifyEmailRoute`). So this lands them home authenticated rather than on a
 * sign-in form for an address they just proved they own. `signedIn` is what the
 * handler reports; an API that does not mint tokens leaves it false and the old
 * "you can now sign in" copy is shown instead.
 */

type Status = "loading" | "success" | "expired" | "invalid";

const REDIRECT_SECONDS = 3;

export function VerifyEmail({ token }: { token: string }) {
  const t = useTranslations("VerifyEmailPage");
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [signedIn, setSignedIn] = useState(false);
  const [countdown, setCountdown] = useState(REDIRECT_SECONDS);

  useEffect(() => {
    verifyEmail(token)
      .then((result) => {
        setSignedIn(result.signedIn);
        setStatus("success");
      })
      .catch((err) => {
        if (err instanceof ApiError) {
          const detail = String(
            (err.data as Record<string, unknown>).detail ?? "",
          );
          setStatus(
            detail.toLowerCase().includes("expired") ? "expired" : "invalid",
          );
        } else {
          setStatus("invalid");
        }
      });
    // Keyed on the token alone, and it must stay that way: the token is
    // single-use, so a re-run would ask an API that has already deleted it and
    // turn a just-verified account into an "invalid link" screen. That is why
    // the `router.refresh()` below is its own effect rather than a line in this
    // `.then()` - it would have dragged `router` into these deps.
  }, [token]);

  // Re-run the server components against the session cookie the route handler
  // just wrote, rather than waiting out the countdown: the navbar switches to
  // the account menu while the user is still reading this card, and anything
  // watching for a session to appear - website's <GuestMerge />, which folds a
  // guest cart into the account - gets to run now instead of after the redirect.
  useEffect(() => {
    if (signedIn) router.refresh();
  }, [signedIn, router]);

  useEffect(() => {
    if (status !== "success") return;
    if (countdown === 0) {
      router.push("/");
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [status, countdown, router]);

  return (
    <Container
      display="flex"
      alignItems="center"
      styles={{
        minHeight: "100vh",
        flexDirection: "column",
        justifyContent: "center",
      }}
      paddingX={10}
    >
      <Box
        width="100%"
        maxWidth={420}
        padding={10}
        borderRadius={8}
        flexDirection="column"
        gap={20}
        elevation={5}
        backgroundColor="var(--surface-1)"
      >
        {status === "loading" && (
          <Box display="flex" flexDirection="column" gap={16}>
            <ProgressBar label={t("loading")} />
            <Typography
              variant="body"
              color="var(--muted-foreground, #6b7280)"
              textAlign="center"
            >
              {t("loading")}
            </Typography>
          </Box>
        )}

        {status === "success" && (
          <Box
            display="flex"
            flexDirection="column"
            gap={12}
            alignItems="center"
            styles={{ textAlign: "center" }}
          >
            <Typography variant="h5">{t("successTitle")}</Typography>
            <Typography variant="body" color="var(--muted-foreground, #6b7280)">
              {/* Say out loud that they are now signed in. A magic link that
                  silently opens a session is how a forwarded link signs the
                  wrong person in without either of them noticing. */}
              {signedIn ? t("successSignedIn") : t("successDetail")}
            </Typography>
            <Typography
              variant="caption"
              color="var(--muted-foreground, #6b7280)"
            >
              {t("redirecting", { seconds: countdown })}
            </Typography>
            <ProgressBar
              value={((REDIRECT_SECONDS - countdown) / REDIRECT_SECONDS) * 100}
              label={t("redirectProgress")}
            />
          </Box>
        )}

        {status === "expired" && (
          <Box
            display="flex"
            flexDirection="column"
            gap={12}
            alignItems="center"
            styles={{ textAlign: "center" }}
          >
            <Typography variant="h5" role="alert" color="var(--error, #ef4444)">
              {t("expiredTitle")}
            </Typography>
            <Typography variant="body" color="var(--muted-foreground, #6b7280)">
              {t("expiredDetail")}
            </Typography>
          </Box>
        )}

        {status === "invalid" && (
          <Box
            display="flex"
            flexDirection="column"
            gap={12}
            alignItems="center"
            styles={{ textAlign: "center" }}
          >
            <Typography variant="h5" role="alert" color="var(--error, #ef4444)">
              {t("invalidTitle")}
            </Typography>
            <Typography variant="body" color="var(--muted-foreground, #6b7280)">
              {t("invalidDetail")}
            </Typography>
          </Box>
        )}
      </Box>
    </Container>
  );
}
