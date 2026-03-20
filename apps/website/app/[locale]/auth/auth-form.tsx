'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@repo/i18n/navigation';
import { Container } from '@repo/ui/core-elements/container';
import { Box } from '@repo/ui/core-elements/box';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Button } from '@repo/ui/core-elements/button';
import { LinkButton } from '@repo/ui/core-elements/link-button';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { Typography } from '@repo/ui/core-elements/typography';
import './auth-form.css';
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
    <Typography variant="caption" role="alert" className="auth-form__error">
      {message}
    </Typography>
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
      <form onSubmit={handleSubmit} className="auth-form__form">
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
        {loading && <ProgressBar label={t('signIn.submitting')} />}
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
        <Box display="flex" flexDirection="column" gap={8} alignItems="center">
          <LinkButton
            onClick={() => switchTab('reset-password')}
            label={t('signIn.forgotPassword')}
          />
          <LinkButton
            onClick={() => switchTab('sign-up')}
            label={t('signIn.noAccount')}
          />
        </Box>
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
      <Box
        display="flex"
        flexDirection="column"
        gap={16}
        alignItems="center"
        styles={{ textAlign: 'center' }}
      >
        <Typography variant="body-sm">{success}</Typography>
        <LinkButton
          onClick={() => switchTab('sign-in')}
          label={t('signUp.haveAccount')}
        />
      </Box>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="auth-form__form">
        <Box display="flex" gap={12}>
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
        </Box>
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
        {loading && <ProgressBar label={t('signUp.submitting')} />}
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
        <Box display="flex" flexDirection="column" gap={8} alignItems="center">
          <LinkButton
            onClick={() => switchTab('sign-in')}
            label={t('signUp.haveAccount')}
          />
          <LinkButton
            onClick={() => switchTab('reset-password')}
            label={t('signUp.forgotPassword')}
          />
        </Box>
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
      {success ? (
        <Box display="flex" flexDirection="column" gap={16}>
          <Typography variant="body-sm">{success}</Typography>
          <LinkButton
            onClick={() => switchTab('sign-in')}
            label={t('resetPassword.backToSignIn')}
          />
        </Box>
      ) : (
        <form onSubmit={handleSubmit} className="auth-form__form">
          <TextInput
            label={t('resetPassword.emailLabel')}
            type="email"
            value={email}
            onChange={setEmail}
            required
            autoComplete="email"
          />
          {error && <ErrorMessage message={error} />}
          {loading && <ProgressBar label={t('resetPassword.submitting')} />}
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
          <Box display="flex" justifyContent="center">
            <LinkButton
              onClick={() => switchTab('sign-in')}
              label={t('resetPassword.backToSignIn')}
            />
          </Box>
        </form>
      )}
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function SignInForm({ systemId, apiUrl }: Props) {
  const t = useTranslations('AuthPage');
  const [tab, setTab] = useState<Tab>('sign-in');

  const tabHeadings: Record<Tab, { title: string; subtitle: string }> = {
    'sign-in': { title: t('signIn.title'), subtitle: t('signIn.subtitle') },
    'sign-up': { title: t('signUp.title'), subtitle: t('signUp.subtitle') },
    'reset-password': {
      title: t('resetPassword.title'),
      subtitle: t('resetPassword.subtitle'),
    },
  };

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

  const { title, subtitle } = tabHeadings[tab];

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
          {title}
        </Typography>
        <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
          {subtitle}
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
        <Box className="auth-form__tabs">
          {(['sign-in', 'sign-up', 'reset-password'] as Tab[]).map((id) => (
            <button
              key={id}
              onClick={() => switchTab(id)}
              data-active={String(tab === id)}
              className="auth-form__tab-btn"
            >
              {tabLabels[id]}
            </button>
          ))}
        </Box>

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
