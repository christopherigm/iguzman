"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import IconButton from "@repo/ui/core-elements/icon-button";
import type { JobApplication, SignalLevel } from "@/lib/applications";
import { STATUS_COLORS, SIGNAL_COLORS } from "../detail-constants";

interface Props {
  app: JobApplication;
  editing: boolean;
  deleting: boolean;
  refreshingMetrics: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onRefreshMetrics: () => void;
}

export function ApplicationHeader({
  app,
  editing,
  deleting,
  refreshingMetrics,
  onDelete,
  onEdit,
  onRefreshMetrics,
}: Props) {
  const t = useTranslations("ApplicationDetailPage");

  return (
    <Box
      display="flex"
      alignItems="flex-start"
      justifyContent="space-between"
      gap={12}
      flexWrap="wrap"
      marginBottom={20}
    >
      <Box display="flex" alignItems="flex-start" gap={14}>
        <Box
          styles={{
            position: "relative",
            width: 96,
            height: 96,
            flexShrink: 0,
          }}
        >
          {app.company?.image_url ? (
            <Box
              styles={{
                position: "relative",
                width: "100%",
                height: "100%",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <Image
                src={app.company.image_url}
                alt={app.company_name}
                fill
                sizes="96px"
                style={{ objectFit: "cover" }}
              />
            </Box>
          ) : (
            <Box
              display="flex"
              alignItems="center"
              justifyContent="center"
              styles={{
                width: "100%",
                height: "100%",
                borderRadius: 8,
                background: "var(--surface-2)",
              }}
            >
              <Typography
                as="span"
                variant="h2"
                fontWeight={700}
                color="var(--muted-foreground, #6b7280)"
              >
                {app.company_name.charAt(0).toUpperCase()}
              </Typography>
            </Box>
          )}
          {app.company?.intel_score && (
            <Box
              styles={{
                position: "absolute",
                top: -4,
                right: -4,
                width: 14,
                height: 14,
                borderRadius: "50%",
                background:
                  SIGNAL_COLORS[app.company.intel_score as SignalLevel],
                border: "2px solid var(--background)",
              }}
            />
          )}
        </Box>
        <Box>
          <Badge
            variant="subtle"
            color={STATUS_COLORS[app.status]}
            style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}
            size="lg"
          >
            {t(`statuses.${app.status}`)}
          </Badge>
          <Typography
            as="h1"
            variant="h2"
            fontWeight={600}
            marginBottom={4}
            marginTop={6}
          >
            {app.job_title}
          </Typography>
          <Typography
            variant="body"
            color="var(--muted-foreground, #6b7280)"
            marginBottom={4}
          >
            {app.company_name}
          </Typography>
          {app.job_url && (
            <a
              href={app.job_url}
              target="_blank"
              rel="noopener noreferrer"
              className="detail__url"
            >
              {t("jobUrlLink")} ↗
            </a>
          )}
        </Box>
      </Box>
      <Box
        display="flex"
        alignItems="center"
        gap={10}
        flexWrap="wrap"
        className="detail__header-actions"
      >
        {!editing && (
          <>
            <IconButton
              icon="/icons/delete.svg"
              kind="error"
              disabled={deleting}
              onClick={onDelete}
              aria-label={deleting ? t("deleting") : t("delete")}
            />
            <IconButton
              icon="/icons/edit.svg"
              kind="warning"
              disabled={deleting}
              onClick={onEdit}
              aria-label={t("edit")}
            />
            <Button
              text={
                refreshingMetrics ? t("refreshingMetrics") : t("refreshMetrics")
              }
              type="button"
              size="md"
              disabled={refreshingMetrics}
              onClick={onRefreshMetrics}
              kind="primary"
              icon="/icons/refresh.svg"
              iconPosition="end"
            />
          </>
        )}
      </Box>
    </Box>
  );
}
