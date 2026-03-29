'use client';

import { useRef, useCallback, useState, useEffect } from 'react';
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
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import { SpeechButton } from '@repo/ui/core-elements/speech-button';
import { useLlm } from '@repo/ui/use-llm';
import type { LlmMessage } from '@repo/helpers/llm';

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

function buildEnhanceMessages(text: string, fieldKey: string): LlmMessage[] {
  const isEnglish = fieldKey.startsWith('en_');
  const ctx = FIELD_CONTEXT[fieldKey] ?? {
    en: 'website content',
    es: 'contenido del sitio web',
  };

  if (isEnglish) {
    return [
      {
        role: 'system',
        content: `You are a professional copywriter for a company website. Rewrite and expand the following text into polished, professional prose suitable for the ${ctx.en}. Be concise and clear. Return only the improved text — no explanations, labels, or formatting marks.`,
      },
      { role: 'user', content: text },
    ];
  }
  return [
    {
      role: 'system',
      content: `Eres un redactor profesional para un sitio web corporativo. Reescribe y amplía el siguiente texto en prosa profesional y concisa, adecuada para la ${ctx.es} de la empresa. Sé claro y directo. Devuelve únicamente el texto mejorado — sin explicaciones, etiquetas ni marcas de formato.`,
    },
    { role: 'user', content: text },
  ];
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

  // ── LLM ─────────────────────────────────────────────────────────────────
  const {
    streamingText,
    isModelLoading,
    modelLoadProgress,
    isGenerating,
    generate,
    abort,
    reset: resetLlm,
  } = useLlm({ mode: 'streaming', temperature: 0.7, maxNewTokens: 400 });

  // Whether the user has acknowledged the one-time model download warning.
  const [modelConfirmed, setModelConfirmed] = useState(false);
  // Controls visibility of the download-warning confirmation modal.
  const [showModelConfirm, setShowModelConfirm] = useState(false);
  // The field that triggered the modal (waiting for confirmation).
  const [pendingEnhanceField, setPendingEnhanceField] = useState<string | null>(null);
  // The field whose enhance preview is currently visible.
  const [activeEnhanceField, setActiveEnhanceField] = useState<string | null>(null);
  // Accumulated streaming text shown in the preview panel.
  const [enhancePreview, setEnhancePreview] = useState('');

  // Sync streaming tokens into the preview as they arrive.
  useEffect(() => {
    if (streamingText) setEnhancePreview(streamingText);
  }, [streamingText]);

  // ── Enhance handlers ─────────────────────────────────────────────────────

  const triggerEnhance = async (fieldKey: string) => {
    const currentValue = String(values[fieldKey] ?? '').trim();
    if (!currentValue) return;

    setActiveEnhanceField(fieldKey);
    setEnhancePreview('');
    resetLlm();

    const messages = buildEnhanceMessages(currentValue, fieldKey);
    await generate(messages);
  };

  const handleEnhanceClick = (fieldKey: string) => {
    if (!modelConfirmed) {
      setPendingEnhanceField(fieldKey);
      setShowModelConfirm(true);
      return;
    }
    triggerEnhance(fieldKey);
  };

  const handleModelConfirmOk = () => {
    setShowModelConfirm(false);
    setModelConfirmed(true);
    if (pendingEnhanceField) {
      triggerEnhance(pendingEnhanceField);
      setPendingEnhanceField(null);
    }
  };

  const handleModelConfirmCancel = () => {
    setShowModelConfirm(false);
    setPendingEnhanceField(null);
  };

  const handleAcceptEnhance = () => {
    if (activeEnhanceField && enhancePreview) {
      onChange(activeEnhanceField, enhancePreview);
    }
    setActiveEnhanceField(null);
    setEnhancePreview('');
    resetLlm();
  };

  const handleDiscardEnhance = () => {
    if (isGenerating) abort();
    setActiveEnhanceField(null);
    setEnhancePreview('');
    resetLlm();
  };

  // ── Form submit ──────────────────────────────────────────────────────────

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  // ── Shared flag: block enhance buttons while model is loading or generating
  const enhanceBusy = isModelLoading || isGenerating;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {showModelConfirm && (
        <ConfirmationModal
          title={t('enhanceModelTitle')}
          text={t('enhanceModelText')}
          okCallback={handleModelConfirmOk}
          cancelCallback={handleModelConfirmCancel}
        />
      )}

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

        {/* Model download progress — shown after the user confirms and download begins */}
        {modelConfirmed && isModelLoading && (
          <Box flexDirection="column" gap={6} className="af__model-loading">
            <Typography variant="body-sm" className="af__model-loading-label">
              {t('downloadingModel')} — {modelLoadProgress}%
            </Typography>
            <ProgressBar value={modelLoadProgress} size={3} />
          </Box>
        )}

        <form className="af__form" onSubmit={handleSubmit} noValidate>
          <Box className="af__grid">
            {fields.map((field) => (
              <Box
                key={field.key}
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
                    <Box
                      display="flex"
                      alignItems="center"
                      justifyContent={field.type === 'textarea' ? 'space-between' : undefined}
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

                      {field.type === 'textarea' && (
                        <Box display="flex" alignItems="center" gap={2}>
                          <SpeechFieldButton
                            fieldKey={field.key}
                            getFieldValue={() => String(values[field.key] ?? '')}
                            onChange={onChange}
                          />
                          <Button
                            unstyled
                            disabled={enhanceBusy || !String(values[field.key] ?? '').trim()}
                            onClick={() => handleEnhanceClick(field.key)}
                            aria-label={t('enhanceLabel')}
                            title={t('enhanceLabel')}
                            className={[
                              'af__enhance-btn',
                              enhanceBusy || !String(values[field.key] ?? '').trim() ? 'af__enhance-btn--busy' : '',
                              activeEnhanceField === field.key ? 'af__enhance-btn--active' : '',
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

                    {/* Enhance preview panel — visible while generating or waiting for accept */}
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
    </>
  );
}
