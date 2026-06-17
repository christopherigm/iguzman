"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Card } from "@repo/ui/core-elements/card";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Icon } from "@repo/ui/core-elements/icon";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import type { JobPosting } from "@/lib/jobs";
import { MatchMetrics } from "../_components/match-metrics";
import "./jobs-page.css";

export function formatSalary(posting: JobPosting): string | null {
  const min = posting.salary_min
    ? Math.round(Number(posting.salary_min))
    : null;
  const max = posting.salary_max
    ? Math.round(Number(posting.salary_max))
    : null;
  if (min == null && max == null) return null;
  const cur = posting.salary_currency ? `${posting.salary_currency} ` : "";
  const fmt = (n: number) => n.toLocaleString();
  if (min != null && max != null) return `${cur}${fmt(min)}-${fmt(max)}`;
  return `${cur}${fmt((min ?? max) as number)}`;
}

export interface JobCardProps {
  posting: JobPosting;
  onSave: (posting: JobPosting) => void;
  onDelete: (posting: JobPosting) => void;
  saving: boolean;
  deleting: boolean;
  savedAppId: number | null;
  isStaff: boolean;
}

export function JobCard({
  posting,
  onSave,
  onDelete,
  saving,
  deleting,
  savedAppId,
  isStaff,
}: JobCardProps) {
  const t = useTranslations("JobsPage");
  const locale = useLocale();
  const [explainModal, setExplainModal] = useState<{
    title: string;
    text: string;
  } | null>(null);
  const salary = formatSalary(posting);
  const date = new Date(posting.created).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <Card gap={8} height="100%">
      <Box display="flex" alignItems="flex-start" gap={10}>
        <Box
          display="flex"
          flexDirection="column"
          gap={2}
          flex={1}
          styles={{ minWidth: 0 }}
        >
          <Typography
            as="p"
            variant="body"
            fontWeight={600}
            color="var(--foreground)"
            marginTop={2}
          >
            {posting.job_title}
          </Typography>
          <Typography variant="body" color="var(--muted-foreground, #6b7280)">
            {posting.company_name} - {date}
          </Typography>
        </Box>
      </Box>

      <Box display="flex" gap={6} flexWrap="wrap">
        {posting.score > 0 && (
          <Badge variant="subtle" color="#06b6d4">
            {t("matchBadge")}
          </Badge>
        )}
        {posting.location && (
          <Badge variant="subtle" color="#ff6ae3">
            {posting.location}
          </Badge>
        )}
        {(posting.work_type ?? []).map((wt) => (
          <Badge key={wt} variant="subtle" color="#0ea5e9">
            {t(`workTypes.${wt}`)}
          </Badge>
        ))}
        {salary && (
          <Badge variant="subtle" color="#22c55e">
            {salary}
          </Badge>
        )}
      </Box>

      <Typography
        variant="body"
        styles={{
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {posting.job_description}
      </Typography>

      {(posting.overall_match != null || posting.technical_match != null) && (
        <MatchMetrics
          gap={6}
          barSize={5}
          explainAriaLabel={t("metricExplain")}
          onExplain={(item) =>
            setExplainModal({
              title: item.label,
              text: item.explanation ?? "",
            })
          }
          items={[
            ...(posting.overall_match != null
              ? [
                  {
                    label: t("overallMatch"),
                    value: posting.overall_match,
                    explanation: posting.overall_match_explanation,
                  },
                ]
              : []),
            ...(posting.technical_match != null
              ? [
                  {
                    label: t("technicalMatch"),
                    value: posting.technical_match,
                    explanation: posting.technical_match_explanation,
                  },
                ]
              : []),
            ...(posting.nafta_tn_likelihood != null
              ? [
                  {
                    label: t("naftaLikelihood"),
                    value: posting.nafta_tn_likelihood,
                    explanation: posting.nafta_tn_likelihood_explanation,
                  },
                ]
              : []),
          ]}
        />
      )}

      <Box flexGrow={1} />

      <Box
        display="flex"
        justifyContent="space-between"
        gap={8}
        alignItems="center"
        marginTop={4}
      >
        <Box display="flex" gap={6} alignItems="center">
          {(isStaff || posting.is_owner) && (
            <button
              type="button"
              className="jobs__icon-btn jobs__icon-btn--delete"
              disabled={deleting}
              onClick={() => onDelete(posting)}
              aria-label={deleting ? t("deleting") : t("deletePosting")}
            >
              <Icon
                icon="/icons/delete.svg"
                size={18}
                color="var(--error, #ef4444)"
              />
            </button>
          )}
          <a
            href={posting.job_url}
            target="_blank"
            rel="noopener noreferrer"
            className="jobs__icon-btn"
            aria-label={t("viewPosting")}
          >
            <Icon
              icon="/icons/external.svg"
              size={16}
              color="var(--muted-foreground, #6b7280)"
            />
          </a>
        </Box>
        <Box display="flex" gap={8} alignItems="center">
          {savedAppId != null ? (
            <Button
              href={`/${locale}/applications/${savedAppId}`}
              text={t("tailor")}
              type="button"
              size="md"
              kind="success"
            />
          ) : (
            <Button
              text={saving ? t("saving") : t("save")}
              type="button"
              size="md"
              kind="success"
              disabled={saving}
              onClick={() => onSave(posting)}
            />
          )}
        </Box>
      </Box>

      {explainModal && (
        <ConfirmationModal
          title={explainModal.title}
          text={explainModal.text}
          okCallback={() => setExplainModal(null)}
        />
      )}
    </Card>
  );
}
