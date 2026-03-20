'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Container } from '@repo/ui/core-elements/container';
import { Box } from '@repo/ui/core-elements/box';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Button } from '@repo/ui/core-elements/button';
import { LinkButton } from '@repo/ui/core-elements/link-button';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { Typography } from '@repo/ui/core-elements/typography';
import { confirmPasswordReset, ApiError } from '@/lib/auth';
import './reset-password-client.css';

type Status = 'idle' | 'loading' | 'success' | 'invalid';

interface Props {
  token: string;
  apiUrl: string;
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <Typography variant="caption" role="alert" className="auth-form__error">
      {message}
    </Typography>
  );
}

export function ResetPasswordClient({ token, apiUrl }: Props) {
  const t = useTranslations('ResetPasswordPage');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== newPassword2) {
      setError(t('errorPasswordMismatch'));
      return;
    }

    setStatus('loading');
    try {
      await confirmPasswordReset(token, newPassword, newPassword2, apiUrl);
      setStatus('success');
    } catch (err) {
      setStatus('idle');
      if (err instanceof ApiError) {
        const detail = String(
          (err.data as Record<string, unknown>).detail ?? '',
        );
        const newPasswordErr = (err.data as Record<string, string[]>)
          ?.new_password;
        if (newPasswordErr) {
          setError(
            Array.isArray(newPasswordErr)
              ? (newPasswordErr[0] ?? t('errorGeneric'))
              : String(newPasswordErr),
          );
        } else if (
          detail.toLowerCase().includes('invalid') ||
          detail.toLowerCase().includes('expired')
        ) {
          setStatus('invalid');
        } else {
          setError(t('errorGeneric'));
        }
      } else {
        setError(t('errorGeneric'));
      }
    }
  }

  return (
    <Container
      display="flex"
      alignItems="center"
      styles={{
        minHeight: '100vh',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        paddingTop: 80,
      }}
      paddingX={10}
    >
      <Box width="100%" maxWidth={420} marginBottom={20}>
        <Typography as="h1" variant="h2" fontWeight={600} marginBottom={4}>
          {t('title')}
        </Typography>
        <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
          {t('subtitle')}
        </Typography>
      </Box>

      <Box
        width="100%"
        maxWidth={420}
        padding={10}
        borderRadius={12}
        flexDirection="column"
        gap={20}
        elevation={5}
        backgroundColor="var(--surface-1)"
      >
        {status === 'loading' && (
          <Box display="flex" flexDirection="column" gap={16}>
            <ProgressBar label={t('submitting')} />
            <Typography
              variant="body-sm"
              color="var(--muted-foreground, #6b7280)"
              textAlign="center"
            >
              {t('submitting')}
            </Typography>
          </Box>
        )}

        {status === 'success' && (
          <Box
            display="flex"
            flexDirection="column"
            gap={12}
            alignItems="center"
            styles={{ textAlign: 'center' }}
          >
            <Typography variant="h5">{t('successTitle')}</Typography>
            <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
              {t('successDetail')}
            </Typography>
            <LinkButton href="/auth" label={t('backToSignIn')} />
          </Box>
        )}

        {status === 'invalid' && (
          <Box
            display="flex"
            flexDirection="column"
            gap={12}
            alignItems="center"
            styles={{ textAlign: 'center' }}
          >
            <Typography variant="h5" role="alert" color="var(--error, #ef4444)">
              {t('invalidTitle')}
            </Typography>
            <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
              {t('invalidDetail')}
            </Typography>
            <LinkButton href="/auth#reset-password" label={t('requestNewLink')} />
          </Box>
        )}

        {status === 'idle' && (
          <form onSubmit={handleSubmit} className="reset-password__form">
            <TextInput
              label={t('newPasswordLabel')}
              type="password"
              value={newPassword}
              onChange={setNewPassword}
              required
              autoComplete="new-password"
            />
            <TextInput
              label={t('confirmPasswordLabel')}
              type="password"
              value={newPassword2}
              onChange={setNewPassword2}
              required
              autoComplete="new-password"
            />
            {error && <ErrorMessage message={error} />}
            <Button
              text={t('submitButton')}
              type="submit"
              styles={{
                width: '100%',
                padding: '10px',
                fontSize: 14,
                marginTop: 4,
              }}
            />
            <Box display="flex" justifyContent="center">
              <LinkButton href="/auth#reset-password" label={t('requestNewLink')} />
            </Box>
          </form>
        )}
      </Box>
    </Container>
  );
}
