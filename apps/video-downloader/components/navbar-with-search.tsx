"use client";

import { useCallback, useState } from "react";
import { Link, usePathname } from "@repo/i18n/navigation";
import { useTranslations } from "next-intl";
import { Navbar } from "@repo/ui/core-elements/navbar";
import type { NavbarProps } from "@repo/ui/core-elements/navbar";
import { Button } from "@repo/ui/core-elements/button";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Box } from "@repo/ui/core-elements/box";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { setSearchQuery, useSearchQuery } from "./use-search-store";
import { useCreditsBalance } from "./use-credits-store";

type NavbarWithSearchProps = Omit<
  NavbarProps,
  | "onSearch"
  | "onSearchChange"
  | "items"
  | "searchValue"
  | "rightSlot"
  | "searchBox"
> & {
  searchHiddenPaths?: string[];
  creditsHiddenPaths?: string[];
};

export function NavbarWithSearch(props: NavbarWithSearchProps) {
  const { searchHiddenPaths, creditsHiddenPaths, ...navbarProps } = props;
  const pathname = usePathname();
  const showSearch = !searchHiddenPaths?.includes(pathname);
  const showCredits = !creditsHiddenPaths?.includes(pathname);
  const t = useTranslations("Navbar");
  const tCommon = useTranslations("Common");
  const searchQuery = useSearchQuery();
  const creditsBalance = useCreditsBalance();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalQuery, setModalQuery] = useState("");

  // When the search store is cleared externally (e.g. "Clear search" in VideoGrid),
  // keep the modal query in sync. Tracked during render rather than in an effect.
  const [prevSearchQuery, setPrevSearchQuery] = useState(searchQuery);
  if (searchQuery !== prevSearchQuery) {
    setPrevSearchQuery(searchQuery);
    if (!searchQuery) setModalQuery("");
  }

  const allItems = [
    { label: t("home"), href: "/" },
    { label: t("reelMode"), href: "/reel-mode" },
    { label: t("musicPlayer"), href: "/music-player" },
    { label: t("buyCredits"), href: "/credits" },
    { label: t("terms"), href: "/terms" },
  ];
  const items = allItems.filter((item) => item.href !== pathname);

  const handleQueryChange = useCallback((value: string) => {
    setModalQuery(value);
    setSearchQuery(value);
  }, []);

  // These handlers call the external search-store setter, which the React
  // Compiler treats as a mutation and so cannot preserve their memoization. The
  // compiler is not enabled (advisory rule only) and the handlers are correct.
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const handleOk = useCallback(() => {
    setModalOpen(false);
  }, []);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const handleCancel = useCallback(() => {
    setModalQuery("");
    setSearchQuery("");
    setModalOpen(false);
  }, []);

  return (
    <>
      <Navbar
        {...navbarProps}
        hiddenPaths={[
          "/reel-mode",
          "/music-player",
          ...(navbarProps.hiddenPaths ?? []),
        ]}
        searchBox={false}
        items={items}
        rightSlot={
          <Box display="flex" alignItems="center" gap={14}>
            {showCredits && (
              <Link
                href="/credits"
                prefetch
                style={{
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  whiteSpace: "nowrap",
                  textDecoration: "none",
                  color: "inherit",
                  cursor: "pointer",
                }}
              >
                🪙 {creditsBalance}
              </Link>
            )}
            {showSearch && (
              <Button
                icon="/icons/search.svg"
                aria-label={t("searchModal.openLabel")}
                onClick={() => setModalOpen(true)}
                iconSize="20px"
                styles={{ cursor: "pointer" }}
                kind="primary"
              />
            )}
          </Box>
        }
      />
      {modalOpen && (
        <ConfirmationModal
          title={t("searchModal.title")}
          text={t("searchModal.description")}
          okCallback={handleOk}
          cancelCallback={handleCancel}
          panelMaxWidth="480px"
          position="top"
          backgroundBlur=""
          okLabel={tCommon("ok")}
          cancelLabel={tCommon("cancel")}
        >
          <TextInput
            label={t("searchModal.inputLabel")}
            value={modalQuery}
            onChange={handleQueryChange}
          />
        </ConfirmationModal>
      )}
    </>
  );
}
