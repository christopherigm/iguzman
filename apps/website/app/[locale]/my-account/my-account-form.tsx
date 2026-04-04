'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useRouter } from '@repo/i18n/navigation';
import { Container } from '@repo/ui/core-elements/container';
import { Box } from '@repo/ui/core-elements/box';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Button } from '@repo/ui/core-elements/button';
import { Typography } from '@repo/ui/core-elements/typography';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import {
  getAccessToken,
  getProfile,
  updateProfile,
  uploadProfilePicture,
  changePassword,
  getPasskeyCredentials,
  deletePasskeyCredential,
  registerPasskey,
  ApiError,
  type UserProfile,
} from '@/lib/auth';
import {
  AdminImageUploader,
  type NewImage,
} from '@/components/admin-image-uploader/admin-image-uploader';
import './my-account-form.css';

interface Props {
  apiUrl: string;
}

function SuccessMessage({ message }: { message: string }) {
  return (
    <Typography variant="caption" className="my-account__success">
      {message}
    </Typography>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <Typography variant="caption" role="alert" className="my-account__error">
      {message}
    </Typography>
  );
}

// ── Profile section ───────────────────────────────────────────────────────────

function ProfileSection({
  profile,
  apiUrl,
  accessToken,
}: {
  profile: UserProfile;
  apiUrl: string;
  accessToken: string;
}) {
  const t = useTranslations('MyAccountPage');
  const [firstName, setFirstName] = useState(profile.first_name);
  const [lastName, setLastName] = useState(profile.last_name);
  const [pendingPicture, setPendingPicture] = useState<NewImage | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const existingImages = profile.profile_picture
    ? [{ id: 0, url: profile.profile_picture }]
    : [];

  function handleImagesChange(newImages: NewImage[]) {
    setPendingPicture(newImages[0] ?? null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const tasks: Promise<unknown>[] = [
        updateProfile({ first_name: firstName, last_name: lastName }, accessToken, apiUrl),
      ];
      if (pendingPicture) {
        tasks.push(uploadProfilePicture(pendingPicture.base64, accessToken, apiUrl));
      }
      await Promise.all(tasks);
      setPendingPicture(null);
      setSuccess(t('profileSaved'));
    } catch {
      setError(t('profileError'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box
      width="100%"
      maxWidth={520}
      padding={10}
      borderRadius={12}
      flexDirection="column"
      gap={20}
      elevation={5}
      backgroundColor="var(--surface-1)"
    >
      <Typography as="h2" variant="h3" fontWeight={600} className="my-account__section-title">
        {t('profileSection')}
      </Typography>
      <form onSubmit={handleSubmit} className="my-account__form">
        <AdminImageUploader
          existingImages={existingImages}
          onChange={(newImages) => handleImagesChange(newImages)}
          maxImages={1}
          label={t('profilePictureLabel')}
        />
        <TextInput
          label={t('emailLabel')}
          type="email"
          value={profile.email}
          disabled
        />
        <Box display="flex" gap={12}>
          <TextInput
            label={t('firstNameLabel')}
            type="text"
            value={firstName}
            onChange={setFirstName}
            autoComplete="given-name"
          />
          <TextInput
            label={t('lastNameLabel')}
            type="text"
            value={lastName}
            onChange={setLastName}
            autoComplete="family-name"
          />
        </Box>
        {success && <SuccessMessage message={success} />}
        {error && <ErrorMessage message={error} />}
        {loading && <ProgressBar label={t('savingProfile')} />}
        <Button
          text={loading ? t('savingProfile') : t('saveProfile')}
          type="submit"
          styles={{ width: '100%', padding: '10px', fontSize: 14, marginTop: 4 }}
        />
      </form>
    </Box>
  );
}

// ── Change-password section ───────────────────────────────────────────────────

function ChangePasswordSection({
  apiUrl,
  accessToken,
}: {
  apiUrl: string;
  accessToken: string;
}) {
  const t = useTranslations('MyAccountPage');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword !== confirmPassword) {
      setError(t('passwordMismatch'));
      return;
    }

    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword, confirmPassword, accessToken, apiUrl);
      setSuccess(t('passwordSaved'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        const data = err.data as Record<string, unknown>;
        if (data.current_password) {
          setError(t('passwordWrong'));
        } else {
          setError(t('passwordError'));
        }
      } else {
        setError(t('passwordError'));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box
      width="100%"
      maxWidth={520}
      padding={10}
      borderRadius={12}
      flexDirection="column"
      gap={20}
      elevation={5}
      backgroundColor="var(--surface-1)"
    >
      <Typography as="h2" variant="h3" fontWeight={600} className="my-account__section-title">
        {t('securitySection')}
      </Typography>
      <form onSubmit={handleSubmit} className="my-account__form">
        <TextInput
          label={t('currentPasswordLabel')}
          type="password"
          value={currentPassword}
          onChange={setCurrentPassword}
          required
          autoComplete="current-password"
        />
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
          value={confirmPassword}
          onChange={setConfirmPassword}
          required
          autoComplete="new-password"
        />
        {success && <SuccessMessage message={success} />}
        {error && <ErrorMessage message={error} />}
        {loading && <ProgressBar label={t('savingPassword')} />}
        <Button
          text={loading ? t('savingPassword') : t('savePassword')}
          type="submit"
          styles={{ width: '100%', padding: '10px', fontSize: 14, marginTop: 4 }}
        />
      </form>
    </Box>
  );
}

// ── Passkey section ───────────────────────────────────────────────────────────

function PasskeySection({
  apiUrl,
  accessToken,
}: {
  apiUrl: string;
  accessToken: string;
}) {
  const t = useTranslations('MyAccountPage');
  const [credentials, setCredentials] = useState<
    { id: number; name: string; created_at: string }[]
  >([]);
  const [loadingCreds, setLoadingCreds] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [addingPasskey, setAddingPasskey] = useState(false);
  const [toast, setToast] = useState<{ message: string; isError: boolean } | null>(null);

  useEffect(() => {
    getPasskeyCredentials(apiUrl, accessToken)
      .then(({ credentials: creds }) => setCredentials(creds))
      .catch(() => setCredentials([]))
      .finally(() => setLoadingCreds(false));
  }, [apiUrl, accessToken]);

  async function handleDelete() {
    if (confirmDeleteId === null) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    setDeletingId(id);
    try {
      await deletePasskeyCredential(apiUrl, accessToken, id);
      setCredentials((prev) => prev.filter((c) => c.id !== id));
      setToast({ message: t('passkeyDeleted'), isError: false });
    } catch {
      setToast({ message: t('passkeyDeleteError'), isError: true });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleAddPasskey() {
    setAddingPasskey(true);
    setToast(null);
    try {
      await registerPasskey(apiUrl, accessToken);
      const { credentials: creds } = await getPasskeyCredentials(apiUrl, accessToken);
      setCredentials(creds);
      setToast({ message: t('passkeyAdded'), isError: false });
    } catch {
      setToast({ message: t('passkeyAddError'), isError: true });
    } finally {
      setAddingPasskey(false);
    }
  }

  return (
    <>
      {confirmDeleteId !== null && (
        <ConfirmationModal
          title={t('confirmDeletePasskeyTitle')}
          text={t('confirmDeletePasskeyText')}
          okCallback={handleDelete}
          cancelCallback={() => setConfirmDeleteId(null)}
        />
      )}
      <Box
        width="100%"
        maxWidth={520}
        padding={10}
        borderRadius={12}
        flexDirection="column"
        gap={20}
        elevation={5}
        backgroundColor="var(--surface-1)"
      >
        <Typography as="h2" variant="h3" fontWeight={600} className="my-account__section-title">
          {t('passkeySection')}
        </Typography>
        <Box display="flex" flexDirection="column" gap={8}>
          {loadingCreds && <ProgressBar />}
          {!loadingCreds && credentials.length === 0 && (
            <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
              {t('noPasskeys')}
            </Typography>
          )}
          {credentials.map((cred) => (
            <Box key={cred.id} className="my-account__passkey-row">
              <Box display="flex" alignItems="center" gap={10}>
                <Image src="/icons/fingerprint.svg" width={24} height={24} alt="" />
                <Box className="my-account__passkey-meta">
                  <Typography variant="caption" fontWeight={600}>
                    {cred.name}
                  </Typography>
                  <span className="my-account__passkey-date">
                    {new Date(cred.created_at).toLocaleDateString()}
                  </span>
                </Box>
              </Box>
              <Button
                unstyled
                type="button"
                disabled={deletingId === cred.id}
                onClick={() => setConfirmDeleteId(cred.id)}
                aria-label={t('deletePasskey')}
              >
                <Image src="/icons/delete-trash-icon.svg" width={18} height={18} alt="" />
              </Button>
            </Box>
          ))}
        </Box>
        {toast &&
          (toast.isError ? (
            <ErrorMessage message={toast.message} />
          ) : (
            <SuccessMessage message={toast.message} />
          ))}
        {addingPasskey && <ProgressBar />}
        <Button
          text={t('addPasskey')}
          type="button"
          onClick={handleAddPasskey}
          disabled={addingPasskey}
          styles={{ width: '100%', padding: '10px', fontSize: 14, marginTop: 4 }}
        />
      </Box>
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function MyAccountForm({ apiUrl }: Props) {
  const t = useTranslations('MyAccountPage');
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.push('/auth');
      return;
    }
    setAccessToken(token);
    getProfile(token, apiUrl)
      .then(setProfile)
      .catch(() => router.push('/auth'))
      .finally(() => setLoading(false));
  }, [apiUrl, router]);

  if (loading || !profile || !accessToken) {
    return (
      <Container
        display="flex"
        alignItems="center"
        styles={{
          minHeight: '100vh',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <ProgressBar label={t('loading')} />
      </Container>
    );
  }

  return (
    <Container
      display="flex"
      alignItems="center"
      styles={{
        minHeight: '100vh',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        paddingTop: 'var(--ui-navbar-height)',
      }}
      paddingX={10}
    >
      <Box width="100%" maxWidth={520} marginBottom={20} marginTop={20}>
        <Typography as="h1" variant="h2" fontWeight={600} marginBottom={4}>
          {t('title')}
        </Typography>
        <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
          {t('subtitle')}
        </Typography>
      </Box>
      <Box
        display="flex"
        flexDirection="column"
        gap={24}
        width="100%"
        maxWidth={520}
        marginBottom={40}
      >
        <ProfileSection profile={profile} apiUrl={apiUrl} accessToken={accessToken} />
        <ChangePasswordSection apiUrl={apiUrl} accessToken={accessToken} />
        <PasskeySection apiUrl={apiUrl} accessToken={accessToken} />
      </Box>
    </Container>
  );
}
