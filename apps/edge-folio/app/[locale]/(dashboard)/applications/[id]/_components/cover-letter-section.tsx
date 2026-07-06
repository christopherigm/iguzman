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
  additionalPrompt: string;
  onAdditionalPromptChange: (v: string) => void;
  onGenerate: () => void;
  onCopy: () => void;
}

export function CoverLetterSection({
  coverLetter,
  onCoverLetterChange,
  generating,
  error,
  copied,
  additionalPrompt,
  onAdditionalPromptChange,
  onGenerate,
  onCopy,
}: Props) {
  const t = useTranslations("ApplicationDetailPage");

  return (
    <Box marginBottom={28} marginTop={48}>
      <Typography as="h2" variant="h3" fontWeight={600} marginBottom={8}>
        {t("coverLetterTitle")}
      </Typography>
      <Box
        styles={{ borderBottom: "1px solid var(--border, #e5e7eb)" }}
        marginBottom={12}
      />

      {/* Additional prompt + Generate action, mirroring Review & Tailor */}
      <Box display="flex" flexDirection="column" gap={16} marginBottom={16}>
        <Box display="flex" flexDirection="column" gap={6}>
          <Typography variant="body" fontWeight={600}>
            {t("additionalPromptLabel")}
          </Typography>
          <TextInput
            multirow
            rows={6}
            value={additionalPrompt}
            onChange={onAdditionalPromptChange}
            placeholder={t("additionalPromptPlaceholder")}
            width="100%"
            aria-label={t("additionalPromptLabel")}
          />
        </Box>
        <Box display="flex" justifyContent="center">
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
      </Box>

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
