"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Container } from "@repo/ui/core-elements/container";
import { Box } from "@repo/ui/core-elements/box";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Button } from "@repo/ui/core-elements/button";
import { LinkButton } from "@repo/ui/core-elements/link-button";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { Typography } from "@repo/ui/core-elements/typography";
import { confirmPasswordReset, ApiError } from "./client";
import { isPasswordValid, mapPasswordErrors } from "./password-policy";
import { PasswordRequirements } from "./password-requirements";
import { ErrorMessage } from "./auth-message";
import "./auth-forms.css";

/**
 * The page a password-reset email links to. Text comes from the app's own
 * `ResetPasswordPage` namespace.
 */

type Status = "idle" | "loading" | "success" | "invalid";

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("ResetPasswordPage");
  const tPolicy = useTranslations("PasswordPolicy");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  // No user attributes here: the token identifies the account, but the browser
  // never learns whose it is. The similarity rule still runs server-side.
  const passwordAccepted = isPasswordValid(newPassword);

  function handleNewPasswordChange(value: string) {
    setNewPassword(value);
    // A rejection describes the password that was submitted, not this one.
    setPasswordError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPasswordError(null);

    if (newPassword !== newPassword2) {
      setError(t("errorPasswordMismatch"));
      return;
    }

    setStatus("loading");
    try {
      await confirmPasswordReset(token, newPassword, newPassword2);
      setStatus("success");
    } catch (err) {
      setStatus("idle");
      if (err instanceof ApiError) {
        const detail = String(
          (err.data as Record<string, unknown>).detail ?? "",
        );
        // The policy the browser cannot check (e.g. the common-password list)
        // is only enforced server-side, so surface what the API rejected.
        const rejections = mapPasswordErrors(err.data, "new_password");
        if (rejections.length > 0) {
          setPasswordError(
            rejections
              .map((r) => (r.translated ? tPolicy(r.key, r.values) : r.text))
              .join(" "),
          );
        } else if (
          detail.toLowerCase().includes("invalid") ||
          detail.toLowerCase().includes("expired")
        ) {
          setStatus("invalid");
        } else {
          setError(t("errorGeneric"));
        }
      } else {
        setError(t("errorGeneric"));
      }
    }
  }

  return (
    <Container
      display="flex"
      alignItems="center"
      styles={{
        minHeight: "100vh",
        flexDirection: "column",
        justifyContent: "flex-start",
        paddingTop: "var(--ui-navbar-height)",
      }}
      paddingX={10}
    >
      <Box width="100%" maxWidth={420} marginBottom={20}>
        <Typography as="h1" variant="h2" fontWeight={600} marginBottom={4}>
          {t("title")}
        </Typography>
        <Typography variant="body" color="var(--muted-foreground, #6b7280)">
          {t("subtitle")}
        </Typography>
      </Box>

      <Box
        width="100%"
        maxWidth={420}
        padding={10}
        borderRadius={12}
        flexDirection="column"
        gap={20}
        elevation={5}
        backgroundColor="var(--surface-1)"
      >
        {status === "loading" && (
          <Box display="flex" flexDirection="column" gap={16}>
            <ProgressBar label={t("submitting")} />
            <Typography
              variant="body"
              color="var(--muted-foreground, #6b7280)"
              textAlign="center"
            >
              {t("submitting")}
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
              {t("successDetail")}
            </Typography>
            <LinkButton href="/auth" label={t("backToSignIn")} />
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
            <LinkButton
              href="/auth#reset-password"
              label={t("requestNewLink")}
            />
          </Box>
        )}

        {status === "idle" && (
          <form onSubmit={handleSubmit} className="reset-password__form">
            <TextInput
              label={t("newPasswordLabel")}
              type="password"
              value={newPassword}
              onChange={handleNewPasswordChange}
              required
              autoComplete="new-password"
              error={passwordError ?? undefined}
            />
            <PasswordRequirements password={newPassword} />
            <TextInput
              label={t("confirmPasswordLabel")}
              type="password"
              value={newPassword2}
              onChange={setNewPassword2}
              required
              autoComplete="new-password"
            />
            {error && <ErrorMessage message={error} />}
            <Button
              text={t("submitButton")}
              type="submit"
              size="md"
              width="100%"
              marginTop={4}
              kind={
                passwordAccepted && newPassword2 && newPassword === newPassword2
                  ? "primary"
                  : undefined
              }
              disabled={
                !passwordAccepted ||
                !newPassword2 ||
                newPassword !== newPassword2
              }
            />
            <Box display="flex" justifyContent="center">
              <LinkButton
                href="/auth#reset-password"
                label={t("requestNewLink")}
              />
            </Box>
          </form>
        )}
      </Box>
    </Container>
  );
}
