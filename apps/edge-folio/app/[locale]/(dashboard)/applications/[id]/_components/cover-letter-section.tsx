"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { TextInput } from "@repo/ui/core-elements/text-input";

interface Props {
  coverLetter: string | null;
  onCoverLetterChange: (v: string) => void;
  generating: boolean;
  error: string | null;
  copied: boolean;
  onGenerate: () => void;
  onCopy: () => void;
}

export function CoverLetterSection({
  coverLetter,
  onCoverLetterChange,
  generating,
  error,
  copied,
  onGenerate,
  onCopy,
}: Props) {
  const t = useTranslations("ApplicationDetailPage");

  return (
    <Box marginBottom={28} marginTop={48}>
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        gap={12}
        flexWrap="wrap"
        marginBottom={8}
      >
        <Typography as="h2" variant="h3" fontWeight={600}>
          {t("coverLetterTitle")}
        </Typography>
        <Button
          text={
            generating
              ? t("generatingCL")
              : coverLetter
                ? t("regenerateCL")
                : t("generateCL")
          }
          type="button"
          size="md"
          disabled={generating}
          onClick={onGenerate}
          kind="primary"
        />
      </Box>
      <Box
        styles={{ borderBottom: "1px solid var(--border, #e5e7eb)" }}
        marginBottom={12}
      />
      {generating && <ProgressBar label={t("generatingCL")} />}
      {error && (
        <Typography variant="body" color="var(--error, #ef4444)">
          {error}
        </Typography>
      )}
      {coverLetter && (
        <Box display="flex" flexDirection="column" gap={8}>
          <Box display="flex" justifyContent="flex-end">
            <Button
              text={copied ? t("copied") : t("copy")}
              type="button"
              size="md"
              kind={copied ? "success" : undefined}
              onClick={onCopy}
            />
          </Box>
          <TextInput
            multirow
            className="detail__cover-letter"
            value={coverLetter}
            onChange={onCoverLetterChange}
            rows={16}
            width="100%"
            aria-label={t("coverLetterTitle")}
          />
        </Box>
      )}
    </Box>
  );
}
