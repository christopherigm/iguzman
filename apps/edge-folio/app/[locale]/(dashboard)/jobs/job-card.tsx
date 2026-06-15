"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Card } from "@repo/ui/core-elements/card";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import type { JobPosting } from "@/lib/jobs";
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
  if (min != null && max != null) return `${cur}${fmt(min)}–${fmt(max)}`;
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
  const salary = formatSalary(posting);
  const date = new Date(posting.created).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <Card gap={8}>
      <Box display="flex" alignItems="flex-start" gap={10}>
        <Box
          display="flex"
          alignItems="center"
          justifyContent="center"
          styles={{
            width: 48,
            height: 48,
            flexShrink: 0,
            borderRadius: 8,
            background: "var(--surface-2)",
          }}
        >
          <Typography
            as="span"
            variant="h3"
            fontWeight={700}
            color="var(--muted-foreground, #6b7280)"
          >
            {(posting.company_name || "?").charAt(0).toUpperCase()}
          </Typography>
        </Box>
        <Box
          display="flex"
          flexDirection="column"
          gap={2}
          flex={1}
          styles={{ minWidth: 0 }}
        >
          <Box display="flex" alignItems="center" gap={6} flexWrap="wrap">
            {posting.is_private && (
              <Badge
                variant="subtle"
                color="#8b5cf6"
                style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}
              >
                {t("privateBadge")}
              </Badge>
            )}
            {posting.score > 0 && (
              <Badge
                variant="subtle"
                color="#06b6d4"
                style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}
              >
                {t("matchBadge")}
              </Badge>
            )}
          </Box>
          <Typography
            as="p"
            variant="body-sm"
            fontWeight={600}
            color="var(--foreground)"
            marginTop={2}
          >
            {posting.job_title}
          </Typography>
          <Typography
            variant="caption"
            color="var(--muted-foreground, #6b7280)"
          >
            {posting.company_name}
          </Typography>
        </Box>
      </Box>

      <Box display="flex" gap={6} flexWrap="wrap">
        {posting.location && (
          <Badge variant="subtle" color="#6b7280">
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
        variant="caption"
        color="var(--muted-foreground, #6b7280)"
        styles={{
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {posting.job_description}
      </Typography>

      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        marginTop={4}
        gap={8}
      >
        <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
          {date}
        </Typography>
        <Box display="flex" gap={6} alignItems="center">
          <a
            href={posting.job_url}
            target="_blank"
            rel="noopener noreferrer"
            className="jobs__external-link"
          >
            {t("viewPosting")}
          </a>
          {savedAppId != null ? (
            <Link
              href={`/${locale}/applications/${savedAppId}`}
              prefetch
              className="jobs__saved-link"
            >
              {t("tailor")}
            </Link>
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
          {(isStaff || posting.is_owner) && (
            <Button
              text={deleting ? t("deleting") : t("deletePosting")}
              type="button"
              size="md"
              disabled={deleting}
              onClick={() => onDelete(posting)}
            />
          )}
        </Box>
      </Box>
    </Card>
  );
}
