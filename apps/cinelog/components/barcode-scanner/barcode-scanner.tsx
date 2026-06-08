'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { useBarcodeScanner, type ScanStatus } from '@/hooks/use-barcode-scanner';
import './barcode-scanner.css';

const CONTAINER_ID = 'barcode-scanner-view';

export function BarcodeScanner() {
  const t = useTranslations('ScannerPage');
  const { lastScan, flash, scanCount, onScan } = useBarcodeScanner();
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);

  useEffect(() => {
    let active = true;

    async function start() {
      // Stop and clear any scanner left by StrictMode's first mount
      if (scannerRef.current) {
        await scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
      // Clear any injected DOM so html5-qrcode starts with a clean container
      const container = document.getElementById(CONTAINER_ID);
      if (container) container.innerHTML = '';

      const { Html5Qrcode } = await import('html5-qrcode');
      if (!active) return;

      const scanner = new Html5Qrcode(CONTAINER_ID);
      scannerRef.current = scanner;

      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10 },
          onScan,
          () => {}
        );
        if (active) setScanStatus('scanning');
      } catch (err) {
        if (active) {
          const msg = String(err).toLowerCase();
          if (
            msg.includes('permission') ||
            msg.includes('denied') ||
            msg.includes('notallowederror')
          ) {
            setScanStatus('permission_denied');
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
  }, [onScan]);

  const statusLabel = lastScan
    ? lastScan.status === 'saved'
      ? t('statusSaved')
      : lastScan.status === 'queued'
        ? t('statusQueued')
        : lastScan.status === 'exists'
          ? t('statusExists')
          : lastScan.status === 'pending'
            ? t('statusPending')
            : t('statusError')
    : null;

  return (
    <Box flexDirection="column" alignItems="center" width="100%" gap={16} paddingY={16}>
      <Typography variant="caption" color="var(--foreground)" styles={{ opacity: 0.6 }}>
        {t('subtitle')}
      </Typography>

      {/* Camera viewfinder */}
      <Box
        className="scanner-viewfinder"
        width="100%"
        borderRadius={12}
        styles={{
          position: 'relative',
          overflow: 'hidden',
          aspectRatio: '4 / 3',
          maxWidth: '480px',
          background: '#000',
          boxShadow: flash ? '0 0 0 3px var(--accent)' : 'none',
        }}
      >
        {/* html5-qrcode render target */}
        <Box
          id={CONTAINER_ID}
          className="scanner-video-container"
          styles={{ position: 'absolute', inset: 0 }}
        />

        {/* Scanning frame overlay */}
        <Box
          aria-hidden={true}
          styles={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Box styles={{ position: 'relative', width: '72%', height: '32%' }}>
            <span className="scanner-corner scanner-corner--tl" />
            <span className="scanner-corner scanner-corner--tr" />
            <span className="scanner-corner scanner-corner--bl" />
            <span className="scanner-corner scanner-corner--br" />
            {scanStatus === 'scanning' && <span className="scanner-line" />}
          </Box>
        </Box>
      </Box>

      {/* Permission denied */}
      {scanStatus === 'permission_denied' && (
        <Box flexDirection="column" alignItems="center" gap={8} paddingX={16}>
          <Typography variant="body-sm" textAlign="center">
            {t('permissionDenied')}
          </Typography>
          <Typography
            variant="caption"
            textAlign="center"
            color="var(--foreground)"
            styles={{ opacity: 0.55 }}
          >
            {t('permissionHelp')}
          </Typography>
        </Box>
      )}

      {/* Scan count */}
      {scanStatus === 'scanning' && scanCount > 0 && (
        <Typography variant="caption" color="var(--foreground)" styles={{ opacity: 0.45 }}>
          {t('scanCount', { count: scanCount })}
        </Typography>
      )}

      {/* Last scan result */}
      {lastScan && (
        <Box
          className={`scanner-result scanner-result--${lastScan.status}`}
          flexDirection="column"
          alignItems="center"
          width="100%"
          styles={{ maxWidth: '480px' }}
          borderRadius={8}
          paddingX={16}
          paddingY={12}
          gap={4}
        >
          {lastScan.title && (
            <Typography variant="body-sm" fontWeight={600} textAlign="center">
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
            styles={{ opacity: 0.45, fontFamily: 'monospace' }}
          >
            {lastScan.barcode}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
