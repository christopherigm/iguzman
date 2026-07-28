'use client';

import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { Button } from '@repo/ui/core-elements/button';
import { Typography } from '@repo/ui/core-elements/typography';

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

type Props = {
  value: number[];
  onChange: (months: number[]) => void;
};

/**
 * Which months a season covers.
 *
 * Not a text field holding `[9, 10, 11]`, because this is the setting that makes
 * seasons work at all: `Sighting.save()` fills a blank season by matching the
 * entry's month against these, so a typo here means every autumn entry silently
 * gets no season and the seasons section of the site stays empty. Twelve toggle
 * buttons cannot be mistyped.
 *
 * Southern-hemisphere sites simply tick different months - that is the whole
 * reason the calendar is data rather than code.
 */
export function MonthPicker({ value, onChange }: Props) {
  const t = useTranslations('Admin');
  const tMonth = useTranslations('Months');

  const toggle = (month: number) =>
    onChange(
      value.includes(month)
        ? value.filter((m) => m !== month)
        : // Kept sorted so the stored list reads as a calendar range rather than
          // in click order.
          [...value, month].sort((a, b) => a - b),
    );

  return (
    <Box flexDirection="column" gap={8} paddingBottom={8}>
      <Typography variant="label">{t('months')}</Typography>
      <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
        {t('monthsHelp')}
      </Typography>
      <Box display="flex" flexWrap="wrap" gap={8}>
        {MONTHS.map((month) => {
          const on = value.includes(month);
          return (
            <Button
              key={month}
              type="button"
              size="sm"
              kind={on ? 'primary' : undefined}
              text={tMonth(String(month))}
              onClick={() => toggle(month)}
              aria-pressed={on}
            />
          );
        })}
      </Box>
    </Box>
  );
}
