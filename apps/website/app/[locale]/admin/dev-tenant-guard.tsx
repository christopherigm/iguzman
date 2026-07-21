"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { logout } from "@/lib/auth";

/**
 * Dev-only guard for the tenant mismatch the site switcher makes possible.
 *
 * The public site resolves its tenant from the request host (or, in
 * development, the `__dev_site` cookie), but the CMS resolves it from the
 * session: `systemId` is a claim on the access token, and Django re-derives it
 * from the same token on every write. So after previewing another site and
 * walking into `/admin`, the page is painted with that site's branding while
 * every form still edits the tenant you logged in as - which is exactly the
 * kind of silent mix-up that ends with content saved on the wrong customer.
 *
 * Rather than teaching the CMS to follow the cookie (which would mean an
 * escape hatch through the backend's tenancy rules, for a dev convenience),
 * this states the mismatch and offers the only real resolution: log out and
 * sign in as an admin of the previewed site. Mounted by `admin/layout.tsx`,
 * which only renders it when `NODE_ENV === "development"`.
 */
export function DevTenantGuard({ siteName }: { siteName: string }) {
  const t = useTranslations("Admin");
  const [loggingOut, setLoggingOut] = useState(false);

  const confirm = () => {
    if (loggingOut) return;
    setLoggingOut(true);
    // A full navigation, not router.push: the session lives in cookies the
    // server just cleared, so every cached RSC payload has to go with it.
    logout().finally(() => {
      window.location.href = "/";
    });
  };

  return (
    <ConfirmationModal
      title={t("devTenantMismatchTitle")}
      text={t("devTenantMismatchText", { site: siteName })}
      okLabel={t("devTenantMismatchLogout")}
      okCallback={confirm}
      okDisabled={loggingOut}
    />
  );
}
