'use client';

import { useRef, useCallback, useState, useEffect, useMemo, Fragment } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@repo/i18n/navigation';
import './admin-form.css';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Button } from '@repo/ui/core-elements/button';
import { Icon } from '@repo/ui/core-elements/icon';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Switch } from '@repo/ui/core-elements/switch';
import { Toast } from '@repo/ui/core-elements/toast';
import { SpeechButton } from '@repo/ui/core-elements/speech-button';
import { getAccessToken } from '@/lib/auth';
import { useOllamaProxy, type LlmMessage } from '@repo/ui/use-ollama';
import { useGroqProxy } from '@repo/ui/use-groq';
import { ADMIN_AI_PROVIDER_KEY, type AdminAiProvider } from '@/app/[locale]/admin/admin-sidebar';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import { Slider } from '@repo/ui/core-elements/slider';

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
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const getValueRef = useRef(getFieldValue);
  getValueRef.current = getFieldValue;

  const handleTranscript = useCallback(
    (text: string) => {
      const current = getValueRef.current();
      onChangeRef.current(fieldKey, current ? `${current} ${text}` : text);
    },
    [fieldKey], // fieldKey is stable per mounted instance
  );

  return (
    <SpeechButton
      language={fieldKey.startsWith('en_') ? 'en' : 'es'}
      onTranscript={handleTranscript}
      micIcon="/icons/mic.svg"
    />
  );
}

// ── Enhance options constants ──────────────────────────────────────────────

const PARAGRAPH_WORD_COUNTS: Record<string, { min: number; max: number }> = {
  xs: { min: 25, max: 40 },
  sm: { min: 50, max: 75 },
  md: { min: 80, max: 120 },
  'md-lg': { min: 130, max: 180 },
  lg: { min: 200, max: 270 },
  xl: { min: 300, max: 400 },
};

const PARAGRAPH_LENGTH_STEPS = [
  { value: 'xs', label: 'XS' },
  { value: 'sm', label: 'S' },
  { value: 'md', label: 'M' },
  { value: 'md-lg', label: 'M-L' },
  { value: 'lg', label: 'L' },
  { value: 'xl', label: 'XL' },
];

const PARAGRAPH_COUNT_STEPS = [1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }));

// ── LLM enhance helpers ────────────────────────────────────────────────────

const FIELD_CONTEXT: Record<string, { en: string; es: string }> = {
  about: { en: 'company about/overview section', es: 'sección "Acerca de" de la empresa' },
  en_about: { en: 'company about/overview section', es: 'sección "Acerca de" de la empresa' },
  mission: { en: 'company mission statement', es: 'misión de la empresa' },
  en_mission: { en: 'company mission statement', es: 'misión de la empresa' },
  vision: { en: 'company vision statement', es: 'visión de la empresa' },
  en_vision: { en: 'company vision statement', es: 'visión de la empresa' },
  privacy_policy: { en: 'privacy policy', es: 'política de privacidad' },
  en_privacy_policy: { en: 'privacy policy', es: 'política de privacidad' },
  terms_and_conditions: { en: 'terms and conditions', es: 'términos y condiciones' },
  en_terms_and_conditions: { en: 'terms and conditions', es: 'términos y condiciones' },
  user_data: { en: 'user data policy', es: 'política de datos del usuario' },
  en_user_data: { en: 'user data policy', es: 'política de datos del usuario' },
  highlights_subtitle: { en: 'highlights section description', es: 'descripción de la sección de destacados' },
  en_highlights_subtitle: { en: 'highlights section description', es: 'descripción de la sección de destacados' },
  description: { en: 'product/service description', es: 'descripción del producto o servicio' },
  en_description: { en: 'product/service description', es: 'descripción del producto o servicio' },
  short_description: { en: 'short product/service description', es: 'descripción corta del producto o servicio' },
  en_short_description: { en: 'short product/service description', es: 'descripción corta del producto o servicio' },
};

function buildEnhanceMessages(
  text: string,
  fieldKey: string,
  paragraphs: number,
  paragraphLength: string,
): LlmMessage[] {
  const isEnglish = fieldKey.startsWith('en_');
  const ctx = FIELD_CONTEXT[fieldKey] ?? {
    en: 'website content',
    es: 'contenido del sitio web',
  };
  const { min, max } = PARAGRAPH_WORD_COUNTS[paragraphLength] ?? { min: 80, max: 120 };
  const paraLabel = paragraphs === 1 ? 'paragraph' : 'paragraphs';

  if (isEnglish) {
    return [
      {
        role: 'system',
        content: `You are a professional copywriter for a company website. Rewrite and expand the following text into polished, professional prose suitable for the ${ctx.en}. Write exactly ${paragraphs} ${paraLabel}. Each paragraph must be between ${min} and ${max} words. Add relevant detail, context, or supporting ideas — do not pad with filler. Return only the improved text — no explanations, labels, or formatting marks.`,
      },
      { role: 'user', content: text },
    ];
  }
  return [
    {
      role: 'system',
      content: `Eres un redactor profesional para un sitio web corporativo. Reescribe y amplía el siguiente texto en prosa profesional, adecuada para la ${ctx.es} de la empresa. Escribe exactamente ${paragraphs} párrafo${paragraphs !== 1 ? 's' : ''}. Cada párrafo debe tener entre ${min} y ${max} palabras. Agrega detalles relevantes, contexto o ideas de apoyo — no uses relleno. Devuelve únicamente el texto mejorado — sin explicaciones, etiquetas ni marcas de formato.`,
    },
    { role: 'user', content: text },
  ];
}

// ── LLM translate helpers ──────────────────────────────────────────────────

function buildTranslateMessages(text: string, sourceFieldKey: string): LlmMessage[] {
  const isSourceEnglish = sourceFieldKey.startsWith('en_');
  if (isSourceEnglish) {
    return [
      {
        role: 'system',
        content:
          'You are a professional translator. Translate the following text from English to Spanish. Return only the translated text — no explanations, labels, or formatting marks.',
      },
      { role: 'user', content: text },
    ];
  }
  return [
    {
      role: 'system',
      content:
        'Eres un traductor profesional. Traduce el siguiente texto del español al inglés. Devuelve únicamente el texto traducido — sin explicaciones, etiquetas ni marcas de formato.',
    },
    { role: 'user', content: text },
  ];
}

// ── Pair group label ───────────────────────────────────────────────────────

function deriveGroupLabel(label: string): string {
  return label
    .replace(/\s*\(ES\)\s*$/i, '')
    .replace(/\s*\(Español\)\s*$/i, '')
    .trim();
}

// ── FieldDef / AdminFormProps ──────────────────────────────────────────────

export interface FieldDef {
  key: string;
  label: string;
  type?:
    | 'text'
    | 'textarea'
    | 'boolean'
    | 'number'
    | 'url'
    | 'select'
    | 'color'
    | 'slug';
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
  fields: FieldDef[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  hideCancel?: boolean;
  saving?: boolean;
  error?: string | null;
  success?: string | null;
  children?: React.ReactNode;
}

// ── AdminForm ──────────────────────────────────────────────────────────────

export function AdminForm({
  title,
  fields,
  values,
  onChange,
  onSubmit,
  onCancel,
  hideCancel,
  saving,
  error,
  success,
  children,
}: AdminFormProps) {
  const t = useTranslations('Admin');
  const router = useRouter();

  // ── AI provider (read from sidebar localStorage selection) ───────────────
  const [aiProvider, setAiProvider] = useState<AdminAiProvider>('groq');

  useEffect(() => {
    const stored = localStorage.getItem(ADMIN_AI_PROVIDER_KEY) as AdminAiProvider | null;
    if (stored === 'ollama' || stored === 'groq') setAiProvider(stored);

    const handler = (e: Event) => {
      const provider = (e as CustomEvent<AdminAiProvider>).detail;
      if (provider === 'ollama' || provider === 'groq') setAiProvider(provider);
    };
    window.addEventListener('admin-ai-provider-change', handler);
    return () => window.removeEventListener('admin-ai-provider-change', handler);
  }, []);

  // ── LLM hooks (both must be called unconditionally) ───────────────────────
  const getAuthHeaders = useCallback((): Record<string, string> => {
    const token = getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const ollamaHook = useOllamaProxy({ temperature: 0.7, getAuthHeaders });
  const groqHook = useGroqProxy({ temperature: 0.7, getAuthHeaders });

  const {
    streamingText,
    isGenerating,
    generate,
    abort,
    reset: resetLlm,
  } = aiProvider === 'ollama' ? ollamaHook : groqHook;

  // Tracks which operation ('enhance' | 'translate') is currently streaming.
  const activeOperationRef = useRef<'enhance' | 'translate' | null>(null);

  // ── Enhance state ─────────────────────────────────────────────────────────
  const [activeEnhanceField, setActiveEnhanceField] = useState<string | null>(null);
  const [enhancePreview, setEnhancePreview] = useState('');

  // ── Translate state ───────────────────────────────────────────────────────
  const [activeTranslateField, setActiveTranslateField] = useState<string | null>(null);
  const [translatePreview, setTranslatePreview] = useState('');

  // ── Enhance options modal state ───────────────────────────────────────────
  const [showEnhanceOptions, setShowEnhanceOptions] = useState(false);
  const [pendingEnhanceField, setPendingEnhanceField] = useState<string | null>(null);
  const [enhanceParagraphs, setEnhanceParagraphs] = useState(2);
  const [enhanceParagraphLength, setEnhanceParagraphLength] = useState('md');

  // Route streaming tokens to the correct preview.
  useEffect(() => {
    if (!streamingText) return;
    if (activeOperationRef.current === 'enhance') setEnhancePreview(streamingText);
    else if (activeOperationRef.current === 'translate') setTranslatePreview(streamingText);
  }, [streamingText]);

  // ── Pair map: key → paired key (bidirectional) ────────────────────────────
  const pairMap = useMemo(() => {
    const map = new Map<string, string>();
    const fieldKeys = new Set(fields.map((f) => f.key));
    fields.forEach((f) => {
      if (f.key.startsWith('en_')) {
        const esKey = f.key.slice(3);
        if (fieldKeys.has(esKey)) {
          map.set(f.key, esKey);
          map.set(esKey, f.key);
        }
      }
    });
    return map;
  }, [fields]);

  // A field gets a translate button when it's in a pair and is a text-like type.
  const isTranslatable = (field: FieldDef) =>
    pairMap.has(field.key) &&
    field.type !== 'boolean' &&
    field.type !== 'select' &&
    field.type !== 'color';

  // Show the group header before the ES field of each pair.
  const needsGroupHeader = (field: FieldDef) =>
    pairMap.has(field.key) && !field.key.startsWith('en_');

  // ── Enhance handlers ──────────────────────────────────────────────────────

  const triggerEnhance = (fieldKey: string) => {
    const currentValue = String(values[fieldKey] ?? '').trim();
    if (!currentValue) return;
    setPendingEnhanceField(fieldKey);
    setShowEnhanceOptions(true);
  };

  const handleConfirmEnhanceOptions = async () => {
    setShowEnhanceOptions(false);
    const fieldKey = pendingEnhanceField;
    setPendingEnhanceField(null);
    if (!fieldKey) return;

    const currentValue = String(values[fieldKey] ?? '').trim();
    if (!currentValue) return;

    // Clear any open translate preview.
    setActiveTranslateField(null);
    setTranslatePreview('');

    setActiveEnhanceField(fieldKey);
    setEnhancePreview('');
    resetLlm();
    activeOperationRef.current = 'enhance';

    const messages = buildEnhanceMessages(currentValue, fieldKey, enhanceParagraphs, enhanceParagraphLength);
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
    setEnhancePreview('');
    activeOperationRef.current = null;
    resetLlm();
  };

  const handleDiscardEnhance = () => {
    if (isGenerating) abort();
    setActiveEnhanceField(null);
    setEnhancePreview('');
    activeOperationRef.current = null;
    resetLlm();
  };

  // ── Translate handlers ────────────────────────────────────────────────────

  const triggerTranslate = async (fieldKey: string) => {
    const currentValue = String(values[fieldKey] ?? '').trim();
    if (!currentValue) return;

    // Clear any open enhance preview.
    setActiveEnhanceField(null);
    setEnhancePreview('');

    setActiveTranslateField(fieldKey);
    setTranslatePreview('');
    resetLlm();
    activeOperationRef.current = 'translate';

    const messages = buildTranslateMessages(currentValue, fieldKey);
    await generate(messages);
  };

  const handleAcceptTranslate = () => {
    if (activeTranslateField && translatePreview) {
      const targetKey = pairMap.get(activeTranslateField);
      if (targetKey) onChange(targetKey, translatePreview);
    }
    setActiveTranslateField(null);
    setTranslatePreview('');
    activeOperationRef.current = null;
    resetLlm();
  };

  const handleDiscardTranslate = () => {
    if (isGenerating) abort();
    setActiveTranslateField(null);
    setTranslatePreview('');
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

  const currentLengthWordRange =
    PARAGRAPH_WORD_COUNTS[enhanceParagraphLength] ?? { min: 80, max: 120 };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <Box flexDirection="column" gap={20} maxWidth="900px">
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          gap={16}
        >
          <Typography as="h1" variant="h3" className="af__title">
            {title}
          </Typography>
          {!hideCancel && (
            <Button
              text={t('cancel')}
              unstyled
              className="af__btn-cancel"
              onClick={onCancel ?? (() => router.back())}
            />
          )}
        </Box>

        {error && <Toast message={error} variant="error" />}
        {success && <Toast message={success} variant="success" />}

        <form className="af__form" onSubmit={handleSubmit} noValidate>
          <Box className="af__grid">
            {fields.map((field) => (
              <Fragment key={field.key}>
                {/* ── Pair group header (shown before the ES field of each pair) ── */}
                {needsGroupHeader(field) && (
                  <Box className="af__field--full af__pair-header">
                    <Typography variant="label" className="af__pair-label">
                      {field.groupLabel ?? deriveGroupLabel(field.label)}
                    </Typography>
                  </Box>
                )}

                <Box
                  flexDirection="column"
                  className={
                    field.type === 'textarea' ? 'af__field--full' : undefined
                  }
                  gap={field.fieldError ? 4 : undefined}
                >
                  {field.type === 'boolean' ? (
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
                        variant="body-sm"
                        className="af__field-bool-label"
                      >
                        {field.label}
                      </Typography>
                    </Box>
                  ) : field.type === 'select' ? (
                    <Box flexDirection="column" gap={6}>
                      <label className="af__label" htmlFor={`field-${field.key}`}>
                        {field.label}
                      </label>
                      <select
                        id={`field-${field.key}`}
                        className="af__select"
                        value={String(values[field.key] ?? '')}
                        onChange={(e) => onChange(field.key, e.target.value)}
                        required={field.required}
                      >
                        <option value="">{field.placeholder ?? '—'}</option>
                        {field.options?.map((opt) => (
                          <option key={String(opt.value)} value={String(opt.value)}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </Box>
                  ) : field.type === 'color' ? (
                    <Box flexDirection="column" gap={6}>
                      <label className="af__label" htmlFor={`field-${field.key}`}>
                        {field.label}
                      </label>
                      <Box display="flex" alignItems="center" gap={8}>
                        <input
                          id={`field-${field.key}`}
                          type="color"
                          className="af__color-input"
                          value={String(values[field.key] ?? '#000000')}
                          onChange={(e) => onChange(field.key, e.target.value)}
                        />
                        <TextInput
                          value={String(values[field.key] ?? '')}
                          onChange={(v) => onChange(field.key, v)}
                          placeholder="#000000"
                          className="af__color-text"
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
                          field.type === 'textarea' || isTranslatable(field)
                            ? 'space-between'
                            : undefined
                        }
                        className="af__label-row"
                      >
                        <label className="af__label" htmlFor={`field-${field.key}`}>
                          {field.label}
                          {field.required && (
                            <Typography
                              as="span"
                              variant="none"
                              className="af__required"
                            >
                              *
                            </Typography>
                          )}
                        </label>

                        {/* ── Action buttons (mic, enhance, translate) ── */}
                        {(field.type === 'textarea' || isTranslatable(field)) && (
                          <Box display="flex" alignItems="center" gap={2}>
                            {field.type === 'textarea' && (
                              <SpeechFieldButton
                                fieldKey={field.key}
                                getFieldValue={() => String(values[field.key] ?? '')}
                                onChange={onChange}
                              />
                            )}
                            {field.type === 'textarea' && (
                              <Button
                                unstyled
                                disabled={llmBusy || !String(values[field.key] ?? '').trim()}
                                onClick={() => triggerEnhance(field.key)}
                                aria-label={t('enhanceLabel')}
                                title={t('enhanceLabel')}
                                className={[
                                  'af__enhance-btn',
                                  llmBusy || !String(values[field.key] ?? '').trim()
                                    ? 'af__enhance-btn--busy'
                                    : '',
                                  activeEnhanceField === field.key
                                    ? 'af__enhance-btn--active'
                                    : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                              >
                                <Icon
                                  icon="/icons/enhance.svg"
                                  size="16px"
                                  color={
                                    activeEnhanceField === field.key
                                      ? 'var(--accent, #06b6d4)'
                                      : 'var(--foreground, #171717)'
                                  }
                                />
                              </Button>
                            )}
                            {isTranslatable(field) && (
                              <Button
                                unstyled
                                disabled={llmBusy || !String(values[field.key] ?? '').trim()}
                                onClick={() => triggerTranslate(field.key)}
                                aria-label={t('translateLabel')}
                                title={t('translateLabel')}
                                className={[
                                  'af__enhance-btn',
                                  llmBusy || !String(values[field.key] ?? '').trim()
                                    ? 'af__enhance-btn--busy'
                                    : '',
                                  activeTranslateField === field.key
                                    ? 'af__enhance-btn--active'
                                    : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                              >
                                <Icon
                                  icon="/icons/translate.svg"
                                  size="16px"
                                  color={
                                    activeTranslateField === field.key
                                      ? 'var(--accent, #06b6d4)'
                                      : 'var(--foreground, #171717)'
                                  }
                                />
                              </Button>
                            )}
                          </Box>
                        )}
                      </Box>

                      <TextInput
                        id={`field-${field.key}`}
                        value={String(values[field.key] ?? '')}
                        onChange={(v) => onChange(field.key, v)}
                        type={
                          field.type === 'number'
                            ? 'number'
                            : field.type === 'url'
                              ? 'url'
                              : 'text'
                        }
                        multirow={field.type === 'textarea'}
                        rows={field.type === 'textarea' ? 4 : undefined}
                        placeholder={field.placeholder}
                        disabled={field.disabled ?? field.type === 'slug'}
                        onBlur={field.onBlur}
                        className={
                          field.fieldError ? 'af__input--error' : undefined
                        }
                      />

                      {/* ── Enhance preview panel ── */}
                      {field.type === 'textarea' && activeEnhanceField === field.key && (
                        <Box className="af__enhance-preview" flexDirection="column" gap={10}>
                          <Typography
                            variant="body-sm"
                            className="af__enhance-preview-text"
                          >
                            {enhancePreview || '…'}
                          </Typography>
                          <Box display="flex" gap={8} alignItems="center">
                            {isGenerating ? (
                              <Button
                                text={t('enhanceStop')}
                                unstyled
                                className="af__btn-cancel"
                                onClick={handleDiscardEnhance}
                              />
                            ) : (
                              <>
                                <Button
                                  text={t('enhanceAccept')}
                                  onClick={handleAcceptEnhance}
                                />
                                <Button
                                  text={t('enhanceDiscard')}
                                  unstyled
                                  className="af__btn-cancel"
                                  onClick={handleDiscardEnhance}
                                />
                              </>
                            )}
                          </Box>
                        </Box>
                      )}

                      {/* ── Translate preview panel ── */}
                      {isTranslatable(field) && activeTranslateField === field.key && (
                        <Box className="af__translate-preview" flexDirection="column" gap={10}>
                          <Typography
                            variant="body-sm"
                            className="af__enhance-preview-text"
                          >
                            {translatePreview || '…'}
                          </Typography>
                          <Box display="flex" gap={8} alignItems="center">
                            {isGenerating ? (
                              <Button
                                text={t('enhanceStop')}
                                unstyled
                                className="af__btn-cancel"
                                onClick={handleDiscardTranslate}
                              />
                            ) : (
                              <>
                                <Button
                                  text={t('enhanceAccept')}
                                  onClick={handleAcceptTranslate}
                                />
                                <Button
                                  text={t('enhanceDiscard')}
                                  unstyled
                                  className="af__btn-cancel"
                                  onClick={handleDiscardTranslate}
                                />
                              </>
                            )}
                          </Box>
                        </Box>
                      )}

                      {field.fieldError && (
                        <Typography
                          as="span"
                          variant="none"
                          className="af__field-error"
                        >
                          {field.fieldError}
                        </Typography>
                      )}
                    </Box>
                  )}
                </Box>
              </Fragment>
            ))}
          </Box>

          {/* Extra content (image uploaders, gradient builders, etc.) */}
          {children}

          <Box display="flex" gap={12} className="af__actions">
            <Button
              type="submit"
              text={saving ? t('saving') : t('save')}
              disabled={saving}
            />
          </Box>
        </form>
      </Box>

      {showEnhanceOptions && (
        <ConfirmationModal
          title={t('enhanceOptionsTitle')}
          text={t('enhanceOptionsText')}
          okCallback={handleConfirmEnhanceOptions}
          cancelCallback={handleCancelEnhanceOptions}
        >
          <div className="af__enhance-options">
            <Slider
              steps={PARAGRAPH_COUNT_STEPS}
              value={enhanceParagraphs}
              onChange={(v) => setEnhanceParagraphs(Number(v))}
              label={t('enhanceParagraphsLabel')}
            />
            <Slider
              steps={PARAGRAPH_LENGTH_STEPS}
              value={enhanceParagraphLength}
              onChange={(v) => setEnhanceParagraphLength(String(v))}
              label={`${t('enhanceLengthLabel')} (${currentLengthWordRange.min}–${currentLengthWordRange.max} words/para)`}
            />
          </div>
        </ConfirmationModal>
      )}
    </>
  );
}
