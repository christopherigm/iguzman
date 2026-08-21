"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { use } from "react";
import { updateAdminUser, listAdminUsers } from "@/lib/admin-api";
import { SiblingArrow } from "@/components/admin/sibling-arrows";
import { useAdminSiblings } from "@/hooks/use-admin-siblings";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import { Switch } from "@repo/ui/core-elements/switch";
import { Badge } from "@repo/ui/core-elements/badge";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { useRouter } from "@repo/i18n/navigation";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import "./user-form.css";

type Props = { params: Promise<{ locale: string; id: string }> };

export default function AdminUserFormPage({ params }: Props) {
  const { id } = use(params);
  const t = useTranslations("Admin");
  const router = useRouter();

  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Prev/next through the CMS list, for the arrows beside Save. `systemId` is 0
  // because the users list is not tenant-scoped by a query param - the token
  // already decides whose users these are - and `listAdminUsers` ignores it.
  const siblings = useAdminSiblings({
    basePath: "/admin/users",
    id,
    systemId: 0,
    list: listAdminUsers,
  });

  useEffect(() => {
    listAdminUsers()
      .then((users) => {
        const found = users.find((u) => String(u.id) === id);
        if (found) {
          setUser(found);
          setIsAdmin(Boolean(found.is_admin));
          setIsActive(Boolean(found.is_active));
        } else {
          setError(t("errorLoad"));
        }
      })
      .catch(() => setError(t("errorLoad")))
      .finally(() => setLoading(false));
  }, [id, t]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateAdminUser(Number(id), {
        is_admin: isAdmin,
        is_active: isActive,
      });
      setUser(updated);
      setSuccess(t("saved"));
    } catch {
      setError(t("errorSave"));
    } finally {
      setSaving(false);
    }
  };

  // A failed load is its own answer and replaces the form. A load still in
  // flight is not: the header and its buttons render from the first paint,
  // disabled, rather than appearing under the operator's cursor when the
  // record lands - so everything below reads `user` as possibly absent.
  if (!loading && !user)
    return (
      <Box padding="24px">
        <Typography variant="body">{t("errorLoad")}</Typography>
      </Box>
    );

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t("home"), href: "/" },
          { label: t("breadcrumbAdmin"), href: "/admin" },
          { label: t("users"), href: "/admin/users" },
          { label: t("edit") },
        ]}
      />
      <Box className="uf">
        <Box className="uf__header">
          <Typography as="h1" variant="h3">
            {t("edit")} - {t("users")}
          </Typography>
          <Box display="flex" alignItems="center" gap={8}>
            <Button
              text={t("cancel")}
              size="md"
              onClick={() => router.back()}
            />
            {/* This form has no fixed bottom bar, so the arrows flank the
                header's Save rather than a floating one. */}
            <SiblingArrow direction="prev" siblings={siblings} size="md" />
            <Button
              text={saving ? t("saving") : t("save")}
              onClick={handleSave}
              disabled={saving || loading}
              kind="primary"
              size="md"
            />
            <SiblingArrow direction="next" siblings={siblings} size="md" />
          </Box>
        </Box>

        {/* Save progress - and, on the way in, the record's own load. */}
        {(saving || loading) && <ProgressBar />}

        {error && (
          <Box className="uf__banner uf__banner--error">
            <Typography variant="body">{error}</Typography>
          </Box>
        )}
        {success && (
          <Box className="uf__banner uf__banner--success">
            <Typography variant="body">{success}</Typography>
          </Box>
        )}

        <Box className="uf__card">
          <Box className="uf__meta">
            <Typography as="p" variant="body">
              <strong>Email:</strong> {String(user?.email ?? "")}
            </Typography>
            <Typography as="p" variant="body">
              <strong>{t("firstName") ?? "First Name"}:</strong>{" "}
              {String(user?.first_name ?? "")}
            </Typography>
            <Typography as="p" variant="body">
              <strong>{t("lastName") ?? "Last Name"}:</strong>{" "}
              {String(user?.last_name ?? "")}
            </Typography>
            <Typography as="p" variant="body">
              <strong>{t("role") ?? "Role"}:</strong>{" "}
              <Badge variant="subtle" color={user?.is_admin ? "blue" : "gray"}>
                {user?.is_admin ? t("isAdmin") : t("notAdmin")}
              </Badge>
            </Typography>
          </Box>

          <Box className="uf__toggles">
            <Box className="uf__toggle-row">
              <Switch
                checked={isAdmin}
                onChange={setIsAdmin}
                disabled={loading}
              />
              <Typography as="span" variant="body" fontWeight={500}>
                {t("isAdmin")}
              </Typography>
            </Box>
            <Box className="uf__toggle-row">
              <Switch
                checked={isActive}
                onChange={setIsActive}
                disabled={loading}
              />
              <Typography as="span" variant="body" fontWeight={500}>
                {t("active")}
              </Typography>
            </Box>
          </Box>

          <Box className="uf__actions">
            <Button
              text={saving ? t("saving") : t("save")}
              onClick={handleSave}
              disabled={saving || loading}
            />
          </Box>
        </Box>
      </Box>
    </>
  );
}
