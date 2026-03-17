'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@repo/i18n/navigation';
import { Container } from '@repo/ui/core-elements/container';
import { Box } from '@repo/ui/core-elements/box';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { verifyEmail, ApiError } from '@/lib/auth';

type Status = 'loading' | 'success' | 'expired' | 'invalid';

const REDIRECT_SECONDS = 3;

interface Props {
  token: string;
  apiUrl: string;
}

export function VerifyEmailClient({ token, apiUrl }: Props) {
  const t = useTranslations('VerifyEmailPage');
  const router = useRouter();
  const [status, setStatus] = useState<Status>('loading');
  const [countdown, setCountdown] = useState(REDIRECT_SECONDS);

  useEffect(() => {
    verifyEmail(token, apiUrl)
      .then(() => setStatus('success'))
      .catch((err) => {
        if (err instanceof ApiError) {
          const detail = String((err.data as Record<string, unknown>).detail ?? '');
          if (detail.toLowerCase().includes('expired')) {
            setStatus('expired');
          } else {
            setStatus('invalid');
          }
        } else {
          setStatus('invalid');
        }
      });
  }, [token, apiUrl]);

  useEffect(() => {
    if (status !== 'success') return;

    if (countdown === 0) {
      router.push('/');
      return;
    }

    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [status, countdown, router]);

  return (
    <Container
      display="flex"
      alignItems="center"
      styles={{
        minHeight: '100vh',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
      paddingX={10}
    >
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <ProgressBar label={t('loading')} />
            <p
              style={{
                fontSize: 14,
                color: 'var(--muted-foreground, #6b7280)',
                textAlign: 'center',
              }}
            >
              {t('loading')}
            </p>
          </div>
        )}

        {status === 'success' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              alignItems: 'center',
              textAlign: 'center',
            }}
          >
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--foreground)' }}>
              {t('successTitle')}
            </p>
            <p style={{ fontSize: 14, color: 'var(--muted-foreground, #6b7280)' }}>
              {t('successDetail')}
            </p>
            <p style={{ fontSize: 13, color: 'var(--muted-foreground, #6b7280)' }}>
              {t('redirecting', { seconds: countdown })}
            </p>
            <ProgressBar
              value={((REDIRECT_SECONDS - countdown) / REDIRECT_SECONDS) * 100}
              label={t('redirectProgress')}
            />
          </div>
        )}

        {status === 'expired' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              alignItems: 'center',
              textAlign: 'center',
            }}
          >
            <p
              role="alert"
              style={{ fontSize: 16, fontWeight: 600, color: 'var(--error, #ef4444)' }}
            >
              {t('expiredTitle')}
            </p>
            <p style={{ fontSize: 14, color: 'var(--muted-foreground, #6b7280)' }}>
              {t('expiredDetail')}
            </p>
          </div>
        )}

        {status === 'invalid' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              alignItems: 'center',
              textAlign: 'center',
            }}
          >
            <p
              role="alert"
              style={{ fontSize: 16, fontWeight: 600, color: 'var(--error, #ef4444)' }}
            >
              {t('invalidTitle')}
            </p>
            <p style={{ fontSize: 14, color: 'var(--muted-foreground, #6b7280)' }}>
              {t('invalidDetail')}
            </p>
          </div>
        )}
      </Box>
    </Container>
  );
}
