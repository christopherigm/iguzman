"use client";

import { useState, useEffect, useRef } from "react";
import "./gradient-builder.css";
import { Box } from "./box";
import { Card } from "./card";
import { Typography } from "./typography";
import { TextInput } from "./text-input";
import { Button } from "./button";
import { IconButton } from "./icon-button";

export type GradientType = "linear" | "radial" | "solid";

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
  opacity?: string;
  rawCss?: string;
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Split by top-level commas (ignores commas inside rgb/rgba/hsl parens). */
function splitTopLevel(str: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of str) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
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
  // bare color (no position - will be auto-assigned)
  if (trimmed) return { color: trimmed, position: -1 };
  return null;
}

/**
 * Split a hex color of any length (#rgb, #rgba, #rrggbb, #rrggbbaa) into its
 * opaque 6-digit form plus a 0-100 alpha. Returns null for non-hex colors.
 */
function expandHex(color: string): { hex6: string; alpha: number } | null {
  const m = color.trim().match(/^#([0-9a-fA-F]{3,8})$/);
  const d = m?.[1];
  if (!d) return null;
  if (d.length === 3 || d.length === 4) {
    const [r, g, b, a] = d.split("");
    return {
      hex6: `#${r}${r}${g}${g}${b}${b}`,
      alpha: a ? Math.round((parseInt(a + a, 16) / 255) * 100) : 100,
    };
  }
  if (d.length === 6) return { hex6: `#${d}`, alpha: 100 };
  if (d.length === 8)
    return {
      hex6: `#${d.slice(0, 6)}`,
      alpha: Math.round((parseInt(d.slice(6), 16) / 255) * 100),
    };
  return null;
}

/** The numeric arguments of an `rgb()` / `rgba()` color, in either syntax. */
function rgbParts(color: string): string[] | null {
  const inner = color.trim().match(/^rgba?\(([^)]+)\)$/i)?.[1];
  if (!inner) return null;
  const nums = inner.split(/[\s,/]+/).filter(Boolean);
  return nums.length >= 3 ? nums : null;
}

/** The 0-100 alpha of a stop color; 100 when it carries none. */
function alphaOf(color: string): number {
  const hex = expandHex(color);
  if (hex) return hex.alpha;
  const raw = rgbParts(color)?.[3];
  if (raw != null) {
    const a = parseFloat(raw);
    if (!Number.isNaN(a))
      return Math.min(
        100,
        Math.max(0, Math.round(raw.endsWith("%") ? a : a * 100)),
      );
  }
  return 100;
}

/** Whether the alpha of this color can be edited (hex and rgb() only). */
function supportsAlpha(color: string): boolean {
  return expandHex(color) !== null || rgbParts(color) !== null;
}

/** Re-emit `color` with a 0-100 alpha, keeping its original notation. */
function withAlpha(color: string, alpha: number): string {
  const hex = expandHex(color);
  if (hex) {
    if (alpha >= 100) return hex.hex6;
    const a = Math.round((alpha / 100) * 255)
      .toString(16)
      .padStart(2, "0");
    return `${hex.hex6}${a}`;
  }
  const parts = rgbParts(color);
  if (parts) {
    const [r, g, b] = parts;
    return alpha >= 100
      ? `rgb(${r}, ${g}, ${b})`
      : `rgba(${r}, ${g}, ${b}, ${(alpha / 100).toFixed(2)})`;
  }
  return color;
}

/** The value to feed the native swatch, which only accepts 6-digit hex. */
function swatchValue(color: string): string {
  return expandHex(color)?.hex6 ?? "#000000";
}

function autoPosition(stops: ColorStop[]): ColorStop[] {
  const n = stops.length;
  return stops.map((s, i) =>
    s.position >= 0
      ? s
      : { ...s, position: n === 1 ? 0 : Math.round((i / (n - 1)) * 100) },
  );
}

function parseCss(
  css: string,
): { type: GradientType; stops: ColorStop[]; angle: number } | null {
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
    const raw = stopParts
      .map(parseColorStop)
      .filter((s): s is ColorStop => s !== null);
    if (raw.length >= 2)
      return { type: "linear", stops: autoPosition(raw), angle };
  }

  const radialMatch = v.match(/^radial-gradient\((.+)\)$/s);
  if (radialMatch?.[1] != null) {
    const parts = splitTopLevel(radialMatch[1]);
    let stopParts = parts;
    // skip shape / position descriptor (doesn't start with a colour)
    if (
      parts[0] &&
      !parts[0].startsWith("#") &&
      !parts[0].startsWith("rgb") &&
      !parts[0].startsWith("hsl")
    ) {
      stopParts = parts.slice(1);
    }
    const raw = stopParts
      .map(parseColorStop)
      .filter((s): s is ColorStop => s !== null);
    if (raw.length >= 2)
      return { type: "radial", stops: autoPosition(raw), angle: 135 };
  }

  // solid hex / rgb / hsl
  if (/^#[0-9a-fA-F]{3,8}$/.test(v) || /^rgba?\(/.test(v) || /^hsl/.test(v)) {
    return { type: "solid", stops: [{ color: v, position: 0 }], angle: 135 };
  }

  return null;
}

function buildCss(
  type: GradientType,
  stops: ColorStop[],
  angle: number,
): string {
  if (type === "solid") return stops[0]?.color ?? "#000000";
  const stopsStr = stops.map((s) => `${s.color} ${s.position}%`).join(", ");
  if (type === "linear") return `linear-gradient(${angle}deg, ${stopsStr})`;
  // `ellipse`, not `circle`: the value paints wide, short section bands, and a
  // circle ignores their aspect ratio - it gets sized to the far corners and
  // its transition runs off the top/bottom edges. An ellipse follows the box's
  // shape; `farthest-corner` keeps a soft falloff that ends at the corners.
  return `radial-gradient(ellipse farthest-corner at center, ${stopsStr})`;
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
  { color: "#2196f3", position: 0 },
  { color: "#e040fb", position: 100 },
];

const DEFAULT_LABELS: Required<GradientBuilderLabels> = {
  linear: "Linear",
  radial: "Radial",
  solid: "Solid",
  angle: "Angle",
  color: "Color",
  stops: "Color Stops",
  addStop: "Add stop",
  removeStop: "Remove stop",
  pickColor: "Pick color",
  opacity: "Opacity",
  rawCss: "CSS value",
};

export function GradientBuilder({
  value,
  onChange,
  label,
  labels,
}: GradientBuilderProps) {
  const l: Required<GradientBuilderLabels> = { ...DEFAULT_LABELS, ...labels };

  const [type, setType] = useState<GradientType>("linear");
  const [angle, setAngle] = useState(135);
  const [stops, setStops] = useState<ColorStop[]>(DEFAULT_STOPS);
  const [rawCss, setRawCss] = useState("");

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

  const emit = (
    nextType: GradientType,
    nextStops: ColorStop[],
    nextAngle: number,
  ) => {
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
    const firstStop: ColorStop = stops[0] ??
      DEFAULT_STOPS[0] ?? { color: "#000000", position: 0 };
    const nextStops: ColorStop[] =
      next === "solid"
        ? [firstStop]
        : stops.length >= 2
          ? stops
          : DEFAULT_STOPS;
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

  /** The swatch only knows RGB - keep whatever alpha the stop already had. */
  const handleSwatch = (i: number, hex6: string) => {
    const current = stops[i]?.color ?? "#000000";
    handleStopColor(i, withAlpha(hex6, alphaOf(current)));
  };

  const handleStopAlpha = (i: number, value: string) => {
    const current = stops[i]?.color;
    if (current == null) return;
    const a = Math.min(100, Math.max(0, parseInt(value) || 0));
    handleStopColor(i, withAlpha(current, a));
  };

  const handleStopPosition = (i: number, pos: string) => {
    const p = Math.min(100, Math.max(0, parseInt(pos) || 0));
    const next = stops.map((s, idx) => (idx === i ? { ...s, position: p } : s));
    setStops(next);
    emit(type, next, angle);
  };

  const addStop = () => {
    const last: ColorStop = stops[stops.length - 1] ??
      DEFAULT_STOPS[1] ?? { color: "#e040fb", position: 100 };
    const prev: ColorStop = stops[stops.length - 2] ??
      DEFAULT_STOPS[0] ?? { color: "#2196f3", position: 0 };
    const pos = Math.round((prev.position + last.position) / 2);
    const next: ColorStop[] = [
      ...stops.slice(0, -1),
      { color: "#ffffff", position: pos },
      last,
    ];
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
  const TYPES: GradientType[] = ["linear", "radial", "solid"];

  return (
    <Card padding={16} borderRadius={8} gap="12px">
      {label && <label className="gb__label">{label}</label>}

      {/* Live preview, over a checkerboard so alpha is visible */}
      <Box
        className="gb__checker"
        height={160}
        marginTop="4px"
        marginBottom="4px"
        borderRadius={8}
        border="1px solid color-mix(in srgb, var(--foreground) 12%, transparent)"
        styles={{ overflow: "hidden" }}
      >
        <Box
          width="100%"
          height="100%"
          styles={rawCss ? { background: rawCss } : undefined}
        />
      </Box>

      {/* Type tabs */}
      <Box display="flex" gap="6px">
        {TYPES.map((tp) => (
          <Button
            key={tp}
            text={l[tp]}
            size="md"
            kind={type === tp && canParse ? "primary" : undefined}
            onClick={() => handleTypeChange(tp)}
            aria-pressed={type === tp && canParse}
          />
        ))}
      </Box>

      {canParse && (
        <>
          {/* Angle (linear only) */}
          {type === "linear" && (
            <Box display="flex" alignItems="center" gap="8px">
              <Typography as="span" variant="body" className="gb__sublabel">
                {l.angle}
              </Typography>
              <input
                type="range"
                min={0}
                max={360}
                value={angle}
                onChange={(e) => handleAngleChange(e.target.value)}
                className="gb__range"
                aria-label={l.angle}
              />
              <input
                type="number"
                min={0}
                max={360}
                value={angle}
                onChange={(e) => handleAngleChange(e.target.value)}
                className="gb__angle-num"
                aria-label={l.angle}
              />
              <Typography as="span" variant="body">
                °
              </Typography>
            </Box>
          )}

          {/* Color stops */}
          <Box flexDirection="column" gap="8px">
            <Box
              display="flex"
              alignItems="center"
              justifyContent="space-between"
            >
              <Typography as="span" variant="body" className="gb__sublabel">
                {type === "solid" ? l.color : l.stops}
              </Typography>
              {type !== "solid" && (
                <Button text={`+ ${l.addStop}`} size="sm" onClick={addStop} />
              )}
            </Box>
            {stops.map((stop, i) => (
              <Box key={i} flexDirection="column" gap="6px">
                <Box display="flex" alignItems="center" gap="8px">
                  <input
                    type="color"
                    value={swatchValue(stop.color)}
                    onChange={(e) => handleSwatch(i, e.target.value)}
                    className="gb__swatch"
                    title={l.pickColor}
                  />
                  <TextInput
                    value={stop.color}
                    onChange={(v) => handleStopColor(i, v)}
                    placeholder="#000000"
                    className="gb__stop-text"
                  />
                  {type !== "solid" && (
                    <>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={stop.position}
                        onChange={(e) => handleStopPosition(i, e.target.value)}
                        className="gb__pos-num"
                        aria-label={`${l.stops} ${i + 1} position`}
                      />
                      <Typography as="span" variant="body">
                        %
                      </Typography>
                      {stops.length > 2 && (
                        <IconButton
                          icon="/icons/close.svg"
                          size="sm"
                          kind="error"
                          onClick={() => removeStop(i)}
                          aria-label={l.removeStop}
                          title={l.removeStop}
                        />
                      )}
                    </>
                  )}
                </Box>
                {/* Alpha: the native swatch is RGB-only, so transparency needs
                    its own control. Disabled for notations we can't rewrite
                    (named colors, hsl) rather than silently replacing them. */}
                <Box display="flex" alignItems="center" gap="8px">
                  <Typography as="span" variant="body" className="gb__sublabel">
                    {l.opacity}
                  </Typography>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={alphaOf(stop.color)}
                    disabled={!supportsAlpha(stop.color)}
                    onChange={(e) => handleStopAlpha(i, e.target.value)}
                    className="gb__range"
                    aria-label={`${l.opacity} ${i + 1}`}
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={alphaOf(stop.color)}
                    disabled={!supportsAlpha(stop.color)}
                    onChange={(e) => handleStopAlpha(i, e.target.value)}
                    className="gb__pos-num"
                    aria-label={`${l.opacity} ${i + 1}`}
                  />
                  <Typography as="span" variant="body">
                    %
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </>
      )}

      {/* Raw CSS - always visible */}
      <Box flexDirection="column" gap="4px">
        <Typography as="span" variant="body" className="gb__sublabel">
          {l.rawCss}
        </Typography>
        <TextInput
          value={rawCss}
          onChange={handleRawChange}
          placeholder="linear-gradient(135deg, #2196f3 0%, #e040fb 100%)"
          className="gb__raw"
        />
      </Box>
    </Card>
  );
}
