"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Typography } from "@repo/ui/core-elements/typography";
import { useLlmProxy } from "@repo/ui/use-llm";
import { buildTranslateMessages } from "./field-assist";

/** What a translation writes back: only the language it produced. */
export interface BilingualNamePatch {
  es?: string;
  en?: string;
}

interface Props {
  /** The two field labels, already resolved by the caller. */
  esLabel: string;
  enLabel: string;
  esValue: string;
  enValue: string;
  onChange: (patch: BilingualNamePatch) => void;
  /** Marks the Spanish field required, as the API's own column is. */
  required?: boolean;
}

/**
 * One short ES/EN name pair with a per-field AI translate button.
 *
 * A self-contained slice of `admin-form.tsx`'s translate flow for a *row* rather
 * than a form field: each field's button streams a translation of its own value
 * into a preview, which the operator accepts into the **other** language or
 * discards. Each instance owns its own `useLlmProxy`, so a page holding several
 * of them (a ladder of reward tiers, a list of ingredient choice groups) can
 * translate one row while another is still streaming.
 *
 * It is deliberately **not** `BilingualAssistGroup`: that one edits a form's
 * `values` by key and adds Speech + Enhance for multi-line copy. These are one
 * row's own strings - a tier name, a choice-group label - where a key does not
 * exist and there is nothing to enhance about two words.
 *
 * ⚠ The prompts come from `field-assist.tsx`'s shared `buildTranslateMessages`,
 * which decides direction from an `en_` prefix - hence the synthetic keys below.
 * `menu-ingredients-editor.tsx` used to carry its own copy of those prompts
 * because `group_en_name` does not start with `en_`; don't reintroduce one.
 */
export function BilingualNameFields({
  esLabel,
  enLabel,
  esValue,
  enValue,
  onChange,
  required = false,
}: Props) {
  const t = useTranslations("Admin");
  // `streamingText` is the live preview (it holds the full translation once the
  // stream ends, and `reset`/`abort` clear it), so no mirrored state is needed.
  const { streamingText, isGenerating, generate, abort, reset } = useLlmProxy({
    temperature: 0.3,
  });
  // Which field is being translated - the *source*, so the result lands in the
  // other one.
  const [active, setActive] = useState<"es" | "en" | null>(null);

  const translate = async (source: "es" | "en") => {
    const text = (source === "es" ? esValue : enValue).trim();
    if (!text) return;
    setActive(source);
    reset();
    await generate(buildTranslateMessages(text, source === "en" ? "en_" : ""));
  };

  const accept = () => {
    if (active && streamingText) {
      onChange(active === "es" ? { en: streamingText } : { es: streamingText });
    }
    setActive(null);
    reset();
  };

  const discard = () => {
    if (isGenerating) abort();
    setActive(null);
    reset();
  };

  const field = (source: "es" | "en") => {
    const value = source === "es" ? esValue : enValue;
    return (
      <Box display="flex" flexDirection="column" gap="6px">
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          gap="4px"
          minHeight={24}
        >
          <Typography variant="label" color="var(--foreground)">
            {source === "es" ? esLabel : enLabel}
          </Typography>
          <Button
            icon="/icons/translate.svg"
            iconSize="16px"
            iconColor={
              active === source
                ? "var(--accent-text, #06b6d4)"
                : "var(--foreground, #171717)"
            }
            disabled={isGenerating || !value.trim()}
            onClick={() => translate(source)}
            aria-label={t("translateLabel")}
            title={t("translateLabel")}
            type="button"
          />
        </Box>
        <TextInput
          value={value}
          onChange={(v) => onChange(source === "es" ? { es: v } : { en: v })}
          aria-label={source === "es" ? esLabel : enLabel}
          required={source === "es" && required}
          minWidth={0}
        />
      </Box>
    );
  };

  return (
    <Box display="flex" flexDirection="column" gap="10px" width="100%">
      <Box
        display="grid"
        gap="10px"
        alignItems="start"
        styles={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}
      >
        {field("es")}
        {field("en")}
      </Box>

      {/* Translate preview: accept writes it into the other language, discard
          (or stop, mid-stream) drops it. */}
      {active && (
        <Box
          display="flex"
          flexDirection="column"
          gap="10px"
          padding="12px 14px"
          borderRadius={8}
          border="1px solid var(--border, #e5e7eb)"
          backgroundColor="var(--surface-2)"
        >
          <Typography variant="body" margin={0}>
            {streamingText || "…"}
          </Typography>
          <Box display="flex" alignItems="center" gap="8px">
            {isGenerating ? (
              <Button
                text={t("enhanceStop")}
                onClick={discard}
                size="sm"
                type="button"
              />
            ) : (
              <>
                <Button
                  text={t("enhanceDiscard")}
                  onClick={discard}
                  size="sm"
                  type="button"
                />
                <Button
                  text={t("enhanceAccept")}
                  onClick={accept}
                  kind="primary"
                  size="sm"
                  type="button"
                />
              </>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}
