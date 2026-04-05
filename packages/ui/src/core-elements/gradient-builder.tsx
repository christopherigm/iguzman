'use client';

import { useState, useEffect, useRef } from 'react';
import './gradient-builder.css';
import { Box } from './box';
import { Typography } from './typography';
import { TextInput } from './text-input';

export type GradientType = 'linear' | 'radial' | 'solid';

export interface ColorStop {
  color: string;
  position: number;
}

export interface GradientBuilderLabels {
  linear?: string;
  radial?: string;
  solid?: string;
  angle?: string;
  color?: string;
  stops?: string;
  addStop?: string;
  removeStop?: string;
  pickColor?: string;
  rawCss?: string;
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Split by top-level commas (ignores commas inside rgb/rgba/hsl parens). */
function splitTopLevel(str: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of str) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function parseColorStop(part: string): ColorStop | null {
  const trimmed = part.trim();
  // <color> <pct>%
  const withPos = trimmed.match(/^(.+?)\s+(\d+(?:\.\d+)?)%\s*$/);
  if (withPos?.[1] != null && withPos[2] != null) {
    return { color: withPos[1].trim(), position: parseFloat(withPos[2]) };
  }
  // bare color (no position — will be auto-assigned)
  if (trimmed) return { color: trimmed, position: -1 };
  return null;
}

function autoPosition(stops: ColorStop[]): ColorStop[] {
  const n = stops.length;
  return stops.map((s, i) =>
    s.position >= 0 ? s : { ...s, position: n === 1 ? 0 : Math.round((i / (n - 1)) * 100) },
  );
}

function parseCss(css: string): { type: GradientType; stops: ColorStop[]; angle: number } | null {
  const v = css.trim();
  if (!v) return null;

  const linearMatch = v.match(/^linear-gradient\((.+)\)$/s);
  if (linearMatch?.[1] != null) {
    const parts = splitTopLevel(linearMatch[1]);
    let angle = 135;
    let stopParts = parts;
    const anglePart = parts[0]?.match(/^(-?\d+(?:\.\d+)?)deg$/);
    if (anglePart?.[1] != null) {
      angle = parseFloat(anglePart[1]);
      stopParts = parts.slice(1);
    }
    const raw = stopParts.map(parseColorStop).filter((s): s is ColorStop => s !== null);
    if (raw.length >= 2) return { type: 'linear', stops: autoPosition(raw), angle };
  }

  const radialMatch = v.match(/^radial-gradient\((.+)\)$/s);
  if (radialMatch?.[1] != null) {
    const parts = splitTopLevel(radialMatch[1]);
    let stopParts = parts;
    // skip shape / position descriptor (doesn't start with a colour)
    if (
      parts[0] &&
      !parts[0].startsWith('#') &&
      !parts[0].startsWith('rgb') &&
      !parts[0].startsWith('hsl')
    ) {
      stopParts = parts.slice(1);
    }
    const raw = stopParts.map(parseColorStop).filter((s): s is ColorStop => s !== null);
    if (raw.length >= 2) return { type: 'radial', stops: autoPosition(raw), angle: 135 };
  }

  // solid hex / rgb / hsl
  if (/^#[0-9a-fA-F]{3,8}$/.test(v) || /^rgba?\(/.test(v) || /^hsl/.test(v)) {
    return { type: 'solid', stops: [{ color: v, position: 0 }], angle: 135 };
  }

  return null;
}

function buildCss(type: GradientType, stops: ColorStop[], angle: number): string {
  if (type === 'solid') return stops[0]?.color ?? '#000000';
  const stopsStr = stops.map((s) => `${s.color} ${s.position}%`).join(', ');
  if (type === 'linear') return `linear-gradient(${angle}deg, ${stopsStr})`;
  return `radial-gradient(circle at center, ${stopsStr})`;
}

// ── component ─────────────────────────────────────────────────────────────────

export interface GradientBuilderProps {
  value: string;
  onChange: (css: string) => void;
  /** Field label rendered above the preview. */
  label?: string;
  /** Override UI strings for i18n. Falls back to English defaults. */
  labels?: GradientBuilderLabels;
}

const DEFAULT_STOPS: ColorStop[] = [
  { color: '#2196f3', position: 0 },
  { color: '#e040fb', position: 100 },
];

const DEFAULT_LABELS: Required<GradientBuilderLabels> = {
  linear: 'Linear',
  radial: 'Radial',
  solid: 'Solid',
  angle: 'Angle',
  color: 'Color',
  stops: 'Color Stops',
  addStop: 'Add stop',
  removeStop: 'Remove stop',
  pickColor: 'Pick color',
  rawCss: 'CSS value',
};

export function GradientBuilder({ value, onChange, label, labels }: GradientBuilderProps) {
  const l: Required<GradientBuilderLabels> = { ...DEFAULT_LABELS, ...labels };

  const [type, setType] = useState<GradientType>('linear');
  const [angle, setAngle] = useState(135);
  const [stops, setStops] = useState<ColorStop[]>(DEFAULT_STOPS);
  const [rawCss, setRawCss] = useState('');

  // Track whether a change is coming from inside this component so we don't
  // re-parse what we just emitted.
  const internalRef = useRef(false);

  useEffect(() => {
    if (internalRef.current) return;
    const parsed = parseCss(value);
    if (parsed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setType(parsed.type);
      setAngle(parsed.angle);
      setStops(parsed.stops);
    }
    setRawCss(value);
  }, [value]);

  const emit = (nextType: GradientType, nextStops: ColorStop[], nextAngle: number) => {
    const css = buildCss(nextType, nextStops, nextAngle);
    internalRef.current = true;
    setRawCss(css);
    onChange(css);
    // allow the next external value change to be processed
    requestAnimationFrame(() => {
      internalRef.current = false;
    });
  };

  const handleTypeChange = (next: GradientType) => {
    setType(next);
    const firstStop: ColorStop = stops[0] ?? DEFAULT_STOPS[0] ?? { color: '#000000', position: 0 };
    const nextStops: ColorStop[] =
      next === 'solid' ? [firstStop] : stops.length >= 2 ? stops : DEFAULT_STOPS;
    setStops(nextStops);
    emit(next, nextStops, angle);
  };

  const handleAngleChange = (v: string) => {
    const a = Math.min(360, Math.max(0, parseInt(v) || 0));
    setAngle(a);
    emit(type, stops, a);
  };

  const handleStopColor = (i: number, color: string) => {
    const next = stops.map((s, idx) => (idx === i ? { ...s, color } : s));
    setStops(next);
    emit(type, next, angle);
  };

  const handleStopPosition = (i: number, pos: string) => {
    const p = Math.min(100, Math.max(0, parseInt(pos) || 0));
    const next = stops.map((s, idx) => (idx === i ? { ...s, position: p } : s));
    setStops(next);
    emit(type, next, angle);
  };

  const addStop = () => {
    const last: ColorStop =
      stops[stops.length - 1] ?? DEFAULT_STOPS[1] ?? { color: '#e040fb', position: 100 };
    const prev: ColorStop =
      stops[stops.length - 2] ?? DEFAULT_STOPS[0] ?? { color: '#2196f3', position: 0 };
    const pos = Math.round((prev.position + last.position) / 2);
    const next: ColorStop[] = [...stops.slice(0, -1), { color: '#ffffff', position: pos }, last];
    setStops(next);
    emit(type, next, angle);
  };

  const removeStop = (i: number) => {
    if (stops.length <= 2) return;
    const next = stops.filter((_, idx) => idx !== i);
    setStops(next);
    emit(type, next, angle);
  };

  const handleRawChange = (v: string) => {
    setRawCss(v);
    const parsed = parseCss(v);
    if (parsed) {
      setType(parsed.type);
      setAngle(parsed.angle);
      setStops(parsed.stops);
    }
    internalRef.current = true;
    onChange(v);
    requestAnimationFrame(() => {
      internalRef.current = false;
    });
  };

  const canParse = parseCss(rawCss) !== null;
  const TYPES: GradientType[] = ['linear', 'radial', 'solid'];

  return (
    <Box className="gb" flexDirection="column" gap="12px">
      {label && <label className="gb__label">{label}</label>}

      {/* Live preview */}
      <Box className="gb__preview" styles={rawCss ? { background: rawCss } : undefined} />

      {/* Type tabs */}
      <Box display="flex" gap="6px">
        {TYPES.map((tp) => (
          <button
            key={tp}
            type="button"
            className={`gb__type-btn${type === tp && canParse ? ' gb__type-btn--active' : ''}`}
            onClick={() => handleTypeChange(tp)}
          >
            {l[tp]}
          </button>
        ))}
      </Box>

      {canParse && (
        <>
          {/* Angle (linear only) */}
          {type === 'linear' && (
            <Box display="flex" alignItems="center" gap="8px">
              <Typography as="span" variant="body-sm" className="gb__sublabel">
                {l.angle}
              </Typography>
              <input
                type="range"
                min={0}
                max={360}
                value={angle}
                onChange={(e) => handleAngleChange(e.target.value)}
                className="gb__range"
              />
              <input
                type="number"
                min={0}
                max={360}
                value={angle}
                onChange={(e) => handleAngleChange(e.target.value)}
                className="gb__angle-num"
              />
              <Typography as="span" variant="body-sm">
                °
              </Typography>
            </Box>
          )}

          {/* Color stops */}
          <Box flexDirection="column" gap="8px">
            <Box display="flex" alignItems="center" justifyContent="space-between">
              <Typography as="span" variant="body-sm" className="gb__sublabel">
                {type === 'solid' ? l.color : l.stops}
              </Typography>
              {type !== 'solid' && (
                <button type="button" className="gb__add-btn" onClick={addStop}>
                  + {l.addStop}
                </button>
              )}
            </Box>
            {stops.map((stop, i) => (
              <Box key={i} display="flex" alignItems="center" gap="8px">
                <input
                  type="color"
                  value={stop.color.startsWith('#') ? stop.color : '#000000'}
                  onChange={(e) => handleStopColor(i, e.target.value)}
                  className="gb__swatch"
                  title={l.pickColor}
                />
                <TextInput
                  value={stop.color}
                  onChange={(v) => handleStopColor(i, v)}
                  placeholder="#000000"
                  className="gb__stop-text"
                />
                {type !== 'solid' && (
                  <>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={stop.position}
                      onChange={(e) => handleStopPosition(i, e.target.value)}
                      className="gb__pos-num"
                    />
                    <Typography as="span" variant="body-sm">
                      %
                    </Typography>
                    {stops.length > 2 && (
                      <button
                        type="button"
                        className="gb__remove-btn"
                        onClick={() => removeStop(i)}
                        aria-label={l.removeStop}
                        title={l.removeStop}
                      >
                        ×
                      </button>
                    )}
                  </>
                )}
              </Box>
            ))}
          </Box>
        </>
      )}

      {/* Raw CSS — always visible */}
      <Box flexDirection="column" gap="4px">
        <Typography as="span" variant="body-sm" className="gb__sublabel">
          {l.rawCss}
        </Typography>
        <TextInput
          value={rawCss}
          onChange={handleRawChange}
          placeholder="linear-gradient(135deg, #2196f3 0%, #e040fb 100%)"
          className="gb__raw"
        />
      </Box>
    </Box>
  );
}
