'use client';

import { useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Switch } from '@repo/ui/core-elements/switch';
import { Icon } from '@repo/ui/core-elements/icon';
import type {
  BurnCaptionsConfig,
  BurnCaptionsAnimationConfig,
  BurnCaptionsAnimationType,
  BurnCaptionsFontStyle,
} from '@/lib/types';
import './burn-captions-modal.css';

export type { BurnCaptionsConfig };

/* ── Preview helpers ─────────────────────────────────── */

const PREVIEW_SAMPLE = 'The quick brown fox jumps';

const hexToRgba = (hex: string, opacity: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

const buildSubtitlePreviewStyle = (cfg: BurnCaptionsConfig): CSSProperties => {
  const {
    alignment,
    marginV,
    fontSize,
    fontStyle = 'normal',
    primaryColor,
    borderStyle,
    bgColor,
    bgOpacity,
    outlineThickness = 2,
  } = cfg;
  const isTop = alignment >= 7;
  const isBottom = alignment <= 3;
  const isLeft = [1, 4, 7].includes(alignment);
  const isRight = [3, 6, 9].includes(alignment);

  const scaledMargin = Math.max(3, Math.round(marginV * 0.3));
  const scaledFont = Math.max(8, Math.round(fontSize * 0.525));
  const transforms: string[] = [];

  const s: CSSProperties = {
    position: 'absolute',
    fontSize: scaledFont,
    color: primaryColor,
    lineHeight: 1.3,
    display: 'inline-block',
    maxWidth: '88%',
    whiteSpace: 'nowrap',
    fontWeight:
      fontStyle === 'bold' || fontStyle === 'bold-italic' ? 'bold' : 'normal',
    fontStyle:
      fontStyle === 'italic' || fontStyle === 'bold-italic'
        ? 'italic'
        : 'normal',
  };

  if (isTop) s.top = scaledMargin;
  else if (isBottom) s.bottom = scaledMargin;
  else {
    s.top = '50%';
    transforms.push('translateY(-50%)');
  }

  if (isLeft) s.left = '6%';
  else if (isRight) s.right = '6%';
  else {
    s.left = '50%';
    s.textAlign = 'center';
    transforms.push('translateX(-50%)');
  }

  if (transforms.length) s.transform = transforms.join(' ');

  if (borderStyle === 3) {
    s.backgroundColor = hexToRgba(bgColor, bgOpacity / 100);
    s.padding = '2px 6px';
    s.borderRadius = '2px';
  } else {
    const strokePx = Math.max(0.5, outlineThickness * 0.35);
    (s as Record<string, unknown>).WebkitTextStroke = `${strokePx}px #000000`;
    s.paintOrder = 'stroke fill' as CSSProperties['paintOrder'];
  }

  return s;
};

/* ── Alignment grid ──────────────────────────────────── */

/* Numpad layout: row order top→bottom, positions per row */
const ALIGNMENT_ROWS = [
  [7, 8, 9],
  [4, 5, 6],
  [1, 2, 3],
] as const;

/* ── Translate languages ─────────────────────────────── */

export const TRANSLATE_LANGUAGES = [
  { value: 'en', label: 'English', flag: '🇺🇸' },
  { value: 'es', label: 'Español', flag: '🇲🇽' },
  { value: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { value: 'fr', label: 'Français', flag: '🇫🇷' },
  { value: 'pt', label: 'Português', flag: '🇧🇷' },
] as const;

/* ── Component ──────────────────────────────────────── */

export interface BurnCaptionsModalProps {
  onConfirm: (config: BurnCaptionsConfig) => void;
  onCancel: () => void;
}

const FONT_STYLES: BurnCaptionsFontStyle[] = [
  'normal',
  'bold',
  'italic',
  'bold-italic',
];

const ANIMATION_TYPES: BurnCaptionsAnimationType[] = [
  'none',
  'fade',
  'slideUp',
  'slideDown',
  'blur',
  'zoom',
  'karaoke',
];

const DEFAULT_ANIMATION: BurnCaptionsAnimationConfig = {
  type: 'karaoke',
  fadeInMs: 300,
  fadeOutMs: 200,
  slideOffset: 20,
  slideDurationMs: 300,
  blurStrength: 15,
  blurDurationMs: 300,
  zoomDurationMs: 300,
  karaokeMode: 'kf',
  karaokeHighlightColour: '#00ffff',
};

const DEFAULT_CONFIG: BurnCaptionsConfig = {
  alignment: 2,
  marginV: 72,
  fontSize: 65,
  fontStyle: 'bold',
  primaryColor: '#ffffff',
  borderStyle: 1,
  outlineThickness: 8,
  bgColor: '#000000',
  bgOpacity: 50,
  translate: false,
  translateTo: 'en',
  animation: { ...DEFAULT_ANIMATION },
};

export function BurnCaptionsModal({
  onConfirm,
  onCancel,
}: BurnCaptionsModalProps) {
  const t = useTranslations('VideoGrid');
  const [config, setConfig] = useState<BurnCaptionsConfig>(DEFAULT_CONFIG);

  const set = <K extends keyof BurnCaptionsConfig>(
    key: K,
    value: BurnCaptionsConfig[K],
  ) => setConfig((prev) => ({ ...prev, [key]: value }));

  const setAnim = <K extends keyof BurnCaptionsAnimationConfig>(
    key: K,
    value: BurnCaptionsAnimationConfig[K],
  ) =>
    setConfig((prev) => ({
      ...prev,
      animation: { ...(prev.animation ?? DEFAULT_ANIMATION), [key]: value },
    }));

  const anim = config.animation ?? DEFAULT_ANIMATION;
  const animType = anim.type;

  return (
    <ConfirmationModal
      title={t('burnCaptionsTitle')}
      text={t('burnCaptionsText')}
      okCallback={() => onConfirm(config)}
      cancelCallback={onCancel}
      panelMaxWidth="480px"
    >
      <Box className="bcm-config">
        {/* Translate subtitles */}
        <Box className="bcm-section">
          <Typography variant="caption" className="bcm-label">
            {t('burnCaptionsTranslate')}
          </Typography>
          <Box className="bcm-row">
            <Switch
              checked={config.translate ?? false}
              onChange={(v) => set('translate', v)}
            />
            <Box className="bcm-select-wrapper">
              <select
                className="bcm-select"
                value={config.translateTo ?? 'en'}
                onChange={(e) => set('translateTo', e.target.value)}
                disabled={!config.translate}
                aria-label={t('burnCaptionsTranslateLang')}
              >
                {TRANSLATE_LANGUAGES.map((lang) => (
                  <option
                    key={lang.value}
                    value={lang.value}
                    style={{ backgroundColor: 'var(--surface-1, #f4f4f5)' }}
                  >
                    {lang.flag} {lang.label}
                  </option>
                ))}
              </select>
              <span className="bcm-select-chevron">
                <Icon
                  icon="/icons/chevron-down.svg"
                  size={14}
                  color={
                    config.translate
                      ? 'var(--foreground, #171717)'
                      : 'var(--foreground-muted, #aaa)'
                  }
                />
              </span>
            </Box>
          </Box>
        </Box>

        {/* Position grid */}
        <Box className="bcm-section">
          <Typography variant="caption" className="bcm-label">
            {t('burnCaptionsPosition')}
          </Typography>
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

        {/* Margin */}
        <Box className="bcm-section">
          <Typography variant="caption" className="bcm-label">
            {t('burnCaptionsMarginV')}
          </Typography>
          <Box className="bcm-row">
            <input
              type="range"
              className="bcm-range"
              min={0}
              max={100}
              step={4}
              value={config.marginV}
              onChange={(e) => set('marginV', Number(e.target.value))}
              aria-label={t('burnCaptionsMarginV')}
            />
            <span className="bcm-range-value">{config.marginV}px</span>
          </Box>
        </Box>

        {/* Subtitle preview */}
        <Box className="bcm-section">
          <Typography variant="caption" className="bcm-label">
            {t('burnCaptionsPreview')}
          </Typography>
          <Box className="bcm-preview">
            <span style={buildSubtitlePreviewStyle(config)}>
              {PREVIEW_SAMPLE}
            </span>
          </Box>
        </Box>

        {/* Font size */}
        <Box className="bcm-section">
          <Typography variant="caption" className="bcm-label">
            {t('burnCaptionsFontSize')}
          </Typography>
          <Box className="bcm-row">
            <input
              type="range"
              className="bcm-range"
              min={12}
              max={80}
              step={2}
              value={config.fontSize}
              onChange={(e) => set('fontSize', Number(e.target.value))}
              aria-label={t('burnCaptionsFontSize')}
            />
            <span className="bcm-range-value">{config.fontSize}pt</span>
          </Box>
        </Box>

        {/* Font style */}
        <Box className="bcm-section">
          <Typography variant="caption" className="bcm-label">
            {t('burnCaptionsFontStyle')}
          </Typography>
          <Box className="bcm-select-wrapper">
            <select
              className="bcm-select"
              value={config.fontStyle ?? 'normal'}
              onChange={(e) =>
                set('fontStyle', e.target.value as BurnCaptionsFontStyle)
              }
              aria-label={t('burnCaptionsFontStyle')}
            >
              {FONT_STYLES.map((fs) => (
                <option
                  key={fs}
                  value={fs}
                  style={{ backgroundColor: 'var(--surface-1, #f4f4f5)' }}
                >
                  {t(
                    `burnCaptionsFontStyle${fs
                      .split('-')
                      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                      .join('')}` as Parameters<typeof t>[0],
                  )}
                </option>
              ))}
            </select>
            <span className="bcm-select-chevron">
              <Icon
                icon="/icons/chevron-down.svg"
                size={14}
                color="var(--foreground, #171717)"
              />
            </span>
          </Box>
        </Box>

        {/* Text color */}
        <Box className="bcm-section">
          <Typography variant="caption" className="bcm-label">
            {t('burnCaptionsTextColor')}
          </Typography>
          <Box className="bcm-row">
            <input
              type="color"
              className="bcm-color-input"
              value={config.primaryColor}
              onChange={(e) => set('primaryColor', e.target.value)}
              aria-label={t('burnCaptionsTextColor')}
            />
            <span className="bcm-range-value">{config.primaryColor}</span>
          </Box>
        </Box>

        {/* Border style */}
        <Box className="bcm-section">
          <Typography variant="caption" className="bcm-label">
            {t('burnCaptionsBorderStyle')}
          </Typography>
          <Box className="bcm-select-wrapper">
            <select
              className="bcm-select"
              value={config.borderStyle}
              onChange={(e) =>
                set('borderStyle', Number(e.target.value) as 1 | 3)
              }
              aria-label={t('burnCaptionsBorderStyle')}
            >
              <option
                value={1}
                style={{ backgroundColor: 'var(--surface-1, #f4f4f5)' }}
              >
                {t('burnCaptionsBorderStyleOutline')}
              </option>
              <option
                value={3}
                style={{ backgroundColor: 'var(--surface-1, #f4f4f5)' }}
              >
                {t('burnCaptionsBorderStyleBox')}
              </option>
            </select>
            <span className="bcm-select-chevron">
              <Icon
                icon="/icons/chevron-down.svg"
                size={14}
                color="var(--foreground, #171717)"
              />
            </span>
          </Box>
          <Typography variant="caption" className="bcm-border-style-hint">
            {config.borderStyle === 3
              ? t('burnCaptionsBorderStyleBoxHint')
              : t('burnCaptionsBorderStyleOutlineHint')}
          </Typography>
        </Box>

        {/* Outline thickness (only for outline style) */}
        {config.borderStyle === 1 ? (
          <Box className="bcm-section">
            <Typography variant="caption" className="bcm-label">
              {t('burnCaptionsOutlineThickness')}
            </Typography>
            <Box className="bcm-row">
              <input
                type="range"
                className="bcm-range"
                min={5}
                max={40}
                step={1}
                value={config.outlineThickness ?? 2}
                onChange={(e) =>
                  set('outlineThickness', Number(e.target.value))
                }
                aria-label={t('burnCaptionsOutlineThickness')}
              />
              <span className="bcm-range-value">
                {config.outlineThickness ?? 2}px
              </span>
            </Box>
          </Box>
        ) : null}

        {/* Background color + opacity (only for opaque box style) */}
        {config.borderStyle === 3 ? (
          <>
            <Box className="bcm-section">
              <Typography variant="caption" className="bcm-label">
                {t('burnCaptionsBgColor')}
              </Typography>
              <Box className="bcm-row">
                <input
                  type="color"
                  className="bcm-color-input"
                  value={config.bgColor}
                  onChange={(e) => set('bgColor', e.target.value)}
                  aria-label={t('burnCaptionsBgColor')}
                />
                <span className="bcm-range-value">{config.bgColor}</span>
              </Box>
            </Box>
            <Box className="bcm-section">
              <Typography variant="caption" className="bcm-label">
                {t('burnCaptionsBgOpacity')}
              </Typography>
              <Box className="bcm-row">
                <input
                  type="range"
                  className="bcm-range"
                  min={0}
                  max={100}
                  step={5}
                  value={config.bgOpacity}
                  onChange={(e) => set('bgOpacity', Number(e.target.value))}
                  aria-label={t('burnCaptionsBgOpacity')}
                />
                <span className="bcm-range-value">{config.bgOpacity}%</span>
              </Box>
            </Box>
          </>
        ) : null}

        {/* Animation */}
        <Box className="bcm-section">
          <Typography variant="caption" className="bcm-label">
            {t('burnCaptionsAnimation')}
          </Typography>
          <Box className="bcm-select-wrapper">
            <select
              className="bcm-select"
              value={animType}
              onChange={(e) =>
                setAnim('type', e.target.value as BurnCaptionsAnimationType)
              }
              aria-label={t('burnCaptionsAnimation')}
            >
              {ANIMATION_TYPES.map((aType) => (
                <option
                  key={aType}
                  value={aType}
                  style={{ backgroundColor: 'var(--surface-1, #f4f4f5)' }}
                >
                  {t(
                    `burnCaptionsAnimation${aType.charAt(0).toUpperCase()}${aType.slice(1)}` as Parameters<
                      typeof t
                    >[0],
                  )}
                </option>
              ))}
            </select>
            <span className="bcm-select-chevron">
              <Icon
                icon="/icons/chevron-down.svg"
                size={14}
                color="var(--foreground, #171717)"
              />
            </span>
          </Box>
        </Box>

        {/* Fade sub-options */}
        {animType === 'fade' ? (
          <>
            <Box className="bcm-section">
              <Typography variant="caption" className="bcm-label">
                {t('burnCaptionsAnimationFadeIn')}
              </Typography>
              <Box className="bcm-row">
                <input
                  type="range"
                  className="bcm-range"
                  min={0}
                  max={1000}
                  step={50}
                  value={anim.fadeInMs ?? 300}
                  onChange={(e) => setAnim('fadeInMs', Number(e.target.value))}
                  aria-label={t('burnCaptionsAnimationFadeIn')}
                />
                <span className="bcm-range-value">
                  {anim.fadeInMs ?? 300}ms
                </span>
              </Box>
            </Box>
            <Box className="bcm-section">
              <Typography variant="caption" className="bcm-label">
                {t('burnCaptionsAnimationFadeOut')}
              </Typography>
              <Box className="bcm-row">
                <input
                  type="range"
                  className="bcm-range"
                  min={0}
                  max={1000}
                  step={50}
                  value={anim.fadeOutMs ?? 200}
                  onChange={(e) => setAnim('fadeOutMs', Number(e.target.value))}
                  aria-label={t('burnCaptionsAnimationFadeOut')}
                />
                <span className="bcm-range-value">
                  {anim.fadeOutMs ?? 200}ms
                </span>
              </Box>
            </Box>
          </>
        ) : null}

        {/* SlideUp / SlideDown sub-options */}
        {animType === 'slideUp' || animType === 'slideDown' ? (
          <>
            <Box className="bcm-section">
              <Typography variant="caption" className="bcm-label">
                {t('burnCaptionsAnimationOffset')}
              </Typography>
              <Box className="bcm-row">
                <input
                  type="range"
                  className="bcm-range"
                  min={4}
                  max={80}
                  step={4}
                  value={anim.slideOffset ?? 20}
                  onChange={(e) =>
                    setAnim('slideOffset', Number(e.target.value))
                  }
                  aria-label={t('burnCaptionsAnimationOffset')}
                />
                <span className="bcm-range-value">
                  {anim.slideOffset ?? 20}px
                </span>
              </Box>
            </Box>
            <Box className="bcm-section">
              <Typography variant="caption" className="bcm-label">
                {t('burnCaptionsAnimationDuration')}
              </Typography>
              <Box className="bcm-row">
                <input
                  type="range"
                  className="bcm-range"
                  min={50}
                  max={1000}
                  step={50}
                  value={anim.slideDurationMs ?? 300}
                  onChange={(e) =>
                    setAnim('slideDurationMs', Number(e.target.value))
                  }
                  aria-label={t('burnCaptionsAnimationDuration')}
                />
                <span className="bcm-range-value">
                  {anim.slideDurationMs ?? 300}ms
                </span>
              </Box>
            </Box>
          </>
        ) : null}

        {/* Blur sub-options */}
        {animType === 'blur' ? (
          <>
            <Box className="bcm-section">
              <Typography variant="caption" className="bcm-label">
                {t('burnCaptionsAnimationStrength')}
              </Typography>
              <Box className="bcm-row">
                <input
                  type="range"
                  className="bcm-range"
                  min={1}
                  max={40}
                  step={1}
                  value={anim.blurStrength ?? 15}
                  onChange={(e) =>
                    setAnim('blurStrength', Number(e.target.value))
                  }
                  aria-label={t('burnCaptionsAnimationStrength')}
                />
                <span className="bcm-range-value">
                  {anim.blurStrength ?? 15}
                </span>
              </Box>
            </Box>
            <Box className="bcm-section">
              <Typography variant="caption" className="bcm-label">
                {t('burnCaptionsAnimationDuration')}
              </Typography>
              <Box className="bcm-row">
                <input
                  type="range"
                  className="bcm-range"
                  min={50}
                  max={1000}
                  step={50}
                  value={anim.blurDurationMs ?? 300}
                  onChange={(e) =>
                    setAnim('blurDurationMs', Number(e.target.value))
                  }
                  aria-label={t('burnCaptionsAnimationDuration')}
                />
                <span className="bcm-range-value">
                  {anim.blurDurationMs ?? 300}ms
                </span>
              </Box>
            </Box>
          </>
        ) : null}

        {/* Zoom sub-options */}
        {animType === 'zoom' ? (
          <Box className="bcm-section">
            <Typography variant="caption" className="bcm-label">
              {t('burnCaptionsAnimationDuration')}
            </Typography>
            <Box className="bcm-row">
              <input
                type="range"
                className="bcm-range"
                min={50}
                max={1000}
                step={50}
                value={anim.zoomDurationMs ?? 300}
                onChange={(e) =>
                  setAnim('zoomDurationMs', Number(e.target.value))
                }
                aria-label={t('burnCaptionsAnimationDuration')}
              />
              <span className="bcm-range-value">
                {anim.zoomDurationMs ?? 300}ms
              </span>
            </Box>
          </Box>
        ) : null}

        {/* Karaoke sub-options */}
        {animType === 'karaoke' ? (
          <>
            <Box className="bcm-section">
              <Typography variant="caption" className="bcm-label">
                {t('burnCaptionsAnimationKaraokeMode')}
              </Typography>
              <Box className="bcm-select-wrapper">
                <select
                  className="bcm-select"
                  value={anim.karaokeMode ?? 'kf'}
                  onChange={(e) =>
                    setAnim('karaokeMode', e.target.value as 'k' | 'kf' | 'ko')
                  }
                  aria-label={t('burnCaptionsAnimationKaraokeMode')}
                >
                  <option
                    value="kf"
                    style={{ backgroundColor: 'var(--surface-1, #f4f4f5)' }}
                  >
                    {t('burnCaptionsAnimationKaraokeSweep')}
                  </option>
                  <option
                    value="k"
                    style={{ backgroundColor: 'var(--surface-1, #f4f4f5)' }}
                  >
                    {t('burnCaptionsAnimationKaraokeInstant')}
                  </option>
                  <option
                    value="ko"
                    style={{ backgroundColor: 'var(--surface-1, #f4f4f5)' }}
                  >
                    {t('burnCaptionsAnimationKaraokeFilled')}
                  </option>
                </select>
                <span className="bcm-select-chevron">
                  <Icon
                    icon="/icons/chevron-down.svg"
                    size={14}
                    color="var(--foreground, #171717)"
                  />
                </span>
              </Box>
            </Box>
            <Box className="bcm-section">
              <Typography variant="caption" className="bcm-label">
                {t('burnCaptionsAnimationKaraokeHighlight')}
              </Typography>
              <Box className="bcm-row">
                <input
                  type="color"
                  className="bcm-color-input"
                  value={anim.karaokeHighlightColour ?? '#ffff00'}
                  onChange={(e) =>
                    setAnim('karaokeHighlightColour', e.target.value)
                  }
                  aria-label={t('burnCaptionsAnimationKaraokeHighlight')}
                />
                <span className="bcm-range-value">
                  {anim.karaokeHighlightColour ?? '#ffff00'}
                </span>
              </Box>
            </Box>
          </>
        ) : null}
      </Box>
    </ConfirmationModal>
  );
}

export default BurnCaptionsModal;
