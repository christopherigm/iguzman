"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import { TextInput } from "@repo/ui/core-elements/text-input";

export interface RecipeStepRow {
  key: string;
  instruction: string;
  en_instruction: string;
}

export interface RecipeValue {
  recipe_notes: string;
  prep_time_minutes: string;
  cook_time_minutes: string;
  servings: string;
  steps: RecipeStepRow[];
}

let stepCounter = 0;
export function newRecipeStep(): RecipeStepRow {
  stepCounter += 1;
  return {
    key: `step-${Date.now()}-${stepCounter}`,
    instruction: "",
    en_instruction: "",
  };
}

interface Props {
  value: RecipeValue;
  onChange: (value: RecipeValue) => void;
}

/**
 * Editor for a menu item's INTERNAL recipe: prep metadata plus ordered steps.
 *
 * This never renders on the storefront - it maps to the admin-only
 * `/menu-items/<id>/recipe/` endpoint, which the parent page PUTs as one whole
 * replacement on save.
 */
export function MenuRecipeEditor({ value, onChange }: Props) {
  const t = useTranslations("Admin");

  const set = (patch: Partial<RecipeValue>) => onChange({ ...value, ...patch });

  const updateStep = (key: string, patch: Partial<RecipeStepRow>) =>
    set({
      steps: value.steps.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    });

  const removeStep = (key: string) =>
    set({ steps: value.steps.filter((s) => s.key !== key) });

  const move = (index: number, delta: number) => {
    const next = [...value.steps];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const [moved] = next.splice(index, 1);
    if (moved) next.splice(target, 0, moved);
    set({ steps: next });
  };

  const addStep = () => set({ steps: [...value.steps, newRecipeStep()] });

  return (
    <Box display="flex" flexDirection="column" gap="12px">
      <Typography variant="label">{t("recipe")}</Typography>
      <Typography variant="caption" color="var(--muted, #6b7280)">
        {t("recipeHint")}
      </Typography>

      <Box
        display="grid"
        gap="10px"
        styles={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}
      >
        <TextInput
          label={t("prepTime")}
          format="number"
          value={value.prep_time_minutes}
          onChange={(v) => set({ prep_time_minutes: v })}
        />
        <TextInput
          label={t("cookTime")}
          format="number"
          value={value.cook_time_minutes}
          onChange={(v) => set({ cook_time_minutes: v })}
        />
        <TextInput
          label={t("servings")}
          format="number"
          value={value.servings}
          onChange={(v) => set({ servings: v })}
        />
      </Box>

      <TextInput
        label={t("recipeNotes")}
        multirow
        rows={3}
        value={value.recipe_notes}
        onChange={(v) => set({ recipe_notes: v })}
      />

      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        gap="12px"
      >
        <Typography variant="caption" color="var(--muted, #6b7280)">
          {t("steps")}
        </Typography>
        <Button
          text={t("addStep")}
          kind="primary"
          size="sm"
          onClick={addStep}
          type="button"
        />
      </Box>

      {value.steps.map((step, index) => (
        <Box
          key={step.key}
          padding="12px"
          borderRadius="10px"
          border="1px solid var(--border, #e5e7eb)"
          backgroundColor="var(--surface-2, #f9fafb)"
          display="flex"
          flexDirection="column"
          gap="8px"
        >
          <Box display="flex" alignItems="center" gap="8px">
            <Typography variant="label">{`${t("step")} ${index + 1}`}</Typography>
            <Box display="flex" alignItems="center" gap="4px" marginLeft="auto">
              <Button
                text="↑"
                unstyled
                size="sm"
                onClick={() => move(index, -1)}
                type="button"
                aria-label={t("moveUp")}
                styles={{ cursor: "pointer", padding: "2px 8px" }}
              />
              <Button
                text="↓"
                unstyled
                size="sm"
                onClick={() => move(index, 1)}
                type="button"
                aria-label={t("moveDown")}
                styles={{ cursor: "pointer", padding: "2px 8px" }}
              />
              <Button
                text={t("remove")}
                unstyled
                size="sm"
                onClick={() => removeStep(step.key)}
                type="button"
                styles={{ color: "var(--danger, #e53935)", cursor: "pointer" }}
              />
            </Box>
          </Box>
          <TextInput
            label={t("instruction")}
            multirow
            rows={2}
            value={step.instruction}
            onChange={(v) => updateStep(step.key, { instruction: v })}
          />
          <TextInput
            label="Instruction (EN)"
            multirow
            rows={2}
            value={step.en_instruction}
            onChange={(v) => updateStep(step.key, { en_instruction: v })}
          />
        </Box>
      ))}
    </Box>
  );
}
