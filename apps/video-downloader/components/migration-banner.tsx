"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Icon } from "@repo/ui/core-elements/icon";
import "./migration-banner.css";

const DEADLINE_MS = new Date("2026-06-01T00:00:00Z").getTime();
const MEDIA2GO_HOSTS = new Set(["media2go.app", "www.media2go.app"]);

export interface MigrationBannerProps {
  serverDate: string;
}

export function MigrationBanner({ serverDate }: MigrationBannerProps) {
  const t = useTranslations("MigrationBanner");
  const [visible, setVisible] = useState(false);
  const [daysLeft, setDaysLeft] = useState(0);

  useEffect(() => {
    if (MEDIA2GO_HOSTS.has(window.location.hostname)) return;
    const nowMs = new Date(serverDate).getTime();
    const days = Math.max(0, Math.ceil((DEADLINE_MS - nowMs) / 86_400_000));
    setDaysLeft(days);
    setVisible(true);
  }, [serverDate]);

  if (!visible) return null;

  return (
    <Box maxWidth={400} width="100%">
      <Box
        elevation={2}
        borderRadius={14}
        className="vi-card"
        flexDirection="column"
        styles={{ overflow: "hidden" }}
      >
        <div className="mb-image-wrapper">
          <Image
            src="/transition.jpg"
            alt="Media 2 Go"
            width={800}
            height={317}
            priority
          />
          <button
            type="button"
            className="mb-close-btn"
            onClick={() => setVisible(false)}
            aria-label={t("close")}
          >
            <Icon icon="/icons/close.svg" size={14} color="#fff" />
          </button>
        </div>
        <div className="mb-body">
          <Typography variant="body-sm" fontWeight={500}>
            {t("heading")}
          </Typography>
          <Typography variant="body-sm">
            {t("body", { days: daysLeft })}
          </Typography>
          <Typography variant="body-sm">
            <a
              className="mb-link"
              href="https://media2go.app"
              target="_blank"
              rel="noopener noreferrer"
            >
              media2go.app
            </a>
          </Typography>
        </div>
      </Box>
    </Box>
  );
}

export default MigrationBanner;
