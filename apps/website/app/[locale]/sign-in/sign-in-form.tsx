'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@repo/i18n/navigation';
import { Container } from '@repo/ui/core-elements/container';
import { Box } from '@repo/ui/core-elements/box';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Button } from '@repo/ui/core-elements/button';
import { login, storeTokens, LoginError } from '@/lib/auth';

interface Props {
  systemId: number;
}

export function SignInForm({ systemId }: Props) {
  const t = useTranslations('SignInPage');
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { access, refresh } = await login({
        email,
        password,
        system_id: systemId,
      });
      storeTokens(access, refresh);
      router.push('/');
    } catch (err) {
      if (err instanceof LoginError && err.status === 401) {
        setError(t('errorInvalidCredentials'));
      } else {
        setError(t('errorGeneric'));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Container
      display="flex"
      alignItems="center"
      justifyContent="center"
      styles={{ minHeight: '100vh' }}
    >
      <Box
        width={380}
        padding={32}
        borderRadius={12}
        flexDirection="column"
        gap={20}
        styles={{ boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}
      >
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            color: 'var(--foreground)',
            marginBottom: 4,
          }}
        >
          {t('title')}
        </h1>
        <p
          style={{
            fontSize: 14,
            color: 'var(--muted-foreground, #6b7280)',
            marginBottom: 8,
          }}
        >
          {t('subtitle')}
        </p>

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          <TextInput
            label={t('emailLabel')}
            type="email"
            value={email}
            onChange={setEmail}
            required
            autoComplete="email"
          />
          <TextInput
            label={t('passwordLabel')}
            type="password"
            value={password}
            onChange={setPassword}
            required
            autoComplete="current-password"
          />

          {error && (
            <p
              role="alert"
              style={{
                fontSize: 13,
                color: 'var(--error, #ef4444)',
                padding: '8px 12px',
                borderRadius: 6,
                background: 'var(--error-bg, rgba(239,68,68,0.08))',
              }}
            >
              {error}
            </p>
          )}

          <Button
            text={loading ? t('signingIn') : t('submitButton')}
            type="submit"
            styles={{ width: '100%', padding: '10px', fontSize: 14, marginTop: 4 }}
          />
        </form>
      </Box>
    </Container>
  );
}
