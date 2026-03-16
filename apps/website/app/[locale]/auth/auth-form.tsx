'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@repo/i18n/navigation';
import { Container } from '@repo/ui/core-elements/container';
import { Box } from '@repo/ui/core-elements/box';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Button } from '@repo/ui/core-elements/button';
import {
  login,
  storeTokens,
  LoginError,
  signUp,
  requestPasswordReset,
  ApiError,
} from '@/lib/auth';

type Tab = 'sign-in' | 'sign-up' | 'reset-password';

interface Props {
  systemId: number;
  apiUrl: string;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function ErrorMessage({ message }: { message: string }) {
  return (
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
      {message}
    </p>
  );
}

function LinkButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        color: 'var(--muted-foreground, #6b7280)',
        fontSize: 13,
        cursor: 'pointer',
        textDecoration: 'underline',
        padding: 0,
      }}
    >
      {label}
    </button>
  );
}

// ── Sign-in tab ───────────────────────────────────────────────────────────────

function SignInTab({
  systemId,
  apiUrl,
  switchTab,
}: {
  systemId: number;
  apiUrl: string;
  switchTab: (tab: Tab) => void;
}) {
  const t = useTranslations('AuthPage');
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
      const { access, refresh } = await login(
        {
          email,
          password,
          system_id: systemId,
        },
        apiUrl,
      );
      storeTokens(access, refresh);
      router.push('/');
    } catch (err) {
      if (err instanceof LoginError && err.status === 401) {
        setError(t('signIn.errorInvalidCredentials'));
      } else {
        setError(t('signIn.errorGeneric'));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            color: 'var(--foreground)',
            marginBottom: 4,
          }}
        >
          {t('signIn.title')}
        </h1>
        <p
          style={{
            fontSize: 14,
            color: 'var(--muted-foreground, #6b7280)',
            marginBottom: 8,
          }}
        >
          {t('signIn.subtitle')}
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <TextInput
          label={t('signIn.emailLabel')}
          type="email"
          value={email}
          onChange={setEmail}
          required
          autoComplete="email"
        />
        <TextInput
          label={t('signIn.passwordLabel')}
          type="password"
          value={password}
          onChange={setPassword}
          required
          autoComplete="current-password"
        />
        {error && <ErrorMessage message={error} />}
        <Button
          text={loading ? t('signIn.submitting') : t('signIn.submitButton')}
          type="submit"
          styles={{
            width: '100%',
            padding: '10px',
            fontSize: 14,
            marginTop: 4,
          }}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <LinkButton
            onClick={() => switchTab('reset-password')}
            label={t('signIn.forgotPassword')}
          />
          <LinkButton
            onClick={() => switchTab('sign-up')}
            label={t('signIn.noAccount')}
          />
        </div>
      </form>
    </>
  );
}

// ── Sign-up tab ───────────────────────────────────────────────────────────────

function SignUpTab({
  systemId,
  apiUrl,
  switchTab,
}: {
  systemId: number;
  apiUrl: string;
  switchTab: (tab: Tab) => void;
}) {
  const t = useTranslations('AuthPage');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (password !== password2) {
      setError(t('signUp.errorPasswordMismatch'));
      return;
    }

    setLoading(true);
    try {
      await signUp(
        {
          email,
          password,
          password2,
          system_id: systemId,
          first_name: firstName || undefined,
          last_name: lastName || undefined,
        },
        apiUrl,
      );
      setSuccess(t('signUp.successDetail'));
    } catch (err) {
      if (err instanceof ApiError) {
        const emailErr = (err.data as Record<string, string[]>)?.email;
        if (emailErr) {
          setError(
            Array.isArray(emailErr)
              ? (emailErr[0] ?? t('signUp.errorGeneric'))
              : String(emailErr),
          );
        } else {
          setError(t('signUp.errorGeneric'));
        }
      } else {
        setError(t('signUp.errorGeneric'));
      }
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <p
          style={{ fontSize: 14, color: 'var(--foreground)', lineHeight: 1.6 }}
        >
          {success}
        </p>
        <LinkButton
          onClick={() => switchTab('sign-in')}
          label={t('signUp.haveAccount')}
        />
      </div>
    );
  }

  return (
    <>
      <div>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            color: 'var(--foreground)',
            marginBottom: 4,
          }}
        >
          {t('signUp.title')}
        </h1>
        <p
          style={{
            fontSize: 14,
            color: 'var(--muted-foreground, #6b7280)',
            marginBottom: 8,
          }}
        >
          {t('signUp.subtitle')}
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <div style={{ display: 'flex', gap: 12 }}>
          <TextInput
            label={t('signUp.firstNameLabel')}
            type="text"
            value={firstName}
            onChange={setFirstName}
            autoComplete="given-name"
          />
          <TextInput
            label={t('signUp.lastNameLabel')}
            type="text"
            value={lastName}
            onChange={setLastName}
            autoComplete="family-name"
          />
        </div>
        <TextInput
          label={t('signUp.emailLabel')}
          type="email"
          value={email}
          onChange={setEmail}
          required
          autoComplete="email"
        />
        <TextInput
          label={t('signUp.passwordLabel')}
          type="password"
          value={password}
          onChange={setPassword}
          required
          autoComplete="new-password"
        />
        <TextInput
          label={t('signUp.confirmPasswordLabel')}
          type="password"
          value={password2}
          onChange={setPassword2}
          required
          autoComplete="new-password"
        />
        {error && <ErrorMessage message={error} />}
        <Button
          text={loading ? t('signUp.submitting') : t('signUp.submitButton')}
          type="submit"
          styles={{
            width: '100%',
            padding: '10px',
            fontSize: 14,
            marginTop: 4,
          }}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <LinkButton
            onClick={() => switchTab('sign-in')}
            label={t('signUp.haveAccount')}
          />
          <LinkButton
            onClick={() => switchTab('reset-password')}
            label={t('signUp.forgotPassword')}
          />
        </div>
      </form>
    </>
  );
}

// ── Reset-password tab ────────────────────────────────────────────────────────

function ResetPasswordTab({
  systemId,
  apiUrl,
  switchTab,
}: {
  systemId: number;
  apiUrl: string;
  switchTab: (tab: Tab) => void;
}) {
  const t = useTranslations('AuthPage');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      await requestPasswordReset(email, systemId, apiUrl);
      setSuccess(t('resetPassword.successDetail'));
    } catch {
      setError(t('resetPassword.errorGeneric'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            color: 'var(--foreground)',
            marginBottom: 4,
          }}
        >
          {t('resetPassword.title')}
        </h1>
        <p
          style={{
            fontSize: 14,
            color: 'var(--muted-foreground, #6b7280)',
            marginBottom: 8,
          }}
        >
          {t('resetPassword.subtitle')}
        </p>
      </div>

      {success ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p
            style={{
              fontSize: 14,
              color: 'var(--foreground)',
              lineHeight: 1.6,
            }}
          >
            {success}
          </p>
          <LinkButton
            onClick={() => switchTab('sign-in')}
            label={t('resetPassword.backToSignIn')}
          />
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          <TextInput
            label={t('resetPassword.emailLabel')}
            type="email"
            value={email}
            onChange={setEmail}
            required
            autoComplete="email"
          />
          {error && <ErrorMessage message={error} />}
          <Button
            text={
              loading
                ? t('resetPassword.submitting')
                : t('resetPassword.submitButton')
            }
            type="submit"
            styles={{
              width: '100%',
              padding: '10px',
              fontSize: 14,
              marginTop: 4,
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <LinkButton
              onClick={() => switchTab('sign-in')}
              label={t('resetPassword.backToSignIn')}
            />
          </div>
        </form>
      )}
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function SignInForm({ systemId, apiUrl }: Props) {
  const t = useTranslations('AuthPage');
  const [tab, setTab] = useState<Tab>('sign-in');

  useEffect(() => {
    const readHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'sign-up' || hash === 'reset-password') {
        setTab(hash);
      } else {
        setTab('sign-in');
      }
    };
    readHash();
    window.addEventListener('hashchange', readHash);
    return () => window.removeEventListener('hashchange', readHash);
  }, []);

  const switchTab = (newTab: Tab) => {
    window.location.hash = newTab;
    setTab(newTab);
  };

  const tabLabels: Record<Tab, string> = {
    'sign-in': t('tabSignIn'),
    'sign-up': t('tabSignUp'),
    'reset-password': t('tabReset'),
  };

  return (
    <Container
      display="flex"
      alignItems="center"
      justifyContent="center"
      styles={{ minHeight: '100vh' }}
      paddingX={10}
    >
      <Box
        width={420}
        padding={16}
        borderRadius={12}
        flexDirection="column"
        gap={20}
        elevation={5}
        backgroundColor="var(--surface-1)"
      >
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border, #e5e7eb)',
            marginBottom: 4,
          }}
        >
          {(['sign-in', 'sign-up', 'reset-password'] as Tab[]).map((id) => (
            <button
              key={id}
              onClick={() => switchTab(id)}
              style={{
                flex: 1,
                padding: '10px 4px',
                fontSize: 13,
                fontWeight: tab === id ? 600 : 400,
                color:
                  tab === id
                    ? 'var(--foreground)'
                    : 'var(--muted-foreground, #6b7280)',
                background: 'none',
                border: 'none',
                borderBottom:
                  tab === id
                    ? '2px solid var(--foreground)'
                    : '2px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s',
                marginBottom: -1,
              }}
            >
              {tabLabels[id]}
            </button>
          ))}
        </div>

        {tab === 'sign-in' && (
          <SignInTab
            systemId={systemId}
            apiUrl={apiUrl}
            switchTab={switchTab}
          />
        )}
        {tab === 'sign-up' && (
          <SignUpTab
            systemId={systemId}
            apiUrl={apiUrl}
            switchTab={switchTab}
          />
        )}
        {tab === 'reset-password' && (
          <ResetPasswordTab
            systemId={systemId}
            apiUrl={apiUrl}
            switchTab={switchTab}
          />
        )}
      </Box>
    </Container>
  );
}
