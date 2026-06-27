"use client";

import { useState } from "react";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Card } from "@repo/ui/core-elements/card";
import { Button } from "@repo/ui/core-elements/button";
import { Switch } from "@repo/ui/core-elements/switch";
import { downloadAnalysisPdf } from "../lib/analysis-pdf";
import type { AnalysisPdfProps } from "./analysis-pdf";

export interface AnalysisPdfExportLabels {
  cardHeading: string;
  cardDescription: string;
  selectLabel: string;
  exportButton: string;
  exporting: string;
  exportError: string;
  fileLabel: string;
}

/**
 * Export-to-PDF card for the Product Analysis page. Renders one Switch per
 * section so the user picks what to include, then generates a localized PRD
 * from the pre-built (server-resolved) payload. The full payload arrives as a
 * prop; export filters it down to the selected sections.
 */
export function AnalysisPdfExport({
  data,
  labels,
}: {
  data: AnalysisPdfProps;
  labels: AnalysisPdfExportLabels;
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(data.sections.map((s) => [s.id, true])),
  );
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);

  const anySelected = data.sections.some((s) => selected[s.id]);

  const toggle = (id: string, checked: boolean) =>
    setSelected((prev) => ({ ...prev, [id]: checked }));

  const handleExport = async () => {
    if (!anySelected) return;
    setExporting(true);
    setExportError(false);
    try {
      await downloadAnalysisPdf(
        { ...data, sections: data.sections.filter((s) => selected[s.id]) },
        labels.fileLabel,
      );
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card gap={16} padding={20}>
      <Box display="flex" flexDirection="column" gap={2}>
        <Typography fontWeight={700} color="var(--foreground)">
          {labels.cardHeading}
        </Typography>
        <Typography color="var(--muted-foreground, #6b7280)">
          {labels.cardDescription}
        </Typography>
      </Box>

      <Box display="flex" flexDirection="column" gap={4}>
        <Typography fontWeight={600} color="var(--foreground)">
          {labels.selectLabel}
        </Typography>
        <Box display="flex" flexDirection="column" gap={0}>
          {data.sections.map((section, idx, arr) => (
            <Box
              key={section.id}
              display="flex"
              flexDirection="row"
              justifyContent="space-between"
              alignItems="center"
              gap={12}
              padding="10px 0"
              styles={{
                borderBottom:
                  idx === arr.length - 1
                    ? undefined
                    : "1px solid var(--border, #e5e7eb)",
              }}
            >
              <Typography
                color="var(--foreground)"
                styles={{ minWidth: 0, overflowWrap: "anywhere" }}
              >
                {section.heading}
              </Typography>
              <Switch
                checked={selected[section.id] ?? false}
                onChange={(checked) => toggle(section.id, checked)}
                aria-label={section.heading}
              />
            </Box>
          ))}
        </Box>
      </Box>

      <Box justifyContent="center">
        <Button
          text={exporting ? labels.exporting : labels.exportButton}
          kind="primary"
          size="md"
          onClick={handleExport}
          disabled={exporting || !anySelected}
          width={200}
        />
      </Box>

      {exportError && (
        <Typography color="var(--error, #dc2626)">
          {labels.exportError}
        </Typography>
      )}
    </Card>
  );
}

export default AnalysisPdfExport;
