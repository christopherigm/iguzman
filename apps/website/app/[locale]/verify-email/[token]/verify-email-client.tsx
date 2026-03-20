'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@repo/i18n/navigation';
import { Container } from '@repo/ui/core-elements/container';
import { Box } from '@repo/ui/core-elements/box';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { Typography } from '@repo/ui/core-elements/typography';
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
          <Box display="flex" flexDirection="column" gap={16}>
            <ProgressBar label={t('loading')} />
            <Typography
              variant="body-sm"
              color="var(--muted-foreground, #6b7280)"
              textAlign="center"
            >
              {t('loading')}
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
            <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
              {t('redirecting', { seconds: countdown })}
            </Typography>
            <ProgressBar
              value={((REDIRECT_SECONDS - countdown) / REDIRECT_SECONDS) * 100}
              label={t('redirectProgress')}
            />
          </Box>
        )}

        {status === 'expired' && (
          <Box
            display="flex"
            flexDirection="column"
            gap={12}
            alignItems="center"
            styles={{ textAlign: 'center' }}
          >
            <Typography variant="h5" role="alert" color="var(--error, #ef4444)">
              {t('expiredTitle')}
            </Typography>
            <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
              {t('expiredDetail')}
            </Typography>
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
          </Box>
        )}
      </Box>
    </Container>
  );
}
