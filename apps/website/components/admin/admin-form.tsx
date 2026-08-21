"use client";

import { useRef, useState, useEffect, useMemo, Fragment } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@repo/i18n/navigation";
import "./admin-form.css";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Select } from "@repo/ui/core-elements/select";
import { Switch } from "@repo/ui/core-elements/switch";
import { Toast } from "@repo/ui/core-elements/toast";
import { useLlmProxy } from "@repo/ui/use-llm";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { Slider } from "@repo/ui/core-elements/slider";
import {
  PARAGRAPH_WORD_COUNTS,
  PARAGRAPH_LENGTH_STEPS,
  PARAGRAPH_COUNT_STEPS,
} from "./paragraph-options";
import { buildEnhanceMessages, buildTranslateMessages } from "./field-assist";
import { SiblingArrow } from "./sibling-arrows";
import type { AdminSiblings } from "@/hooks/use-admin-siblings";

// ── Pair group label ───────────────────────────────────────────────────────

function deriveGroupLabel(label: string): string {
  return label
    .replace(/\s*\(ES\)\s*$/i, "")
    .replace(/\s*\(Español\)\s*$/i, "")
    .trim();
}

// ── Clone name suffixes ────────────────────────────────────────────────────
//
// Appended to the pre-filled names in the clone dialog. These are *content*
// language, not UI language: `name` is the record's Spanish name and `en_name`
// its English one, whichever locale the operator has the CMS in. Translating
// them with `t()` would put "(copy)" on a Spanish name for an English-speaking
// operator.

const CLONE_SUFFIX_ES = " (copia)";
const CLONE_SUFFIX_EN = " (copy)";

// ── Top toggles ────────────────────────────────────────────────────────────

// Status flags that belong above the form rather than buried at the bottom,
// in this display order. Any other boolean field renders in place.
const TOP_TOGGLE_KEYS = ["is_available", "is_featured", "enabled", "in_stock"];

// ── FieldDef / AdminFormProps ──────────────────────────────────────────────

export interface FieldDef {
  key: string;
  label: string;
  type?:
    | "text"
    | "textarea"
    | "boolean"
    | "number"
    | "url"
    | "select"
    | "color"
    | "slug"
    /**
     * A native `<input type="datetime-local">`, whose value is **local wall clock
     * with no zone** (`YYYY-MM-DDTHH:mm`).
     *
     * ⚠ That is the whole point and the whole trap. The author types "7pm", which
     * means 7pm *where the thing happens* - not 7pm where the author is sitting,
     * and not 7pm UTC. So a form using this owns the conversion to an instant
     * against whatever zone the record carries; feeding the raw value to
     * `new Date()` resolves it in the **browser's** zone, which is wrong for every
     * author who is not in the same country as the record.
     * `lib/event-shared.ts`'s `wallClockToInstant` / `instantToWallClock` are that
     * conversion for events.
     */
    | "datetime"
    /**
     * A write-only secret (an API key). Masked as you type, and - because the
     * API never sends one back - always loads blank: an empty value means
     * "leave unchanged", so the form must omit it from the payload rather than
     * submit "" and wipe the stored secret.
     */
    | "password";
  options?: { value: string | number; label: string }[];
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  fieldError?: string | null;
  /**
   * A line of guidance under the input, for a field whose *blank* state means
   * something non-obvious - a points award that inherits its category, say. It
   * is passed straight to `TextInput`'s own `helperText`, which `fieldError`
   * replaces when there is an error to show instead.
   */
  helperText?: string;
  onBlur?: () => void;
  /** Optional override for the pair-group section header label. */
  groupLabel?: string;
}

interface AdminFormProps {
  title: string;
  /**
   * Spanish name of the record being edited. When set, it replaces `title` with
   * "Editing <name>". Leave undefined for new records and for forms that don't
   * edit a named record (system settings).
   */
  editingName?: string;
  fields: FieldDef[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  hideCancel?: boolean;
  /**
   * Renders the form as a block inside a page that owns its chrome: no header
   * row (neither `title` nor any button) and no fixed bottom action bar, leaving
   * just the progress bar, the toasts and the fields. For a form that is only
   * part of its page - /admin/highlights embeds one in its list, whose header
   * carries the title and the Save button beside "+ New". The caller then owns
   * the only entry point to `onSubmit`.
   */
  embedded?: boolean;
  /**
   * True when the form edits an existing record rather than creating one. It
   * only changes the top-left escape hatch's wording - "Cancel" abandons a new
   * record, but on a saved one there is nothing to cancel, so it reads "Back".
   */
  isEditing?: boolean;
  /**
   * Deep-copy this record under a new name. When set (and `isEditing`), a
   * "Clone" button appears beside Back and opens a dialog pre-filled with the
   * record's names plus a "(copy)" suffix.
   *
   * The handler is expected to create the copy and navigate to it; it may throw,
   * in which case the dialog stays open and reports the failure.
   */
  onClone?: (names: { name: string; en_name: string }) => Promise<void> | void;
  saving?: boolean;
  /**
   * True while the record's own data is still being fetched.
   *
   * The form renders anyway: every button in the header and in the fixed action
   * bar is on screen from the first paint, disabled, rather than appearing
   * under the operator's cursor once the fetch lands. The fields are disabled
   * with them, so nothing typed into a default value is silently overwritten
   * when the record arrives.
   */
  loading?: boolean;
  error?: string | null;
  success?: string | null;
  /**
   * Public production URL for the record being edited, locale-agnostic and
   * root-relative (e.g. `/products/some-slug`). When set, the fixed action bar
   * shows a "view in production" button that opens it.
   *
   * Three states, because the button must not come and go while a record
   * loads:
   *
   * - `undefined` - this record has no public page (a new record, or a form
   *   that edits something the storefront never shows). No button at all.
   * - `null` - it has one, but its address isn't known yet (the slug arrives
   *   with the fetch). The button renders **disabled**, so the bar keeps its
   *   shape from the first paint.
   * - a string - the live address.
   */
  productionHref?: string | null;
  /**
   * The records either side of this one in the CMS list, from
   * `useAdminSiblings`. When set, the fixed action bar flanks Save with a prev
   * and a next arrow, so a run of records can be worked through without going
   * back to the table. Each arrow is disabled at its end of the list - and both
   * are while the list is still loading, or on a record the list does not carry.
   *
   * Leave undefined for a new record and for a form that edits a singleton
   * (system settings), which has no list to walk.
   */
  siblings?: AdminSiblings;
  /**
   * Image uploaders, rendered directly below the record's name (and its EN
   * counterpart, when paired) rather than at the bottom with `children` - they
   * are central to the record and shouldn't sit behind a scroll of text fields.
   */
  imagesSlot?: React.ReactNode;
  /**
   * Self-contained blocks to render inside the field flow, each immediately
   * above the row for `beforeKey` and spanning the full grid width.
   *
   * For a group of fields that is its own subject (payment credentials, say):
   * it can own its heading, its instructions and its inputs in one component
   * and still sit where it belongs among the fields, rather than being exiled
   * to the bottom with `children`.
   */
  slots?: { beforeKey: string; node: React.ReactNode }[];
  children?: React.ReactNode;
}

// ── AdminForm ──────────────────────────────────────────────────────────────

export function AdminForm({
  title,
  editingName,
  fields,
  values,
  onChange,
  onSubmit,
  onCancel,
  hideCancel,
  embedded,
  isEditing,
  onClone,
  saving,
  loading,
  error,
  success,
  productionHref,
  siblings,
  imagesSlot,
  slots,
  children,
}: AdminFormProps) {
  const t = useTranslations("Admin");
  const tCommon = useTranslations("Common");
  const router = useRouter();

  // ── LLM ───────────────────────────────────────────────────────────────────
  // The provider is website-api's call (Groq, falling back to OpenRouter), so
  // there is nothing to choose here. No auth headers either: the proxy route
  // authenticates the caller from the HTTP-only cookie the browser sends anyway.
  const {
    streamingText,
    isGenerating,
    generate,
    abort,
    reset: resetLlm,
  } = useLlmProxy({ temperature: 0.7 });

  // Tracks which operation ('enhance' | 'translate') is currently streaming.
  const activeOperationRef = useRef<"enhance" | "translate" | null>(null);

  // ── Enhance state ─────────────────────────────────────────────────────────
  const [activeEnhanceField, setActiveEnhanceField] = useState<string | null>(
    null,
  );
  const [enhancePreview, setEnhancePreview] = useState("");

  // ── Translate state ───────────────────────────────────────────────────────
  const [activeTranslateField, setActiveTranslateField] = useState<
    string | null
  >(null);
  const [translatePreview, setTranslatePreview] = useState("");

  // ── Clone dialog state ────────────────────────────────────────────────────
  const [showClone, setShowClone] = useState(false);
  const [cloneName, setCloneName] = useState("");
  const [cloneEnName, setCloneEnName] = useState("");
  const [cloning, setCloning] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);

  // ── Enhance options modal state ───────────────────────────────────────────
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

  // ── Top toggles pulled out of the field flow ──────────────────────────────
  const [topToggles, bodyFields] = useMemo(() => {
    const top = TOP_TOGGLE_KEYS.map((key) =>
      fields.find((f) => f.key === key && f.type === "boolean"),
    ).filter((f): f is FieldDef => Boolean(f));
    const topKeys = new Set(top.map((f) => f.key));
    return [top, fields.filter((f) => !topKeys.has(f.key))];
  }, [fields]);

  // ── Slots, by the field key each renders above ────────────────────────────
  const slotMap = useMemo(
    () => new Map((slots ?? []).map((s) => [s.beforeKey, s.node])),
    [slots],
  );

  // ── Pair map: key → paired key (bidirectional) ────────────────────────────
  const pairMap = useMemo(() => {
    const map = new Map<string, string>();
    const fieldKeys = new Set(fields.map((f) => f.key));
    fields.forEach((f) => {
      if (f.key.startsWith("en_")) {
        const esKey = f.key.slice(3);
        if (fieldKeys.has(esKey)) {
          map.set(f.key, esKey);
          map.set(esKey, f.key);
        }
      }
    });
    return map;
  }, [fields]);

  // ── Where the images slot goes ────────────────────────────────────────────
  // Directly below the record's name - which is the first field, plus its EN
  // counterpart when the name is a paired field, so the images never split the
  // ES/EN pair.
  const imagesSlotIndex = useMemo(() => {
    const first = bodyFields[0];
    if (!first) return -1;
    const pairedKey = pairMap.get(first.key);
    const pairedIndex = pairedKey
      ? bodyFields.findIndex((f) => f.key === pairedKey)
      : -1;
    return Math.max(0, pairedIndex);
  }, [bodyFields, pairMap]);

  // A field gets a translate button when it's in a pair and is a text-like type.
  const isTranslatable = (field: FieldDef) =>
    pairMap.has(field.key) &&
    field.type !== "boolean" &&
    field.type !== "select" &&
    field.type !== "color";

  // Show the group header before the ES field of each pair.
  const needsGroupHeader = (field: FieldDef) =>
    pairMap.has(field.key) && !field.key.startsWith("en_");

  // A paired field sits under a group header that already names it, so it only
  // needs to say which language it holds.
  const fieldLabelText = (field: FieldDef) => {
    if (!pairMap.has(field.key)) return field.label;
    return field.key.startsWith("en_") ? t("langEnglish") : t("langSpanish");
  };

  // Textareas take the full row, except a paired ES/EN one, which drops to a
  // single column at md so both languages sit side by side.
  const fieldSpanClass = (field: FieldDef) => {
    if (field.type !== "textarea") return undefined;
    return pairMap.has(field.key) ? "af__field--pair" : "af__field--full";
  };

  // ── Enhance handlers ──────────────────────────────────────────────────────

  const triggerEnhance = (fieldKey: string) => {
    const currentValue = String(values[fieldKey] ?? "").trim();
    if (!currentValue) return;
    setPendingEnhanceField(fieldKey);
    setShowEnhanceOptions(true);
  };

  const handleConfirmEnhanceOptions = async () => {
    setShowEnhanceOptions(false);
    const fieldKey = pendingEnhanceField;
    setPendingEnhanceField(null);
    if (!fieldKey) return;

    const currentValue = String(values[fieldKey] ?? "").trim();
    if (!currentValue) return;

    // Clear any open translate preview.
    setActiveTranslateField(null);
    setTranslatePreview("");

    setActiveEnhanceField(fieldKey);
    setEnhancePreview("");
    resetLlm();
    activeOperationRef.current = "enhance";

    const messages = buildEnhanceMessages(
      currentValue,
      fieldKey,
      enhanceParagraphs,
      enhanceParagraphLength,
    );
    await generate(messages);
  };

  const handleCancelEnhanceOptions = () => {
    setShowEnhanceOptions(false);
    setPendingEnhanceField(null);
  };

  const handleAcceptEnhance = () => {
    if (activeEnhanceField && enhancePreview) {
      onChange(activeEnhanceField, enhancePreview);
    }
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

  // ── Translate handlers ────────────────────────────────────────────────────

  const triggerTranslate = async (fieldKey: string) => {
    const currentValue = String(values[fieldKey] ?? "").trim();
    if (!currentValue) return;

    // Clear any open enhance preview.
    setActiveEnhanceField(null);
    setEnhancePreview("");

    setActiveTranslateField(fieldKey);
    setTranslatePreview("");
    resetLlm();
    activeOperationRef.current = "translate";

    const messages = buildTranslateMessages(currentValue, fieldKey);
    await generate(messages);
  };

  const handleAcceptTranslate = () => {
    if (activeTranslateField && translatePreview) {
      const targetKey = pairMap.get(activeTranslateField);
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

  // ── Clone handlers ────────────────────────────────────────────────────────

  // Seed the inputs when the dialog opens rather than in an effect, so they
  // track the record the operator is looking at without a render-phase sync.
  const openClone = () => {
    const name = String(values.name ?? "").trim();
    const enName = String(values.en_name ?? "").trim();
    setCloneName(name ? `${name}${CLONE_SUFFIX_ES}` : "");
    setCloneEnName(enName ? `${enName}${CLONE_SUFFIX_EN}` : "");
    setCloneError(null);
    setShowClone(true);
  };

  const handleConfirmClone = async () => {
    if (!onClone || cloning) return;
    const name = cloneName.trim();
    if (!name) return;
    setCloning(true);
    setCloneError(null);
    try {
      await onClone({ name, en_name: cloneEnName.trim() });
      setShowClone(false);
    } catch {
      // Stay open: the operator's typed names are still in the inputs, so a
      // retry costs one click rather than re-entering both.
      setCloneError(t("cloneError"));
    } finally {
      setCloning(false);
    }
  };

  const handleCancelClone = () => {
    if (cloning) return;
    setShowClone(false);
    setCloneError(null);
  };

  // ── Form submit ───────────────────────────────────────────────────────────

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  // Blocks both enhance and translate buttons while any generation is running.
  const llmBusy = isGenerating;

  const currentLengthWordRange = PARAGRAPH_WORD_COUNTS[
    enhanceParagraphLength
  ] ?? { min: 80, max: 120 };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* paddingBottom clears the fixed Save button so trailing content
          (e.g. the recipe editor's "Add Step" button) is never hidden under it -
          there is no bar to clear when the page owns the actions itself. */}
      <Box
        flexDirection="column"
        gap={20}
        marginBottom={embedded ? 0 : 40}
        paddingBottom={embedded ? 0 : 96}
      >
        {!embedded && (
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            gap={16}
          >
            <Typography as="h1" variant="h3" margin={0}>
              {editingName?.trim()
                ? t("editingItem", { name: editingName.trim() })
                : title}
            </Typography>
            <Box display="flex" alignItems="center" gap={8}>
              {!hideCancel && (
                <Button
                  text={isEditing ? t("back") : t("cancel")}
                  onClick={onCancel ?? (() => router.back())}
                  size="md"
                />
              )}
              {isEditing && onClone && (
                <Button
                  text={t("clone")}
                  icon="/icons/copy.svg"
                  onClick={openClone}
                  disabled={loading}
                  size="md"
                  kind="warning"
                />
              )}
              <Button
                text={saving ? t("saving") : t("save")}
                onClick={onSubmit}
                disabled={saving || loading}
                kind="primary"
                size="md"
              />
            </Box>
          </Box>
        )}

        {/* Save progress - and, on the way in, the record's own load. Both are
            the same thing to the operator: the form is busy and its buttons
            are inert. */}
        {(saving || loading) && <ProgressBar />}

        {error && <Toast message={error} variant="error" />}
        {success && (
          <Toast message={success} variant="success" position="top-center" />
        )}

        <form
          className="af__form"
          onSubmit={handleSubmit}
          noValidate
          aria-busy={loading || undefined}
        >
          {/* ⚠ One `disabled` fieldset, rather than a `disabled` prop threaded
              through every field type and every editor passed as `children`:
              it is the one thing in HTML that disables a whole subtree of
              controls, sub-editors included. The action bar below is
              deliberately outside it - its buttons decide for themselves. */}
          <fieldset className="af__fieldset" disabled={loading}>
            <Box className="af__grid">
              {/* ── Status toggles, above every field ── */}
              {topToggles.length > 0 && (
                <Box
                  className="af__field--full"
                  display="flex"
                  alignItems="center"
                  flexWrap="wrap"
                  gap={24}
                  paddingBottom={16}
                  styles={{
                    borderBottom:
                      "1px solid color-mix(in srgb, var(--foreground) 20%, transparent)",
                  }}
                >
                  {topToggles.map((field) => (
                    <Box
                      key={field.key}
                      display="flex"
                      alignItems="center"
                      gap={10}
                    >
                      <Switch
                        checked={Boolean(values[field.key])}
                        onChange={(v) => onChange(field.key, v)}
                      />
                      <Typography
                        as="span"
                        variant="body"
                        fontWeight={500}
                        color="var(--foreground)"
                      >
                        {field.label}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}

              {bodyFields.map((field, index) => (
                <Fragment key={field.key}>
                  {/* ── Slot block, above this field's row ── */}
                  {slotMap.has(field.key) && (
                    <Box className="af__field--full" flexDirection="column">
                      {slotMap.get(field.key)}
                    </Box>
                  )}

                  {/* ── Pair group header (shown before the ES field of each pair) ── */}
                  {needsGroupHeader(field) && (
                    <Box
                      className="af__field--full"
                      paddingTop={32}
                      paddingBottom={2}
                      styles={{
                        borderBottom:
                          "1px solid color-mix(in srgb, var(--foreground) 20%, transparent)",
                      }}
                    >
                      <Typography
                        variant="label"
                        fontWeight={800}
                        color="var(--foreground)"
                        styles={{
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                        }}
                      >
                        {field.groupLabel ?? deriveGroupLabel(field.label)}
                      </Typography>
                    </Box>
                  )}

                  <Box
                    flexDirection="column"
                    className={fieldSpanClass(field)}
                    gap={field.fieldError ? 4 : undefined}
                  >
                    {field.type === "boolean" ? (
                      <Box
                        display="flex"
                        alignItems="center"
                        gap={10}
                        padding="10px 0"
                      >
                        <Switch
                          checked={Boolean(values[field.key])}
                          onChange={(v) => onChange(field.key, v)}
                        />
                        <Typography
                          as="span"
                          variant="body"
                          fontWeight={500}
                          color="var(--foreground)"
                        >
                          {field.label}
                        </Typography>
                      </Box>
                    ) : field.type === "select" ? (
                      <Select
                        label={field.label}
                        value={String(values[field.key] ?? "")}
                        onChange={(v) => onChange(field.key, v)}
                        required={field.required}
                        options={[
                          { value: "", label: field.placeholder ?? "-" },
                          ...(field.options?.map((opt) => ({
                            value: String(opt.value),
                            label: opt.label,
                          })) ?? []),
                        ]}
                      />
                    ) : field.type === "datetime" ? (
                      <Box flexDirection="column" gap={6}>
                        <label
                          className="af__label"
                          htmlFor={`field-${field.key}`}
                        >
                          {field.label}
                        </label>
                        <input
                          id={`field-${field.key}`}
                          type="datetime-local"
                          className="af__datetime-input"
                          required={field.required}
                          disabled={field.disabled}
                          value={String(values[field.key] ?? "")}
                          onChange={(e) => onChange(field.key, e.target.value)}
                        />
                      </Box>
                    ) : field.type === "color" ? (
                      <Box flexDirection="column" gap={6}>
                        <label
                          className="af__label"
                          htmlFor={`field-${field.key}`}
                        >
                          {field.label}
                        </label>
                        <Box display="flex" alignItems="center" gap={8}>
                          <input
                            id={`field-${field.key}`}
                            type="color"
                            className="af__color-input"
                            value={String(values[field.key] ?? "#000000")}
                            onChange={(e) =>
                              onChange(field.key, e.target.value)
                            }
                          />
                          <TextInput
                            value={String(values[field.key] ?? "")}
                            onChange={(v) => onChange(field.key, v)}
                            placeholder="#000000"
                            flex={1}
                          />
                        </Box>
                      </Box>
                    ) : (
                      <Box flexDirection="column" gap={6}>
                        {/* ── Label row ── */}
                        <Box
                          display="flex"
                          alignItems="center"
                          justifyContent={
                            field.type === "textarea" || isTranslatable(field)
                              ? "space-between"
                              : undefined
                          }
                          minHeight={24}
                          marginBottom={4}
                        >
                          <label
                            className="af__label"
                            htmlFor={`field-${field.key}`}
                          >
                            {fieldLabelText(field)}
                            {field.required && (
                              <Typography
                                as="span"
                                variant="none"
                                color="#e53935"
                                marginLeft={2}
                              >
                                *
                              </Typography>
                            )}
                          </label>

                          {/* ── Action buttons (enhance, translate) ── */}
                          {(field.type === "textarea" ||
                            isTranslatable(field)) && (
                            <Box display="flex" alignItems="center" gap={12}>
                              {field.type === "textarea" && (
                                <Button
                                  unstyled
                                  icon="/icons/enhance.svg"
                                  iconSize="16px"
                                  iconColor={
                                    activeEnhanceField === field.key
                                      ? "var(--accent-text, #06b6d4)"
                                      : "var(--foreground, #171717)"
                                  }
                                  disabled={
                                    llmBusy ||
                                    !String(values[field.key] ?? "").trim()
                                  }
                                  onClick={() => triggerEnhance(field.key)}
                                  aria-label={t("enhanceLabel")}
                                  title={t("enhanceLabel")}
                                  className={[
                                    "af__enhance-btn",
                                    llmBusy ||
                                    !String(values[field.key] ?? "").trim()
                                      ? "af__enhance-btn--busy"
                                      : "",
                                    activeEnhanceField === field.key
                                      ? "af__enhance-btn--active"
                                      : "",
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                />
                              )}
                              {isTranslatable(field) && (
                                <Button
                                  unstyled
                                  icon="/icons/translate.svg"
                                  iconSize="16px"
                                  iconColor={
                                    activeTranslateField === field.key
                                      ? "var(--accent-text, #06b6d4)"
                                      : "var(--foreground, #171717)"
                                  }
                                  disabled={
                                    llmBusy ||
                                    !String(values[field.key] ?? "").trim()
                                  }
                                  onClick={() => triggerTranslate(field.key)}
                                  aria-label={t("translateLabel")}
                                  title={t("translateLabel")}
                                  className={[
                                    "af__enhance-btn",
                                    llmBusy ||
                                    !String(values[field.key] ?? "").trim()
                                      ? "af__enhance-btn--busy"
                                      : "",
                                    activeTranslateField === field.key
                                      ? "af__enhance-btn--active"
                                      : "",
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                />
                              )}
                            </Box>
                          )}
                        </Box>

                        <TextInput
                          id={`field-${field.key}`}
                          value={String(values[field.key] ?? "")}
                          onChange={(v) => onChange(field.key, v)}
                          type={
                            field.type === "number"
                              ? "number"
                              : field.type === "url"
                                ? "url"
                                : field.type === "password"
                                  ? "password"
                                  : "text"
                          }
                          multirow={field.type === "textarea"}
                          rows={field.type === "textarea" ? 7 : undefined}
                          placeholder={field.placeholder}
                          helperText={field.helperText}
                          disabled={field.disabled ?? field.type === "slug"}
                          onBlur={field.onBlur}
                          error={field.fieldError ?? undefined}
                        />

                        {/* ── Enhance preview panel ── */}
                        {field.type === "textarea" &&
                          activeEnhanceField === field.key && (
                            <Box
                              flexDirection="column"
                              gap={10}
                              padding="12px 14px"
                              borderRadius={8}
                              border="1px solid color-mix(in srgb, var(--accent, #06b6d4) 30%, transparent)"
                              backgroundColor="color-mix(in srgb, var(--accent, #06b6d4) 5%, transparent)"
                            >
                              <Typography variant="body">
                                {enhancePreview || "…"}
                              </Typography>
                              <Box
                                display="flex"
                                gap={8}
                                alignItems="center"
                                marginTop={12}
                              >
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

                        {/* ── Translate preview panel ── */}
                        {isTranslatable(field) &&
                          activeTranslateField === field.key && (
                            <Box
                              flexDirection="column"
                              gap={10}
                              padding="12px 14px"
                              borderRadius={8}
                              border="1px solid color-mix(in srgb, var(--foreground) 15%, transparent)"
                              backgroundColor="color-mix(in srgb, var(--foreground) 3%, transparent)"
                            >
                              <Typography variant="body">
                                {translatePreview || "…"}
                              </Typography>
                              <Box
                                display="flex"
                                gap={8}
                                alignItems="center"
                                marginTop={12}
                              >
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
                    )}
                  </Box>

                  {/* ── Image uploaders, right below the name field(s) ── */}
                  {index === imagesSlotIndex && imagesSlot && (
                    <Box
                      className="af__field--full"
                      flexDirection="column"
                      gap={16}
                      paddingTop={8}
                    >
                      {imagesSlot}
                    </Box>
                  )}
                </Fragment>
              ))}
            </Box>

            {/* Extra content (image uploaders, gradient builders, etc.) */}
            {children}
          </fieldset>

          {/* Fixed action bar, centered at the bottom of the viewport: the
              production-view shortcut (when the record has a public page) sits
              beside the primary Save button, which is itself flanked by the
              prev/next arrows through the CMS list. */}
          {!embedded && (
            <Box
              display="flex"
              alignItems="center"
              gap={12}
              padding={10}
              borderRadius={8}
              border="1px solid color-mix(in srgb, var(--foreground) 12%, transparent)"
              backgroundColor="var(--background)"
              styles={{
                position: "fixed",
                bottom: 24,
                left: "50%",
                transform: "translateX(-50%)",
                boxShadow:
                  "0 4px 16px color-mix(in srgb, var(--foreground) 12%, transparent)",
                zIndex: 100,
              }}
            >
              {productionHref !== undefined && (
                // Same-tab navigation on purpose: Button's link mode wraps a
                // type-less <button> (which would submit this form), but for a
                // same-tab link next/Link calls preventDefault and suppresses
                // that submit. A `target="_blank"` here would skip the
                // preventDefault and save the record on every click.
                //
                // ⚠ No `href` at all until there is a real one to give: a
                // disabled Link-mode button is still an anchor, reachable by
                // keyboard and live to Enter, and its inner <button> is the
                // type-less one above - so a half-built address would both
                // navigate and submit. With none it is a plain disabled
                // <button type="button">, which is what keeps the bar the same
                // width from the first paint.
                <Button
                  text={t("viewInProduction")}
                  href={
                    loading || productionHref === null
                      ? undefined
                      : productionHref
                  }
                  disabled={loading || productionHref === null}
                  icon="/icons/fullscreen.svg"
                  size="lg"
                />
              )}
              <SiblingArrow direction="prev" siblings={siblings} />
              <Button
                type="submit"
                text={saving ? t("saving") : t("save")}
                disabled={saving || loading}
                kind="primary"
                size="lg"
              />
              <SiblingArrow direction="next" siblings={siblings} />
            </Box>
          )}
        </form>
      </Box>

      {showClone && (
        <ConfirmationModal
          title={t("cloneTitle")}
          text={t("cloneText")}
          okCallback={handleConfirmClone}
          cancelCallback={handleCancelClone}
          okLabel={cloning ? t("cloning") : t("clone")}
          cancelLabel={tCommon("cancel")}
          okDisabled={cloning || !cloneName.trim()}
        >
          <Box flexDirection="column" gap={16}>
            <TextInput
              label={t("cloneNameLabel")}
              value={cloneName}
              onChange={setCloneName}
              disabled={cloning}
            />
            <TextInput
              label={t("cloneEnNameLabel")}
              value={cloneEnName}
              onChange={setCloneEnName}
              disabled={cloning}
            />
            {cloneError && (
              <Typography variant="body" color="var(--error, #e53935)">
                {cloneError}
              </Typography>
            )}
          </Box>
        </ConfirmationModal>
      )}

      {showEnhanceOptions && (
        <ConfirmationModal
          title={t("enhanceOptionsTitle")}
          text={t("enhanceOptionsText")}
          okCallback={handleConfirmEnhanceOptions}
          cancelCallback={handleCancelEnhanceOptions}
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
