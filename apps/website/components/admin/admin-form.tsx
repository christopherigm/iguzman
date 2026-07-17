"use client";

import {
  useRef,
  useCallback,
  useState,
  useEffect,
  useMemo,
  Fragment,
} from "react";
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
import { SpeechButton } from "@repo/ui/core-elements/speech-button";
import { useLlmProxy, type LlmMessage } from "@repo/ui/use-llm";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { Slider } from "@repo/ui/core-elements/slider";
import {
  PARAGRAPH_WORD_COUNTS,
  PARAGRAPH_LENGTH_STEPS,
  PARAGRAPH_COUNT_STEPS,
} from "./paragraph-options";

// ── SpeechFieldButton ──────────────────────────────────────────────────────
//
// Stable mic button for a single textarea field.
// Uses refs so onTranscript identity never changes across renders, preventing
// SpeechButton's effect from re-firing after the parent updates values in
// response to a transcript (which would cause an infinite append loop).

function SpeechFieldButton({
  fieldKey,
  getFieldValue,
  onChange,
}: {
  fieldKey: string;
  getFieldValue: () => string;
  onChange: (key: string, value: unknown) => void;
}) {
  // Keep the latest callbacks in refs (written in an effect, not during render)
  // so the memoized handlers below can call the current versions.
  const onChangeRef = useRef(onChange);
  const getValueRef = useRef(getFieldValue);
  useEffect(() => {
    onChangeRef.current = onChange;
    getValueRef.current = getFieldValue;
  });

  const handleTranscript = useCallback(
    (text: string) => {
      const current = getValueRef.current();
      onChangeRef.current(fieldKey, current ? `${current} ${text}` : text);
    },
    [fieldKey], // fieldKey is stable per mounted instance
  );

  return (
    <SpeechButton
      language={fieldKey.startsWith("en_") ? "en" : "es"}
      onTranscript={handleTranscript}
      micIcon="/icons/mic.svg"
    />
  );
}

// ── LLM enhance helpers ────────────────────────────────────────────────────

const FIELD_CONTEXT: Record<string, { en: string; es: string }> = {
  about: {
    en: "company about/overview section",
    es: 'sección "Acerca de" de la empresa',
  },
  en_about: {
    en: "company about/overview section",
    es: 'sección "Acerca de" de la empresa',
  },
  mission: { en: "company mission statement", es: "misión de la empresa" },
  en_mission: { en: "company mission statement", es: "misión de la empresa" },
  vision: { en: "company vision statement", es: "visión de la empresa" },
  en_vision: { en: "company vision statement", es: "visión de la empresa" },
  privacy_policy: { en: "privacy policy", es: "política de privacidad" },
  en_privacy_policy: { en: "privacy policy", es: "política de privacidad" },
  terms_and_conditions: {
    en: "terms and conditions",
    es: "términos y condiciones",
  },
  en_terms_and_conditions: {
    en: "terms and conditions",
    es: "términos y condiciones",
  },
  user_data: { en: "user data policy", es: "política de datos del usuario" },
  en_user_data: { en: "user data policy", es: "política de datos del usuario" },
  highlights_subtitle: {
    en: "highlights section description",
    es: "descripción de la sección de destacados",
  },
  en_highlights_subtitle: {
    en: "highlights section description",
    es: "descripción de la sección de destacados",
  },
  description: {
    en: "product/service description",
    es: "descripción del producto o servicio",
  },
  en_description: {
    en: "product/service description",
    es: "descripción del producto o servicio",
  },
  short_description: {
    en: "short product/service description",
    es: "descripción corta del producto o servicio",
  },
  en_short_description: {
    en: "short product/service description",
    es: "descripción corta del producto o servicio",
  },
};

function buildEnhanceMessages(
  text: string,
  fieldKey: string,
  paragraphs: number,
  paragraphLength: string,
): LlmMessage[] {
  const isEnglish = fieldKey.startsWith("en_");
  const ctx = FIELD_CONTEXT[fieldKey] ?? {
    en: "website content",
    es: "contenido del sitio web",
  };
  const { min, max } = PARAGRAPH_WORD_COUNTS[paragraphLength] ?? {
    min: 80,
    max: 120,
  };
  const paraLabel = paragraphs === 1 ? "paragraph" : "paragraphs";

  if (isEnglish) {
    return [
      {
        role: "system",
        content: `You are a professional copywriter for a company website. Rewrite and expand the following text into polished, professional prose suitable for the ${ctx.en}. Write exactly ${paragraphs} ${paraLabel}. Each paragraph must be between ${min} and ${max} words. Add relevant detail, context, or supporting ideas - do not pad with filler. Return only the improved text - no explanations, labels, or formatting marks.`,
      },
      { role: "user", content: text },
    ];
  }
  return [
    {
      role: "system",
      content: `Eres un redactor profesional para un sitio web corporativo. Reescribe y amplía el siguiente texto en prosa profesional, adecuada para la ${ctx.es} de la empresa. Escribe exactamente ${paragraphs} párrafo${paragraphs !== 1 ? "s" : ""}. Cada párrafo debe tener entre ${min} y ${max} palabras. Agrega detalles relevantes, contexto o ideas de apoyo - no uses relleno. Devuelve únicamente el texto mejorado - sin explicaciones, etiquetas ni marcas de formato.`,
    },
    { role: "user", content: text },
  ];
}

// ── LLM translate helpers ──────────────────────────────────────────────────

function buildTranslateMessages(
  text: string,
  sourceFieldKey: string,
): LlmMessage[] {
  const isSourceEnglish = sourceFieldKey.startsWith("en_");
  if (isSourceEnglish) {
    return [
      {
        role: "system",
        content:
          "You are a professional translator. Translate the following text from English to Spanish. Return only the translated text - no explanations, labels, or formatting marks.",
      },
      { role: "user", content: text },
    ];
  }
  return [
    {
      role: "system",
      content:
        "Eres un traductor profesional. Traduce el siguiente texto del español al inglés. Devuelve únicamente el texto traducido - sin explicaciones, etiquetas ni marcas de formato.",
    },
    { role: "user", content: text },
  ];
}

// ── Pair group label ───────────────────────────────────────────────────────

function deriveGroupLabel(label: string): string {
  return label
    .replace(/\s*\(ES\)\s*$/i, "")
    .replace(/\s*\(Español\)\s*$/i, "")
    .trim();
}

// ── Top toggles ────────────────────────────────────────────────────────────

// Status flags that belong above the form rather than buried at the bottom,
// in this display order. Any other boolean field renders in place.
const TOP_TOGGLE_KEYS = ["is_featured", "enabled", "in_stock"];

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
  saving?: boolean;
  error?: string | null;
  success?: string | null;
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
  saving,
  error,
  success,
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
      <Box flexDirection="column" gap={20} marginBottom={40}>
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
                text={t("cancel")}
                onClick={onCancel ?? (() => router.back())}
                size="md"
              />
            )}
          </Box>
        </Box>

        {error && <Toast message={error} variant="error" />}
        {success && (
          <Toast message={success} variant="success" position="top-center" />
        )}

        <form className="af__form" onSubmit={handleSubmit} noValidate>
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
                      color="color-mix(in srgb, var(--foreground) 75%, transparent)"
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
                          onChange={(e) => onChange(field.key, e.target.value)}
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

                        {/* ── Action buttons (mic, enhance, translate) ── */}
                        {(field.type === "textarea" ||
                          isTranslatable(field)) && (
                          <Box display="flex" alignItems="center" gap={12}>
                            {field.type === "textarea" && (
                              <SpeechFieldButton
                                fieldKey={field.key}
                                getFieldValue={() =>
                                  String(values[field.key] ?? "")
                                }
                                onChange={onChange}
                              />
                            )}
                            {field.type === "textarea" && (
                              <Button
                                unstyled
                                icon="/icons/enhance.svg"
                                iconSize="16px"
                                iconColor={
                                  activeEnhanceField === field.key
                                    ? "var(--accent, #06b6d4)"
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
                                    ? "var(--accent, #06b6d4)"
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

          <Box
            display="flex"
            gap={12}
            borderRadius={8}
            border="1px solid color-mix(in srgb, var(--foreground) 12%, transparent)"
            backgroundColor="var(--background)"
            styles={{
              position: "fixed",
              bottom: 24,
              right: 24,
              boxShadow:
                "0 4px 16px color-mix(in srgb, var(--foreground) 12%, transparent)",
              zIndex: 100,
            }}
          >
            <Button
              type="submit"
              text={saving ? t("saving") : t("save")}
              disabled={saving}
              kind="primary"
              size="lg"
            />
          </Box>
        </form>
      </Box>

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
