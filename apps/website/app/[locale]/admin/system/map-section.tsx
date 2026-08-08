"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Select } from "@repo/ui/core-elements/select";
import { TextInput } from "@repo/ui/core-elements/text-input";

/**
 * Which basemap every map on this tenant's site is painted from - the locations
 * on the contact page, an event's venue, and the booking page's map of the
 * chosen location.
 *
 * ⚠ **This picks a style; it cannot pick what the style contains.** The maps
 * draw OpenStreetMap-style **raster** tiles - finished PNGs - so building
 * footprints, roads and labels are painted into each image before it reaches the
 * browser. There is no "hide the houses" switch to add here, and none can be
 * added while the renderer is a raster one: the only routes to a real per-layer
 * choice are to pick a style that already de-emphasises what you want gone, or
 * to author one in a tile provider's own style editor with the layer deleted and
 * name its raster endpoint under **Custom**. The help text under the picker says
 * exactly this, because "why is there no buildings checkbox?" is otherwise the
 * first question an operator asks.
 *
 * Three things worth knowing:
 *
 * - **Only Custom reads the three fields below it**, so they are rendered only
 *   for that choice rather than sitting greyed out under the built-in styles.
 *   The API validates them in the same conditional way - it will not refuse a
 *   leftover URL under a built-in style, which is the normal state of a row
 *   somebody experimented with.
 * - **The credit is not optional and not decoration.** Every tile provider
 *   requires attribution, and it is a licence term rather than a caption - which
 *   is why the built-in styles carry theirs in code (`@repo/ui`'s `basemaps.ts`)
 *   where it cannot be edited apart from the URL it belongs to, and why the
 *   custom field's placeholder is the OpenStreetMap credit that a self-rendered
 *   OSM style still owes.
 * - ⚠ **The credit's link is its own field, and blank means unlinked.** Most
 *   providers require the credit to point back at them; the maps used to anchor
 *   every credit to openstreetmap.org/copyright regardless, so a "© MapTiler"
 *   named one party and linked another. Left empty the credit is drawn as plain
 *   text - don't "restore" a default href here.
 *
 * ⚠ **A provider key pasted into the tile URL is public.** Tiles are fetched by
 * the visitor's browser and `GET /api/system/` is world-readable, so this field
 * cannot hide one and must not be treated as if it could. Restrict the key by
 * allowed origin at the provider instead.
 */

/**
 * The styles, in the order they are offered. Mirrors both `BASEMAPS` in
 * `@repo/ui/core-elements/basemaps` (which holds each URL and its credit) and
 * the `map_style` choices on website-api's `System` - the API validates against
 * that list, so a value added here without being added there is rejected on
 * save.
 */
const STYLES = [
  { value: "osm", key: "mapStyleOsm" },
  { value: "carto-light", key: "mapStyleCartoLight" },
  { value: "carto-dark", key: "mapStyleCartoDark" },
  { value: "carto-voyager", key: "mapStyleCartoVoyager" },
  { value: "custom", key: "mapStyleCustom" },
] as const;

interface MapSectionProps {
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

export function MapSection({ values, onChange }: MapSectionProps) {
  const t = useTranslations("Admin");

  const style = String(values.map_style ?? "osm");

  return (
    <Box flexDirection="column" gap={16}>
      <Typography as="h3" variant="h4" fontWeight={700}>
        {t("mapTitle")}
      </Typography>
      <Typography variant="body" color="var(--muted-foreground, #6b7280)">
        {t("mapIntro")}
      </Typography>

      <Box maxWidth={320}>
        <Select
          label={t("mapStyle")}
          value={style}
          onChange={(v) => onChange("map_style", v)}
          options={STYLES.map(({ value, key }) => ({ value, label: t(key) }))}
        />
      </Box>
      <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
        {t("mapStyleHelp")}
      </Typography>

      {/* Rendered only for the choice that reads them - see the note above.
          All three placeholders are literals rather than message keys,
          deliberately: they are a URL template, the exact credit string
          OpenStreetMap requires, and a provider's own copyright page.
          Translating any of them would make the example wrong, not clearer. */}
      {style === "custom" && (
        <>
          <TextInput
            label={t("mapTileUrl")}
            value={String(values.map_tile_url ?? "")}
            onChange={(v) => onChange("map_tile_url", v)}
            placeholder="https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=YOUR_KEY"
            helperText={t("mapTileUrlHelp")}
          />
          <TextInput
            label={t("mapCredit")}
            value={String(values.map_attribution ?? "")}
            onChange={(v) => onChange("map_attribution", v)}
            placeholder="© MapTiler © OpenStreetMap contributors"
            helperText={t("mapCreditHelp")}
          />
          <TextInput
            label={t("mapCreditUrl")}
            value={String(values.map_attribution_url ?? "")}
            onChange={(v) => onChange("map_attribution_url", v)}
            placeholder="https://www.maptiler.com/copyright/"
            helperText={t("mapCreditUrlHelp")}
          />
        </>
      )}
    </Box>
  );
}
