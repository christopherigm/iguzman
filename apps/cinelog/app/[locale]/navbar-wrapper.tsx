"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "@repo/i18n/navigation";
import { Navbar } from "@repo/ui/core-elements/navbar";
import type { MenuItem } from "@repo/ui/core-elements/navbar";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { logout, clearUser, getStoredUser } from "@/lib/auth";
import { requestAiSearch } from "@/lib/ai-search";

// The stored user lives in localStorage; `app-auth` is dispatched (after the
// store is updated) whenever it changes. Reading it through useSyncExternalStore
// avoids a setState-in-effect on mount.
function subscribeAuth(callback: () => void): () => void {
  window.addEventListener("app-auth", callback);
  return () => window.removeEventListener("app-auth", callback);
}

function getDisplayNameSnapshot(): string | null {
  return getStoredUser()?.displayName ?? null;
}

interface NavbarWrapperProps {
  logo: string;
  version: string;
  labels: {
    home: string;
    statistics: string;
    addMovie: string;
    account: string;
    linkTv: string;
    signOut: string;
  };
}

export function NavbarWrapper({ logo, version, labels }: NavbarWrapperProps) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("Navbar");
  const displayName = useSyncExternalStore(
    subscribeAuth,
    getDisplayNameSnapshot,
    () => null,
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState("");

  const handleSignOut = async () => {
    await logout();
    clearUser();
    router.push("/auth");
  };

  // Run the AI natural-language search entirely client-side (no `ai` URL param):
  // request the query, which the catalog resolves via the semantic endpoint. If
  // we're not on the catalog, navigate home first so the catalog can pick it up
  // on mount. An empty query just dismisses the modal.
  const handleSearch = () => {
    const q = query.trim();
    setModalOpen(false);
    if (!q) return;
    requestAiSearch(q);
    if (pathname !== "/") router.push("/");
  };

  const handleCancelSearch = () => {
    setModalOpen(false);
    setQuery("");
  };

  const accountItem: MenuItem = displayName
    ? {
        label: displayName,
        children: [
          { label: labels.account, href: "/account" },
          { label: labels.linkTv, href: "/tv" },
          { label: labels.signOut, onClick: handleSignOut },
        ],
      }
    : { label: labels.account, href: "/account" };

  return (
    <>
      <Navbar
        logo={logo}
        items={[
          { label: labels.home, href: "/" },
          ...(displayName
            ? [{ label: labels.addMovie, href: "/add-movie" }]
            : []),
          // Statistics is a public, read-only page - shown to everyone.
          { label: labels.statistics, href: "/statistics" },
          accountItem,
        ]}
        fixedItems={[]}
        version={version}
        translucent
        rightSlot={
          <Button
            icon="/icons/search.svg"
            aria-label={t("search.openLabel")}
            onClick={() => setModalOpen(true)}
            iconSize="20px"
            styles={{ cursor: "pointer" }}
            kind="primary"
          />
        }
      />
      {modalOpen && (
        <ConfirmationModal
          title={t("search.title")}
          text={t("search.description")}
          okCallback={handleSearch}
          cancelCallback={handleCancelSearch}
          panelMaxWidth="480px"
          position="center"
          // backgroundBlur=""
        >
          <Box display="flex" flexDirection="column" gap={12}>
            <TextInput
              label={t("search.inputLabel")}
              placeholder={t("search.placeholder")}
              value={query}
              onChange={setQuery}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
              rows={3}
              multirow
            />
          </Box>
        </ConfirmationModal>
      )}
    </>
  );
}
