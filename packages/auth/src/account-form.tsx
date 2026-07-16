"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useRouter } from "@repo/i18n/navigation";
import { Container } from "@repo/ui/core-elements/container";
import { Box } from "@repo/ui/core-elements/box";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Button } from "@repo/ui/core-elements/button";
import { IconButton } from "@repo/ui/core-elements/icon-button";
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
  type PasskeyCredential,
  type UserProfile,
} from "./client";
import { isPasswordValid, mapPasswordErrors } from "./password-policy";
import { PasswordRequirements } from "./password-requirements";
import { ErrorMessage, SuccessMessage } from "./auth-message";
import "./account-form.css";

/**
 * The account page - profile, password and passkeys - shared by every frontend.
 *
 * Text comes from the app's own `AccountPage` namespace, so branding stays per
 * app; only `PasswordPolicy` is shared (via `@repo/i18n`).
 *
 * Needs `/icons/fingerprint.svg` and `/icons/delete-trash-icon.svg` in the app's
 * `public/`, and the app's `next.config.js` must allowlist the API host under
 * `images.remotePatterns` for the avatar to render.
 */

/** The card every section is wrapped in. */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
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
      <Typography as="h2" variant="h3" fontWeight={600} marginBottom={4}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function ProfileSection({ profile }: { profile: UserProfile }) {
  const t = useTranslations("AccountPage");
  const router = useRouter();
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
      // The name lives in the session; re-render the server so the navbar picks
      // up the reissued token rather than showing the old name.
      router.refresh();
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
    <Section title={t("profileSection")}>
      <form onSubmit={handleSubmit} className="account-form__form">
        <Box display="flex" alignItems="center" gap={16}>
          {pendingPicture ? (
            // The pending pick is a data: URL that next/image cannot optimise.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pendingPicture} alt="" className="account-form__avatar" />
          ) : profile.profile_picture ? (
            <Image
              src={profile.profile_picture}
              width={72}
              height={72}
              alt=""
              className="account-form__avatar"
            />
          ) : (
            <Box
              display="flex"
              alignItems="center"
              justifyContent="center"
              width={72}
              height={72}
              borderRadius="50%"
              backgroundColor="var(--primary, #06b6d4)"
              color="#fff"
              styles={{
                fontSize: "1.75rem",
                fontWeight: 600,
                flexShrink: 0,
                userSelect: "none",
              }}
              aria-hidden={true}
            >
              {initials}
            </Box>
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
        </Box>
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
    </Section>
  );
}

function ChangePasswordSection({ profile }: { profile: UserProfile }) {
  const t = useTranslations("AccountPage");
  const tPolicy = useTranslations("PasswordPolicy");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Django rejects a password too similar to these, so the checklist needs them
  // to mirror that rule in the browser.
  const attributes = {
    email: profile.email,
    firstName: profile.first_name,
    lastName: profile.last_name,
  };
  // The API is the authority; this only gates the rules the browser can check.
  const passwordAccepted = isPasswordValid(newPassword, attributes);

  function handleNewPasswordChange(value: string) {
    setNewPassword(value);
    // A rejection describes the password that was submitted, not this one.
    setPasswordError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPasswordError(null);
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
        // The policy the browser cannot check (e.g. the common-password list)
        // is only enforced server-side, so surface what the API rejected.
        const rejections = mapPasswordErrors(data, "new_password");
        if (rejections.length > 0) {
          setPasswordError(
            rejections
              .map((r) => (r.translated ? tPolicy(r.key, r.values) : r.text))
              .join(" "),
          );
        } else {
          setError(
            data.current_password ? t("passwordWrong") : t("passwordError"),
          );
        }
      } else {
        setError(t("passwordError"));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section title={t("securitySection")}>
      <form onSubmit={handleSubmit} className="account-form__form">
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
          onChange={handleNewPasswordChange}
          required
          autoComplete="new-password"
          error={passwordError ?? undefined}
        />
        <PasswordRequirements password={newPassword} attributes={attributes} />
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
          disabled={
            !currentPassword ||
            !passwordAccepted ||
            !confirmPassword ||
            newPassword !== confirmPassword
          }
        />
      </form>
    </Section>
  );
}

function PasskeySection() {
  const t = useTranslations("AccountPage");
  const tCommon = useTranslations("Common");
  const [credentials, setCredentials] = useState<PasskeyCredential[]>([]);
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
          okLabel={tCommon("ok")}
          cancelLabel={tCommon("cancel")}
        />
      )}
      <Section title={t("passkeySection")}>
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
            <Box
              key={cred.id}
              display="flex"
              alignItems="center"
              justifyContent="space-between"
              gap={12}
              paddingX={12}
              paddingY={10}
              borderRadius={8}
              border="1px solid var(--border, #e5e7eb)"
            >
              <Box display="flex" alignItems="center" gap={10}>
                <Image
                  src="/icons/fingerprint.svg"
                  width={24}
                  height={24}
                  alt=""
                />
                <Box
                  display="flex"
                  flexDirection="column"
                  gap={2}
                  styles={{ minWidth: 0 }}
                >
                  <Typography variant="caption" fontWeight={600}>
                    {cred.name}
                  </Typography>
                  <Typography
                    as="span"
                    variant="label"
                    color="var(--muted-foreground, #6b7280)"
                  >
                    {new Date(cred.created_at).toLocaleDateString()}
                  </Typography>
                </Box>
              </Box>
              <IconButton
                type="button"
                icon="/icons/delete-trash-icon.svg"
                kind="error"
                size="sm"
                disabled={deletingId === cred.id}
                onClick={() => setConfirmDeleteId(cred.id)}
                aria-label={t("deletePasskey")}
                title={t("deletePasskey")}
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
      </Section>
    </>
  );
}

export function AccountForm() {
  const t = useTranslations("AccountPage");
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // proxy.ts already guards this route; a failure here means the session died
  // between the request and this fetch, so fall back to /auth.
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
        <ChangePasswordSection profile={profile} />
        <PasskeySection />
      </Box>
    </Container>
  );
}
