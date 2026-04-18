'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Switch } from '@repo/ui/core-elements/switch';
import type { BurnCaptionsConfig } from '@/lib/types';
import './burn-captions-modal.css';

export type { BurnCaptionsConfig };

/* ── Alignment grid ──────────────────────────────────── */

/* Numpad layout: row order top→bottom, positions per row */
const ALIGNMENT_ROWS = [
  [7, 8, 9],
  [4, 5, 6],
  [1, 2, 3],
] as const;

/* ── Component ──────────────────────────────────────── */

export interface BurnCaptionsModalProps {
  onConfirm: (config: BurnCaptionsConfig) => void;
  onCancel: () => void;
}

const DEFAULT_CONFIG: BurnCaptionsConfig = {
  alignment: 2,
  marginV: 20,
  fontSize: 24,
  primaryColor: '#ffffff',
  showBackground: true,
  bgColor: '#000000',
  bgOpacity: 50,
};

export function BurnCaptionsModal({ onConfirm, onCancel }: BurnCaptionsModalProps) {
  const t = useTranslations('VideoGrid');
  const [config, setConfig] = useState<BurnCaptionsConfig>(DEFAULT_CONFIG);

  const set = <K extends keyof BurnCaptionsConfig>(key: K, value: BurnCaptionsConfig[K]) =>
    setConfig((prev) => ({ ...prev, [key]: value }));

  return (
    <ConfirmationModal
      title={t('burnCaptionsTitle')}
      text={t('burnCaptionsText')}
      okCallback={() => onConfirm(config)}
      cancelCallback={onCancel}
      panelMaxWidth="480px"
    >
      <Box className="bcm-config">

        {/* Position grid */}
        <Box className="bcm-section">
          <Typography variant="caption" className="bcm-label">{t('burnCaptionsPosition')}</Typography>
          <Box className="bcm-alignment-grid">
            {ALIGNMENT_ROWS.map((row) =>
              row.map((pos) => (
                <button
                  key={pos}
                  type="button"
                  data-pos={pos}
                  className={`bcm-align-btn${config.alignment === pos ? ' bcm-align-btn--active' : ''}`}
                  onClick={() => set('alignment', pos)}
                  aria-pressed={config.alignment === pos}
                  aria-label={`Position ${pos}`}
                />
              )),
            )}
          </Box>
        </Box>

        {/* Font size */}
        <Box className="bcm-section">
          <Typography variant="caption" className="bcm-label">{t('burnCaptionsFontSize')}</Typography>
          <Box className="bcm-row">
            <input
              type="range"
              className="bcm-range"
              min={12}
              max={60}
              step={2}
              value={config.fontSize}
              onChange={(e) => set('fontSize', Number(e.target.value))}
            />
            <span className="bcm-range-value">{config.fontSize}pt</span>
          </Box>
        </Box>

        {/* Text color */}
        <Box className="bcm-section">
          <Typography variant="caption" className="bcm-label">{t('burnCaptionsTextColor')}</Typography>
          <Box className="bcm-row">
            <input
              type="color"
              className="bcm-color-input"
              value={config.primaryColor}
              onChange={(e) => set('primaryColor', e.target.value)}
            />
            <span className="bcm-range-value">{config.primaryColor}</span>
          </Box>
        </Box>

        {/* Background toggle */}
        <Box className="bcm-section">
          <Box className="bcm-row bcm-row--space-between">
            <Typography variant="caption" className="bcm-label">{t('burnCaptionsBackground')}</Typography>
            <Switch
              checked={config.showBackground}
              onChange={(v) => set('showBackground', v)}
            />
          </Box>
        </Box>

        {/* Background color + opacity (only when background is enabled) */}
        {config.showBackground ? (
          <>
            <Box className="bcm-section">
              <Typography variant="caption" className="bcm-label">{t('burnCaptionsBgColor')}</Typography>
              <Box className="bcm-row">
                <input
                  type="color"
                  className="bcm-color-input"
                  value={config.bgColor}
                  onChange={(e) => set('bgColor', e.target.value)}
                />
                <span className="bcm-range-value">{config.bgColor}</span>
              </Box>
            </Box>
            <Box className="bcm-section">
              <Typography variant="caption" className="bcm-label">{t('burnCaptionsBgOpacity')}</Typography>
              <Box className="bcm-row">
                <input
                  type="range"
                  className="bcm-range"
                  min={0}
                  max={100}
                  step={5}
                  value={config.bgOpacity}
                  onChange={(e) => set('bgOpacity', Number(e.target.value))}
                />
                <span className="bcm-range-value">{config.bgOpacity}%</span>
              </Box>
            </Box>
          </>
        ) : null}

        {/* Margin */}
        <Box className="bcm-section">
          <Typography variant="caption" className="bcm-label">{t('burnCaptionsMarginV')}</Typography>
          <Box className="bcm-row">
            <input
              type="range"
              className="bcm-range"
              min={0}
              max={80}
              step={4}
              value={config.marginV}
              onChange={(e) => set('marginV', Number(e.target.value))}
            />
            <span className="bcm-range-value">{config.marginV}px</span>
          </Box>
        </Box>

      </Box>
    </ConfirmationModal>
  );
}

export default BurnCaptionsModal;
