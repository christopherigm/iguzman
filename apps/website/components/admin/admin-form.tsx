'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@repo/i18n/navigation';
import './admin-form.css';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Button } from '@repo/ui/core-elements/button';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Switch } from '@repo/ui/core-elements/switch';

export interface FieldDef {
  key: string;
  label: string;
  type?: 'text' | 'textarea' | 'boolean' | 'number' | 'url' | 'select' | 'color' | 'slug';
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
  children?: React.ReactNode; // for extra slots (e.g. image uploader)
}

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <Box flexDirection="column" gap={20} maxWidth="900px">
      <Box display="flex" alignItems="center" justifyContent="space-between" gap={16}>
        <Typography as="h1" variant="h3" className="af__title">{title}</Typography>
        {!hideCancel && (
          <Button
            text={t('cancel')}
            unstyled
            className="af__btn-cancel"
            onClick={onCancel ?? (() => router.back())}
          />
        )}
      </Box>

      {error && (
        <Box className="af__banner af__banner--error">
          <Typography variant="body-sm">{error}</Typography>
        </Box>
      )}

      {success && (
        <Box className="af__banner af__banner--success">
          <Typography variant="body-sm">{success}</Typography>
        </Box>
      )}

      <form className="af__form" onSubmit={handleSubmit} noValidate>
        <Box className="af__grid">
          {fields.map(field => (
            <Box key={field.key} flexDirection="column" className={field.type === 'textarea' ? 'af__field--full' : undefined} gap={field.fieldError ? 4 : undefined}>
              {field.type === 'boolean' ? (
                <Box display="flex" alignItems="center" gap={10} padding="10px 0">
                  <Switch
                    checked={Boolean(values[field.key])}
                    onChange={v => onChange(field.key, v)}
                  />
                  <Typography as="span" variant="body-sm" className="af__field-bool-label">{field.label}</Typography>
                </Box>
              ) : field.type === 'select' ? (
                <Box flexDirection="column" gap={6}>
                  <label className="af__label" htmlFor={`field-${field.key}`}>{field.label}</label>
                  <select
                    id={`field-${field.key}`}
                    className="af__select"
                    value={String(values[field.key] ?? '')}
                    onChange={e => onChange(field.key, e.target.value)}
                    required={field.required}
                  >
                    <option value="">{field.placeholder ?? '—'}</option>
                    {field.options?.map(opt => (
                      <option key={String(opt.value)} value={String(opt.value)}>{opt.label}</option>
                    ))}
                  </select>
                </Box>
              ) : field.type === 'color' ? (
                <Box flexDirection="column" gap={6}>
                  <label className="af__label" htmlFor={`field-${field.key}`}>{field.label}</label>
                  <Box display="flex" alignItems="center" gap={8}>
                    <input
                      id={`field-${field.key}`}
                      type="color"
                      className="af__color-input"
                      value={String(values[field.key] ?? '#000000')}
                      onChange={e => onChange(field.key, e.target.value)}
                    />
                    <TextInput
                      value={String(values[field.key] ?? '')}
                      onChange={v => onChange(field.key, v)}
                      placeholder="#000000"
                      className="af__color-text"
                    />
                  </Box>
                </Box>
              ) : (
                <Box flexDirection="column" gap={6}>
                  <label className="af__label" htmlFor={`field-${field.key}`}>
                    {field.label}
                    {field.required && <Typography as="span" variant="none" className="af__required">*</Typography>}
                  </label>
                  <TextInput
                    id={`field-${field.key}`}
                    value={String(values[field.key] ?? '')}
                    onChange={v => onChange(field.key, v)}
                    type={field.type === 'number' ? 'number' : field.type === 'url' ? 'url' : 'text'}
                    multirow={field.type === 'textarea'}
                    rows={field.type === 'textarea' ? 4 : undefined}
                    placeholder={field.placeholder}
                    disabled={field.disabled ?? field.type === 'slug'}
                    onBlur={field.onBlur}
                    className={field.fieldError ? 'af__input--error' : undefined}
                  />
                  {field.fieldError && (
                    <Typography as="span" variant="none" className="af__field-error">{field.fieldError}</Typography>
                  )}
                </Box>
              )}
            </Box>
          ))}
        </Box>

        {/* Extra content (image uploaders, etc.) */}
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
  );
}
