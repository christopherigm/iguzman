"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import type { JobApplication } from "@/lib/applications";

export function JobDescriptionSection({ app }: { app: JobApplication }) {
  const t = useTranslations("ApplicationDetailPage");

  return (
    <Box marginBottom={28} marginTop={40}>
      <Typography as="h2" variant="h3" fontWeight={600} marginBottom={8}>
        {t("jdLabel")}
      </Typography>
      <Box
        styles={{ borderBottom: "1px solid var(--border, #e5e7eb)" }}
        marginBottom={16}
      />
      <Card gap={8}>
        <Typography
          as="p"
          variant="body"
          styles={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            lineHeight: 1.6,
          }}
        >
          {app.job_description}
        </Typography>
        {app.job_url && (
          <Typography
            variant="body"
            color="var(--muted-foreground, #6b7280)"
            as="p"
            styles={{ marginTop: "12px", marginBottom: "4px" }}
          >
            {t("jobUrlLabel")}
          </Typography>
        )}
        {app.job_url && (
          <a
            href={app.job_url}
            target="_blank"
            rel="noopener noreferrer"
            className="detail__url"
          >
            {app.job_url} ↗
          </a>
        )}
        {app.notes && (
          <Typography
            variant="body"
            color="var(--muted-foreground, #6b7280)"
            as="p"
            styles={{ marginTop: "12px", marginBottom: "6px" }}
          >
            {t("notesLabel")}
          </Typography>
        )}
        {app.notes && (
          <Typography
            as="p"
            variant="body"
            styles={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
          >
            {app.notes}
          </Typography>
        )}
      </Card>
    </Box>
  );
}
