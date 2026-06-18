"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useRouter } from "@repo/i18n/navigation";
import { Container } from "@repo/ui/core-elements/container";
import { Box } from "@repo/ui/core-elements/box";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import {
  getProfile,
  updateProfile,
  uploadProfilePicture,
  changePassword,
  getPasskeyCredentials,
  deletePasskeyCredential,
  registerPasskey,
  ApiError,
  type UserProfile,
} from "@/lib/auth";
import "./account-form.css";

function SuccessMessage({ message }: { message: string }) {
  return (
    <Typography variant="caption" className="account__success">
      {message}
    </Typography>
  );
}
function ErrorMessage({ message }: { message: string }) {
  return (
    <Typography variant="caption" role="alert" className="account__error">
      {message}
    </Typography>
  );
}

function ProfileSection({ profile }: { profile: UserProfile }) {
  const t = useTranslations("AccountPage");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [firstName, setFirstName] = useState(profile.first_name);
  const [lastName, setLastName] = useState(profile.last_name);
  const [pendingPicture, setPendingPicture] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPendingPicture(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const tasks: Promise<unknown>[] = [
        updateProfile({ first_name: firstName, last_name: lastName }),
      ];
      if (pendingPicture) tasks.push(uploadProfilePicture(pendingPicture));
      await Promise.all(tasks);
      setPendingPicture(null);
      setSuccess(t("profileSaved"));
    } catch {
      setError(t("profileError"));
    } finally {
      setLoading(false);
    }
  }

  const initials = (
    profile.first_name[0] ??
    profile.email[0] ??
    "?"
  ).toUpperCase();

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
      <Typography
        as="h2"
        variant="h3"
        fontWeight={600}
        className="account__section-title"
      >
        {t("profileSection")}
      </Typography>
      <form onSubmit={handleSubmit} className="account__form">
        <div className="account__picture-area">
          {pendingPicture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pendingPicture} alt="" className="account__avatar" />
          ) : profile.profile_picture ? (
            <Image
              src={profile.profile_picture}
              width={72}
              height={72}
              alt=""
              className="account__avatar"
            />
          ) : (
            <div className="account__avatar-initials" aria-hidden="true">
              {initials}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            aria-hidden="true"
            accept="image/*"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
          <Button
            text={t("changePhoto")}
            type="button"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          />
        </div>
        <TextInput
          label={t("emailLabel")}
          type="email"
          value={profile.email}
          disabled
        />
        <Box display="flex" gap={12}>
          <TextInput
            label={t("firstNameLabel")}
            type="text"
            value={firstName}
            onChange={setFirstName}
            autoComplete="given-name"
          />
          <TextInput
            label={t("lastNameLabel")}
            type="text"
            value={lastName}
            onChange={setLastName}
            autoComplete="family-name"
          />
        </Box>
        {success && <SuccessMessage message={success} />}
        {error && <ErrorMessage message={error} />}
        {loading && <ProgressBar label={t("savingProfile")} />}
        <Button
          text={loading ? t("savingProfile") : t("saveProfile")}
          type="submit"
          size="md"
          width="100%"
          marginTop={4}
          kind="primary"
        />
      </form>
    </Box>
  );
}

function ChangePasswordSection() {
  const t = useTranslations("AccountPage");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (newPassword !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }
    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword, confirmPassword);
      setSuccess(t("passwordSaved"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        const data = err.data as Record<string, unknown>;
        setError(
          data.current_password ? t("passwordWrong") : t("passwordError"),
        );
      } else {
        setError(t("passwordError"));
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
      <Typography
        as="h2"
        variant="h3"
        fontWeight={600}
        className="account__section-title"
      >
        {t("securitySection")}
      </Typography>
      <form onSubmit={handleSubmit} className="account__form">
        <TextInput
          label={t("currentPasswordLabel")}
          type="password"
          value={currentPassword}
          onChange={setCurrentPassword}
          required
          autoComplete="current-password"
        />
        <TextInput
          label={t("newPasswordLabel")}
          type="password"
          value={newPassword}
          onChange={setNewPassword}
          required
          autoComplete="new-password"
        />
        <TextInput
          label={t("confirmPasswordLabel")}
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          required
          autoComplete="new-password"
        />
        {success && <SuccessMessage message={success} />}
        {error && <ErrorMessage message={error} />}
        {loading && <ProgressBar label={t("savingPassword")} />}
        <Button
          text={loading ? t("savingPassword") : t("savePassword")}
          type="submit"
          size="md"
          width="100%"
          marginTop={4}
          kind="primary"
        />
      </form>
    </Box>
  );
}

function PasskeySection() {
  const t = useTranslations("AccountPage");
  const [credentials, setCredentials] = useState<
    { id: number; name: string; created_at: string }[]
  >([]);
  const [loadingCreds, setLoadingCreds] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [addingPasskey, setAddingPasskey] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    isError: boolean;
  } | null>(null);

  useEffect(() => {
    getPasskeyCredentials()
      .then(({ credentials: creds }) => setCredentials(creds))
      .catch(() => setCredentials([]))
      .finally(() => setLoadingCreds(false));
  }, []);

  async function handleDelete() {
    if (confirmDeleteId === null) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    setDeletingId(id);
    try {
      await deletePasskeyCredential(id);
      setCredentials((prev) => prev.filter((c) => c.id !== id));
      setToast({ message: t("passkeyDeleted"), isError: false });
    } catch {
      setToast({ message: t("passkeyDeleteError"), isError: true });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleAddPasskey() {
    setAddingPasskey(true);
    setToast(null);
    try {
      await registerPasskey();
      const { credentials: creds } = await getPasskeyCredentials();
      setCredentials(creds);
      setToast({ message: t("passkeyAdded"), isError: false });
    } catch {
      setToast({ message: t("passkeyAddError"), isError: true });
    } finally {
      setAddingPasskey(false);
    }
  }

  return (
    <>
      {confirmDeleteId !== null && (
        <ConfirmationModal
          title={t("confirmDeletePasskeyTitle")}
          text={t("confirmDeletePasskeyText")}
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
        <Typography
          as="h2"
          variant="h3"
          fontWeight={600}
          className="account__section-title"
        >
          {t("passkeySection")}
        </Typography>
        <Box display="flex" flexDirection="column" gap={8}>
          {loadingCreds && <ProgressBar />}
          {!loadingCreds && credentials.length === 0 && (
            <Typography
              variant="caption"
              color="var(--muted-foreground, #6b7280)"
            >
              {t("noPasskeys")}
            </Typography>
          )}
          {credentials.map((cred) => (
            <Box key={cred.id} className="account__passkey-row">
              <Box display="flex" alignItems="center" gap={10}>
                <Image
                  src="/icons/fingerprint.svg"
                  width={24}
                  height={24}
                  alt=""
                />
                <Box className="account__passkey-meta">
                  <Typography variant="caption" fontWeight={600}>
                    {cred.name}
                  </Typography>
                  <span className="account__passkey-date">
                    {new Date(cred.created_at).toLocaleDateString()}
                  </span>
                </Box>
              </Box>
              <Button
                text={t("deletePasskey")}
                type="button"
                size="sm"
                kind="error"
                disabled={deletingId === cred.id}
                onClick={() => setConfirmDeleteId(cred.id)}
              />
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
          text={t("addPasskey")}
          type="button"
          onClick={handleAddPasskey}
          disabled={addingPasskey}
          size="md"
          width="100%"
          marginTop={4}
          kind="primary"
        />
      </Box>
    </>
  );
}

export function AccountForm() {
  const t = useTranslations("AccountPage");
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProfile()
      .then(setProfile)
      .catch(() => router.push("/auth"))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading || !profile) {
    return (
      <Container
        display="flex"
        alignItems="center"
        styles={{
          minHeight: "100vh",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <ProgressBar label={t("loading")} />
      </Container>
    );
  }

  return (
    <Container
      display="flex"
      alignItems="center"
      styles={{
        minHeight: "100vh",
        flexDirection: "column",
        justifyContent: "flex-start",
        paddingTop: "var(--ui-navbar-height)",
      }}
      paddingX={10}
    >
      <Box width="100%" maxWidth={520} marginBottom={20} marginTop={20}>
        <Typography as="h1" variant="h2" fontWeight={600} marginBottom={4}>
          {t("title")}
        </Typography>
        <Typography variant="body" color="var(--muted-foreground, #6b7280)">
          {t("subtitle")}
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
        <ProfileSection profile={profile} />
        <ChangePasswordSection />
        <PasskeySection />
      </Box>
    </Container>
  );
}
