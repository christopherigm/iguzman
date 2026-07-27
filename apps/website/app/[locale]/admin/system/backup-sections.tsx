"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Switch } from "@repo/ui/core-elements/switch";
import { BACKUP_SECTIONS, type BackupSection } from "@/lib/admin-api";

/**
 * The label key each section reads its title from.
 *
 * Exported because the Backup history badges name the same sections: two copies
 * of this map is exactly how a section ends up labelled "Menu Items" in the
 * picker and "menu" in the list beside it.
 */
export const SECTION_LABELS: Record<BackupSection, string> = {
  products: "backupSectionProducts",
  services: "backupSectionServices",
  menu: "backupSectionMenu",
  system: "backupSectionSystem",
  images: "backupSectionImages",
};

interface BackupSectionSwitchesProps {
  value: BackupSection[];
  onChange: (sections: BackupSection[]) => void;
  disabled?: boolean;
  /**
   * Sections this selector may offer. Used by Restore, where an archive can only
   * be applied for what it actually contains - a section the zip lacks is shown
   * greyed rather than hidden, so the operator can see what the file is missing
   * instead of wondering where the switch went.
   */
  available?: BackupSection[];
}

/**
 * The inline switch row both Backup and Restore select their scope with.
 *
 * "All" is a control, not a section: turning it on selects every section and
 * locks the individual switches, which is what makes the common case (back up
 * everything) one tap and keeps the row from ever showing "All" on beside a
 * half-empty selection. It is derived from the selection rather than held as its
 * own state, so the two can never disagree.
 */
export function BackupSectionSwitches({
  value,
  onChange,
  disabled = false,
  available = [...BACKUP_SECTIONS],
}: BackupSectionSwitchesProps) {
  const t = useTranslations("Admin");

  const offered = BACKUP_SECTIONS.filter((s) => available.includes(s));
  const allOn = offered.length > 0 && offered.every((s) => value.includes(s));

  const toggleAll = (next: boolean) => onChange(next ? [...offered] : []);

  const toggleOne = (section: BackupSection, next: boolean) =>
    onChange(next ? [...value, section] : value.filter((s) => s !== section));

  return (
    <Box flexWrap="wrap" alignItems="center" gap={20}>
      <SwitchField
        label={t("backupSectionAll")}
        checked={allOn}
        disabled={disabled}
        onChange={toggleAll}
      />
      {BACKUP_SECTIONS.map((section) => {
        const unavailable = !available.includes(section);
        return (
          <SwitchField
            key={section}
            label={t(SECTION_LABELS[section])}
            checked={!unavailable && value.includes(section)}
            // Locked while "All" is on: the individual value is no longer the
            // operator's to set, and leaving them tappable would let a tap
            // silently contradict the All switch above.
            disabled={disabled || allOn || unavailable}
            onChange={(next) => toggleOne(section, next)}
          />
        );
      })}
    </Box>
  );
}

function SwitchField({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Box alignItems="center" gap={8}>
      <Switch
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-label={label}
      />
      <Typography
        variant="body"
        color={disabled ? "var(--muted-foreground, #6b7280)" : undefined}
      >
        {label}
      </Typography>
    </Box>
  );
}
