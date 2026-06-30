"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Container } from "@repo/ui/core-elements/container";
import { Box } from "@repo/ui/core-elements/box";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { linkTv, ApiError } from "@/lib/auth";
import "./tv-link-form.css";

// The TV's user_code is 8 characters from an unambiguous alphabet (no 0/O/1/I).
const CODE_LENGTH = 8;

export function TvLinkForm() {
  const t = useTranslations("TvLinkPage");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep only A-Z/2-9, uppercase, and cap at the code length so the input never
  // holds anything the backend would reject.
  function handleChange(value: string) {
    const cleaned = value
      .toUpperCase()
      .replace(/[^A-Z2-9]/g, "")
      .slice(0, CODE_LENGTH);
    setCode(cleaned);
    setError(null);
    setSuccess(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);
    try {
      await linkTv(code);
      setSuccess(true);
      setCode("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) {
        setError(t("errorExpired"));
      } else if (err instanceof ApiError && err.status === 409) {
        setError(t("errorUsed"));
      } else if (err instanceof ApiError && err.status === 404) {
        setError(t("errorInvalid"));
      } else {
        setError(t("errorGeneric"));
      }
    } finally {
      setLoading(false);
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
      <Box width="100%" maxWidth={460} marginBottom={20} marginTop={20}>
        <Typography as="h1" variant="h2" fontWeight={600} marginBottom={4}>
          {t("title")}
        </Typography>
        <Typography variant="body" color="var(--muted-foreground, #6b7280)">
          {t("subtitle")}
        </Typography>
      </Box>

      <Box
        width="100%"
        maxWidth={460}
        padding={10}
        borderRadius={12}
        flexDirection="column"
        gap={20}
        elevation={5}
        backgroundColor="var(--surface-1)"
        marginBottom={40}
      >
        {success ? (
          <Box display="flex" flexDirection="column" gap={12}>
            <Typography variant="h3" fontWeight={600} className="tv-link__success">
              {t("successTitle")}
            </Typography>
            <Typography
              variant="body"
              color="var(--muted-foreground, #6b7280)"
            >
              {t("successBody")}
            </Typography>
          </Box>
        ) : (
          <form onSubmit={handleSubmit} className="tv-link__form">
            <TextInput
              label={t("codeLabel")}
              type="text"
              value={code}
              onChange={handleChange}
              autoComplete="off"
              autoFocus
            />
            {error && (
              <Typography
                variant="caption"
                role="alert"
                className="tv-link__error"
              >
                {error}
              </Typography>
            )}
            {loading && <ProgressBar label={t("linking")} />}
            <Button
              text={loading ? t("linking") : t("submit")}
              type="submit"
              size="md"
              width="100%"
              marginTop={4}
              kind="primary"
              disabled={loading || code.length < CODE_LENGTH}
            />
          </form>
        )}
      </Box>
    </Container>
  );
}
