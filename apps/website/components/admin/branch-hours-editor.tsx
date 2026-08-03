"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Switch } from "@repo/ui/core-elements/switch";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Typography } from "@repo/ui/core-elements/typography";

/**
 * One weekday's opening hours, in the shape the API reads and writes.
 *
 * `weekday` follows Python's `date.weekday()` - Monday=0 … Sunday=6 - because
 * that is what the availability engine walks dates with. A second convention on
 * this side is how a schedule ends up one day out.
 */
export interface BranchHoursRow {
  weekday: number;
  opens_at: string;
  closes_at: string;
  break_start?: string | null;
  break_end?: string | null;
}

interface BranchHoursEditorProps {
  value: BranchHoursRow[];
  onChange: (rows: BranchHoursRow[]) => void;
}

/** Monday-first, matching the weekday numbering the API uses. */
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/** What a day gets when it is first switched on - a normal working day. */
const DEFAULT_OPEN = "09:00";
const DEFAULT_CLOSE = "17:00";
const DEFAULT_BREAK_START = "13:00";
const DEFAULT_BREAK_END = "14:00";

/**
 * The weekly opening-hours grid on a branch's CMS page, and the only place a
 * tenant says when it can take bookings.
 *
 * **A closed day is a row that is not there.** There is no "closed" switch
 * writing a flag: the API treats a weekday with no row as closed, so the toggle
 * adds and removes the row itself. That keeps one state where there could be two
 * (a row marked closed versus no row) and makes the payload say exactly what the
 * customer's calendar will show.
 *
 * The whole week is submitted together by the branch form, not per row - a
 * per-day save could half-fail and leave a branch open on days the operator had
 * just closed.
 */
export function BranchHoursEditor({ value, onChange }: BranchHoursEditorProps) {
  const t = useTranslations("AdminBranches");

  const byWeekday = new Map(value.map((row) => [row.weekday, row]));

  const setRow = (weekday: number, patch: Partial<BranchHoursRow>) => {
    onChange(
      value.map((row) =>
        row.weekday === weekday ? { ...row, ...patch } : row,
      ),
    );
  };

  const toggleDay = (weekday: number, open: boolean) => {
    if (!open) {
      onChange(value.filter((row) => row.weekday !== weekday));
      return;
    }
    const next = [
      ...value,
      { weekday, opens_at: DEFAULT_OPEN, closes_at: DEFAULT_CLOSE },
    ];
    // Kept sorted so the payload reads in week order and the rows never jump
    // around as days are switched on.
    next.sort((a, b) => a.weekday - b.weekday);
    onChange(next);
  };

  const toggleBreak = (weekday: number, hasBreak: boolean) => {
    setRow(
      weekday,
      hasBreak
        ? { break_start: DEFAULT_BREAK_START, break_end: DEFAULT_BREAK_END }
        : // Null rather than "": the API takes both or neither, and an empty
          // string would fail its TimeField rather than clearing the break.
          { break_start: null, break_end: null },
    );
  };

  return (
    <Box flexDirection="column" gap={12} width="100%">
      <Box flexDirection="column" gap={4}>
        <Typography as="h3" variant="h4">
          {t("hoursTitle")}
        </Typography>
        <Typography variant="body" color="var(--foreground)">
          {t("hoursHelp")}
        </Typography>
      </Box>

      {WEEKDAYS.map((weekday) => {
        const row = byWeekday.get(weekday);
        const hasBreak = Boolean(row?.break_start && row?.break_end);
        return (
          <Card key={weekday} gap={12} padding={12}>
            <Box alignItems="center" justifyContent="space-between" gap={12}>
              <Typography variant="body" fontWeight={600}>
                {t(`weekday${weekday}`)}
              </Typography>
              <Box alignItems="center" gap={8}>
                <Typography variant="caption" color="var(--foreground)">
                  {row ? t("open") : t("closed")}
                </Typography>
                <Switch
                  checked={Boolean(row)}
                  onChange={(checked) => toggleDay(weekday, checked)}
                  aria-label={`${t(`weekday${weekday}`)} - ${t("open")}`}
                />
              </Box>
            </Box>

            {row && (
              <>
                <Box gap={12} flexWrap="wrap">
                  <TextInput
                    label={t("opensAt")}
                    type="time"
                    value={row.opens_at}
                    onChange={(v) => setRow(weekday, { opens_at: v })}
                    flex="1"
                    minWidth={130}
                  />
                  <TextInput
                    label={t("closesAt")}
                    type="time"
                    value={row.closes_at}
                    onChange={(v) => setRow(weekday, { closes_at: v })}
                    flex="1"
                    minWidth={130}
                  />
                </Box>

                <Box alignItems="center" gap={8}>
                  <Switch
                    checked={hasBreak}
                    onChange={(checked) => toggleBreak(weekday, checked)}
                    aria-label={t("hasBreak")}
                  />
                  <Typography variant="body">{t("hasBreak")}</Typography>
                </Box>

                {hasBreak && (
                  <Box gap={12} flexWrap="wrap">
                    <TextInput
                      label={t("breakStart")}
                      type="time"
                      value={row.break_start ?? ""}
                      onChange={(v) => setRow(weekday, { break_start: v })}
                      flex="1"
                      minWidth={130}
                    />
                    <TextInput
                      label={t("breakEnd")}
                      type="time"
                      value={row.break_end ?? ""}
                      onChange={(v) => setRow(weekday, { break_end: v })}
                      flex="1"
                      minWidth={130}
                    />
                  </Box>
                )}
              </>
            )}
          </Card>
        );
      })}
    </Box>
  );
}
