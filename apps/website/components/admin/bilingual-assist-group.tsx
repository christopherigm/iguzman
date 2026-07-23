"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Grid } from "@repo/ui/core-elements/grid";
import { Button } from "@repo/ui/core-elements/button";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Typography } from "@repo/ui/core-elements/typography";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { Slider } from "@repo/ui/core-elements/slider";
import { useLlmProxy } from "@repo/ui/use-llm";
import "./admin-form.css";
import {
  PARAGRAPH_WORD_COUNTS,
  PARAGRAPH_LENGTH_STEPS,
  PARAGRAPH_COUNT_STEPS,
} from "./paragraph-options";
import {
  SpeechFieldButton,
  buildEnhanceMessages,
  buildTranslateMessages,
} from "./field-assist";

/**
 * One ES/EN field pair. `esKey`/`enKey` are the `values` keys; the EN key is the
 * ES key with an `en_` prefix so the translate button knows its counterpart.
 */
export interface BilingualPair {
  esKey: string;
  enKey: string;
  /** Section header naming the pair, e.g. "Title". */
  groupLabel: string;
  /** `textarea` also gets Speech + Enhance; `text` gets Translate only. */
  type: "text" | "textarea";
  rows?: number;
}

type Props = {
  pairs: BilingualPair[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
};

/**
 * A self-contained group of bilingual (ES/EN) fields with the same LLM assist
 * the flat admin form gives paired fields: **Translate** on every field
 * (writing into its counterpart), plus **Speech** dictation and **Enhance** on
 * the multi-line ones. It owns a single LLM proxy and one Enhance-options modal
 * shared across its pairs - a distilled copy of `AdminForm`'s field flow for use
 * outside it (e.g. the System page's Spotlight section, which is a custom
 * component rather than a list of `FieldDef`s).
 *
 * Reuses the shared prompt/dictation helpers in `field-assist.tsx` and the
 * `af__*` styles in `admin-form.css`, so it reads and behaves identically to the
 * form's own fields.
 */
export function BilingualAssistGroup({ pairs, values, onChange }: Props) {
  const t = useTranslations("Admin");
  const tCommon = useTranslations("Common");

  const {
    streamingText,
    isGenerating,
    generate,
    abort,
    reset: resetLlm,
  } = useLlmProxy({ temperature: 0.7 });

  const activeOperationRef = useRef<"enhance" | "translate" | null>(null);

  const [activeEnhanceField, setActiveEnhanceField] = useState<string | null>(
    null,
  );
  const [enhancePreview, setEnhancePreview] = useState("");
  const [activeTranslateField, setActiveTranslateField] = useState<
    string | null
  >(null);
  const [translatePreview, setTranslatePreview] = useState("");

  const [showEnhanceOptions, setShowEnhanceOptions] = useState(false);
  const [pendingEnhanceField, setPendingEnhanceField] = useState<string | null>(
    null,
  );
  const [enhanceParagraphs, setEnhanceParagraphs] = useState(2);
  const [enhanceParagraphLength, setEnhanceParagraphLength] = useState("md");

  // Route streaming tokens to the correct preview.
  useEffect(() => {
    if (!streamingText) return;
    if (activeOperationRef.current === "enhance")
      setEnhancePreview(streamingText);
    else if (activeOperationRef.current === "translate")
      setTranslatePreview(streamingText);
  }, [streamingText]);

  // ES key → EN key, both directions, so translate can find each counterpart.
  const counterpart = new Map<string, string>();
  for (const pair of pairs) {
    counterpart.set(pair.esKey, pair.enKey);
    counterpart.set(pair.enKey, pair.esKey);
  }

  const llmBusy = isGenerating;
  const hasValue = (key: string) => Boolean(String(values[key] ?? "").trim());

  // ── Enhance ─────────────────────────────────────────────────────────────
  const triggerEnhance = (fieldKey: string) => {
    if (!hasValue(fieldKey)) return;
    setPendingEnhanceField(fieldKey);
    setShowEnhanceOptions(true);
  };

  const handleConfirmEnhanceOptions = async () => {
    setShowEnhanceOptions(false);
    const fieldKey = pendingEnhanceField;
    setPendingEnhanceField(null);
    if (!fieldKey || !hasValue(fieldKey)) return;

    setActiveTranslateField(null);
    setTranslatePreview("");
    setActiveEnhanceField(fieldKey);
    setEnhancePreview("");
    resetLlm();
    activeOperationRef.current = "enhance";

    await generate(
      buildEnhanceMessages(
        String(values[fieldKey] ?? "").trim(),
        fieldKey,
        enhanceParagraphs,
        enhanceParagraphLength,
      ),
    );
  };

  const handleAcceptEnhance = () => {
    if (activeEnhanceField && enhancePreview)
      onChange(activeEnhanceField, enhancePreview);
    setActiveEnhanceField(null);
    setEnhancePreview("");
    activeOperationRef.current = null;
    resetLlm();
  };

  const handleDiscardEnhance = () => {
    if (isGenerating) abort();
    setActiveEnhanceField(null);
    setEnhancePreview("");
    activeOperationRef.current = null;
    resetLlm();
  };

  // ── Translate ───────────────────────────────────────────────────────────
  const triggerTranslate = async (fieldKey: string) => {
    if (!hasValue(fieldKey)) return;
    setActiveEnhanceField(null);
    setEnhancePreview("");
    setActiveTranslateField(fieldKey);
    setTranslatePreview("");
    resetLlm();
    activeOperationRef.current = "translate";
    await generate(
      buildTranslateMessages(String(values[fieldKey] ?? "").trim(), fieldKey),
    );
  };

  const handleAcceptTranslate = () => {
    if (activeTranslateField && translatePreview) {
      const targetKey = counterpart.get(activeTranslateField);
      if (targetKey) onChange(targetKey, translatePreview);
    }
    setActiveTranslateField(null);
    setTranslatePreview("");
    activeOperationRef.current = null;
    resetLlm();
  };

  const handleDiscardTranslate = () => {
    if (isGenerating) abort();
    setActiveTranslateField(null);
    setTranslatePreview("");
    activeOperationRef.current = null;
    resetLlm();
  };

  const currentLengthWordRange = PARAGRAPH_WORD_COUNTS[
    enhanceParagraphLength
  ] ?? { min: 80, max: 120 };

  const assistBtnClass = (fieldKey: string, active: boolean) =>
    [
      "af__enhance-btn",
      llmBusy || !hasValue(fieldKey) ? "af__enhance-btn--busy" : "",
      active ? "af__enhance-btn--active" : "",
    ]
      .filter(Boolean)
      .join(" ");

  const renderField = (
    pair: BilingualPair,
    fieldKey: string,
    isEnglish: boolean,
  ) => {
    const isTextarea = pair.type === "textarea";
    return (
      <Box flexDirection="column" gap={6}>
        {/* Label row - the field's language plus its assist buttons. */}
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          minHeight={24}
          marginBottom={4}
        >
          <label className="af__label" htmlFor={`field-${fieldKey}`}>
            {isEnglish ? t("langEnglish") : t("langSpanish")}
          </label>
          <Box display="flex" alignItems="center" gap={12}>
            {isTextarea && (
              <SpeechFieldButton
                fieldKey={fieldKey}
                getFieldValue={() => String(values[fieldKey] ?? "")}
                onChange={onChange}
              />
            )}
            {isTextarea && (
              <Button
                unstyled
                icon="/icons/enhance.svg"
                iconSize="16px"
                iconColor={
                  activeEnhanceField === fieldKey
                    ? "var(--accent, #06b6d4)"
                    : "var(--foreground, #171717)"
                }
                disabled={llmBusy || !hasValue(fieldKey)}
                onClick={() => triggerEnhance(fieldKey)}
                aria-label={t("enhanceLabel")}
                title={t("enhanceLabel")}
                className={assistBtnClass(
                  fieldKey,
                  activeEnhanceField === fieldKey,
                )}
              />
            )}
            <Button
              unstyled
              icon="/icons/translate.svg"
              iconSize="16px"
              iconColor={
                activeTranslateField === fieldKey
                  ? "var(--accent, #06b6d4)"
                  : "var(--foreground, #171717)"
              }
              disabled={llmBusy || !hasValue(fieldKey)}
              onClick={() => triggerTranslate(fieldKey)}
              aria-label={t("translateLabel")}
              title={t("translateLabel")}
              className={assistBtnClass(
                fieldKey,
                activeTranslateField === fieldKey,
              )}
            />
          </Box>
        </Box>

        <TextInput
          id={`field-${fieldKey}`}
          value={String(values[fieldKey] ?? "")}
          onChange={(v) => onChange(fieldKey, v)}
          multirow={isTextarea}
          rows={isTextarea ? (pair.rows ?? 5) : undefined}
        />

        {/* Enhance preview */}
        {isTextarea && activeEnhanceField === fieldKey && (
          <Box
            flexDirection="column"
            gap={10}
            padding="12px 14px"
            borderRadius={8}
            border="1px solid color-mix(in srgb, var(--accent, #06b6d4) 30%, transparent)"
            backgroundColor="color-mix(in srgb, var(--accent, #06b6d4) 5%, transparent)"
          >
            <Typography variant="body">{enhancePreview || "…"}</Typography>
            <Box display="flex" gap={8} alignItems="center" marginTop={12}>
              {isGenerating ? (
                <Button
                  text={t("enhanceStop")}
                  onClick={handleDiscardEnhance}
                  size="md"
                  kind="error"
                />
              ) : (
                <>
                  <Button
                    text={t("enhanceDiscard")}
                    onClick={handleDiscardEnhance}
                    size="md"
                  />
                  <Button
                    text={t("enhanceAccept")}
                    onClick={handleAcceptEnhance}
                    size="md"
                    kind="primary"
                  />
                </>
              )}
            </Box>
          </Box>
        )}

        {/* Translate preview */}
        {activeTranslateField === fieldKey && (
          <Box
            flexDirection="column"
            gap={10}
            padding="12px 14px"
            borderRadius={8}
            border="1px solid color-mix(in srgb, var(--foreground) 15%, transparent)"
            backgroundColor="color-mix(in srgb, var(--foreground) 3%, transparent)"
          >
            <Typography variant="body">{translatePreview || "…"}</Typography>
            <Box display="flex" gap={8} alignItems="center" marginTop={12}>
              {isGenerating ? (
                <Button
                  text={t("enhanceStop")}
                  onClick={handleDiscardTranslate}
                  size="md"
                />
              ) : (
                <>
                  <Button
                    text={t("enhanceDiscard")}
                    onClick={handleDiscardTranslate}
                    size="md"
                  />
                  <Button
                    text={t("enhanceAccept")}
                    onClick={handleAcceptTranslate}
                    size="md"
                    kind="primary"
                  />
                </>
              )}
            </Box>
          </Box>
        )}
      </Box>
    );
  };

  return (
    <>
      <Box flexDirection="column" gap={16}>
        {pairs.map((pair) => (
          <Box key={pair.esKey} flexDirection="column" gap={8}>
            <Typography
              variant="label"
              fontWeight={700}
              color="var(--foreground)"
              styles={{ letterSpacing: "0.04em", textTransform: "uppercase" }}
            >
              {pair.groupLabel}
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                {renderField(pair, pair.esKey, false)}
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                {renderField(pair, pair.enKey, true)}
              </Grid>
            </Grid>
          </Box>
        ))}
      </Box>

      {showEnhanceOptions && (
        <ConfirmationModal
          title={t("enhanceOptionsTitle")}
          text={t("enhanceOptionsText")}
          okCallback={handleConfirmEnhanceOptions}
          cancelCallback={() => {
            setShowEnhanceOptions(false);
            setPendingEnhanceField(null);
          }}
          okLabel={tCommon("ok")}
          cancelLabel={tCommon("cancel")}
        >
          <div className="af__enhance-options">
            <Slider
              steps={PARAGRAPH_COUNT_STEPS}
              value={enhanceParagraphs}
              onChange={(v) => setEnhanceParagraphs(Number(v))}
              label={t("enhanceParagraphsLabel")}
            />
            <Slider
              steps={PARAGRAPH_LENGTH_STEPS}
              value={enhanceParagraphLength}
              onChange={(v) => setEnhanceParagraphLength(String(v))}
              label={`${t("enhanceLengthLabel")} (${currentLengthWordRange.min}-${currentLengthWordRange.max} words/para)`}
            />
          </div>
        </ConfirmationModal>
      )}
    </>
  );
}
