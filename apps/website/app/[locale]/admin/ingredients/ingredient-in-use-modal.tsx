"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import type { IngredientDeleteMode, IngredientUsage } from "@/lib/admin-api";

/**
 * What to do about the dishes still using an ingredient the admin asked to
 * delete.
 *
 * A shared `Ingredient` is PROTECTed by every `MenuItemIngredient` row pointing
 * at it, so the API refuses the delete and answers with the list of those rows.
 * Rather than leave the admin to go and unpick each dish by hand, this puts the
 * two possible answers in front of them:
 *
 *  - **detach** - keep the dishes, remove only this ingredient. A choice group
 *    whose *default* it is survives by promoting its first alternative; one with
 *    no alternative left to promote goes with it, which is why the affected rows
 *    are listed rather than just counted.
 *  - **groups** - delete the whole choice group each usage belongs to.
 *
 * ⚠ The choice is only offered when at least one usage is a group. With nothing
 * but plain rows the two answers are the same action, and a picker whose options
 * do the same thing reads as a trick question.
 */
export function IngredientInUseModal({
  usages,
  busy,
  onConfirm,
  onCancel,
}: {
  usages: IngredientUsage[];
  busy: boolean;
  onConfirm: (mode: IngredientDeleteMode) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Admin");
  const tCommon = useTranslations("Common");
  const [mode, setMode] = useState<IngredientDeleteMode>("detach");

  const hasGroups = usages.some((u) => u.role !== "plain");

  return (
    <ConfirmationModal
      title={t("ingredientInUseTitle")}
      text={t("ingredientInUseText", { count: usages.length })}
      panelMaxWidth="520px"
      okLabel={t("delete")}
      cancelLabel={tCommon("cancel")}
      okDisabled={busy}
      okCallback={() => onConfirm(hasGroups ? mode : "detach")}
      cancelCallback={onCancel}
    >
      <Box flexDirection="column" gap={6} marginBottom={hasGroups ? 16 : 0}>
        {usages.map((usage) => (
          <UsageLine
            key={`${usage.role}-${usage.menu_item_ingredient}`}
            usage={usage}
          />
        ))}
      </Box>

      {hasGroups && (
        <Box flexDirection="column" gap={8}>
          <ModeChoice
            selected={mode === "detach"}
            label={t("ingredientDeleteDetach")}
            hint={t("ingredientDeleteDetachHint")}
            onSelect={() => setMode("detach")}
          />
          <ModeChoice
            selected={mode === "groups"}
            label={t("ingredientDeleteGroups")}
            hint={t("ingredientDeleteGroupsHint")}
            onSelect={() => setMode("groups")}
          />
        </Box>
      )}
    </ConfirmationModal>
  );
}

/** One blocking row, named by its dish and by the part the ingredient plays. */
function UsageLine({ usage }: { usage: IngredientUsage }) {
  const t = useTranslations("Admin");
  const item = usage.menu_item_name ?? `#${usage.menu_item}`;
  const group = usage.group_name ?? t("ingredientUsageUnnamedGroup");

  let text: string;
  if (usage.role === "plain") {
    text = t("ingredientUsagePlain", { item });
  } else if (usage.role === "group_option") {
    text = t("ingredientUsageGroupOption", { item, group });
  } else {
    text = usage.can_promote
      ? t("ingredientUsageGroupDefault", { item, group })
      : t("ingredientUsageGroupOnly", { item, group });
  }

  return (
    <Typography as="p" variant="body" margin={0}>
      {text}
    </Typography>
  );
}

/** One of the two answers, as a selectable full-width button with its own hint. */
function ModeChoice({
  selected,
  label,
  hint,
  onSelect,
}: {
  selected: boolean;
  label: string;
  hint: string;
  onSelect: () => void;
}) {
  return (
    <Box flexDirection="column" gap={4}>
      <Button
        text={label}
        onClick={onSelect}
        kind={selected ? "primary" : undefined}
        size="md"
        aria-pressed={selected}
        width="100%"
      />
      <Typography as="p" variant="caption" margin={0}>
        {hint}
      </Typography>
    </Box>
  );
}
