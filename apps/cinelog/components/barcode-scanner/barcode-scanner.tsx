"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import { Button } from "@repo/ui/core-elements/button";
import {
  useBarcodeScanner,
  type ScanStatus,
} from "@/hooks/use-barcode-scanner";
import "./barcode-scanner.css";

const CONTAINER_ID = "barcode-scanner-view";

export function BarcodeScanner() {
  const t = useTranslations("ScannerPage");
  const { lastScan, flash, scanCount, onScan } = useBarcodeScanner();
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [scanActive, setScanActive] = useState(false);
  const [manualBarcode, setManualBarcode] = useState("");
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = manualBarcode.trim();
    if (!trimmed) return;
    onScan(trimmed);
    setManualBarcode("");
  };

  useEffect(() => {
    if (!scanActive) return;

    let active = true;

    async function start() {
      // Stop and clear any scanner left by StrictMode's first mount
      if (scannerRef.current) {
        await scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
      // Clear any injected DOM so html5-qrcode starts with a clean container
      const container = document.getElementById(CONTAINER_ID);
      if (container) container.innerHTML = "";

      const { Html5Qrcode } = await import("html5-qrcode");
      if (!active) return;

      const scanner = new Html5Qrcode(CONTAINER_ID);
      scannerRef.current = scanner;

      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10 },
          onScan,
          () => {},
        );
        if (active) setScanStatus("scanning");
      } catch (err) {
        if (active) {
          const msg = String(err).toLowerCase();
          if (
            msg.includes("permission") ||
            msg.includes("denied") ||
            msg.includes("notallowederror")
          ) {
            setScanStatus("permission_denied");
          }
        }
      }
    }

    start();

    return () => {
      active = false;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      scanner?.stop().catch(() => {});
    };
  }, [onScan, scanActive]);

  const statusLabel = lastScan
    ? lastScan.status === "saved"
      ? t("statusSaved")
      : lastScan.status === "queued"
        ? t("statusQueued")
        : lastScan.status === "exists"
          ? t("statusExists")
          : lastScan.status === "pending"
            ? t("statusPending")
            : t("statusError")
    : null;

  return (
    /* Scan a barcode section - a grid item on the Add Movie page. */
    <Card width="100%" gap={16} marginTop={16} marginBottom={16}>
      <Box flexDirection="column" gap={4}>
        <Typography as="h2" variant="h4">
          {t("scannerHeading")}
        </Typography>
        <Typography
          variant="caption"
          color="var(--foreground)"
          styles={{ opacity: 0.6 }}
        >
          {t("subtitle")}
        </Typography>
      </Box>

      {/* Camera viewfinder - aspect ratio kept wide so the viewfinder is ~30%
            shorter than a 4:3 frame at the same column width. */}
      <Box
        className="scanner-viewfinder"
        width="100%"
        borderRadius={12}
        alignItems="center"
        justifyContent="center"
        styles={{
          position: "relative",
          overflow: "hidden",
          aspectRatio: "2.5 / 1",
          background: scanActive ? "#000" : "var(--surface-2)",
          boxShadow: flash ? "0 0 0 3px var(--accent)" : "none",
        }}
      >
        {scanActive ? (
          <>
            {/* html5-qrcode render target */}
            <Box
              id={CONTAINER_ID}
              className="scanner-video-container"
              styles={{ position: "absolute", inset: 0 }}
            />

            {/* Scanning frame overlay */}
            <Box
              aria-hidden={true}
              styles={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Box
                styles={{ position: "relative", width: "72%", height: "32%" }}
              >
                <span className="scanner-corner scanner-corner--tl" />
                <span className="scanner-corner scanner-corner--tr" />
                <span className="scanner-corner scanner-corner--bl" />
                <span className="scanner-corner scanner-corner--br" />
                {scanStatus === "scanning" && <span className="scanner-line" />}
              </Box>
            </Box>
          </>
        ) : (
          /* Default state - tap to activate the camera scanner */
          <Button
            text={t("scanButton")}
            icon="/icons/barcode.svg"
            onClick={() => setScanActive(true)}
          />
        )}
      </Box>

      {/* Manual barcode entry */}
      <form onSubmit={handleManualSubmit} style={{ width: "100%" }}>
        <Box
          display="flex"
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
          width="100%"
          gap={8}
        >
          <TextInput
            flex={1}
            label={t("manualLabel")}
            value={manualBarcode}
            onChange={setManualBarcode}
            inputMode="numeric"
            aria-label={t("manualLabel")}
            width="auto"
          />
          <IconButton
            type="submit"
            icon="/icons/search.svg"
            aria-label={t("manualSubmit")}
            disabled={manualBarcode.trim().length === 0}
          />
        </Box>
      </form>

      {/* Permission denied */}
      {scanStatus === "permission_denied" && (
        <Box flexDirection="column" alignItems="center" gap={8} paddingX={16}>
          <Typography variant="body" textAlign="center">
            {t("permissionDenied")}
          </Typography>
          <Typography
            variant="caption"
            textAlign="center"
            color="var(--foreground)"
            styles={{ opacity: 0.55 }}
          >
            {t("permissionHelp")}
          </Typography>
        </Box>
      )}

      {/* Scan count */}
      {scanStatus === "scanning" && scanCount > 0 && (
        <Typography
          variant="caption"
          color="var(--foreground)"
          styles={{ opacity: 0.45 }}
        >
          {t("scanCount", { count: scanCount })}
        </Typography>
      )}

      {/* Last scan result */}
      {lastScan && (
        <Box
          className={`scanner-result scanner-result--${lastScan.status}`}
          flexDirection="column"
          alignItems="center"
          width="100%"
          borderRadius={8}
          paddingX={16}
          paddingY={12}
          gap={4}
        >
          {lastScan.title && (
            <Typography variant="body" fontWeight={600} textAlign="center">
              {lastScan.title}
            </Typography>
          )}
          <Typography variant="caption" textAlign="center">
            {statusLabel}
          </Typography>
          <Typography
            variant="caption"
            textAlign="center"
            color="var(--foreground)"
            styles={{ opacity: 0.45, fontFamily: "monospace" }}
          >
            {lastScan.barcode}
          </Typography>
        </Box>
      )}
    </Card>
  );
}
