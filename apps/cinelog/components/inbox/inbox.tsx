"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Grid } from "@repo/ui/core-elements/grid";
import { Typography } from "@repo/ui/core-elements/typography";
import { Spinner } from "@repo/ui/core-elements/spinner";
import { Toast } from "@repo/ui/core-elements/toast";
import {
  acceptInboxItem,
  getInboxItems,
  rejectInboxItem,
  type InboxAcceptPayload,
  type InboxItem,
} from "@/lib/inbox";
import { getCategories, type Category } from "@/lib/catalog";
import { MoviePagination } from "@/components/movie-catalog/movie-pagination";
import { InboxCard } from "./inbox-card";

type Status = "loading" | "ready" | "error";

export function Inbox() {
  const t = useTranslations("InboxPage");
  const [items, setItems] = useState<InboxItem[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  // Bumped to force a refetch in place (e.g. after a scan on this same page).
  const [reloadToken, setReloadToken] = useState(0);
  // Genre vocabulary for each card's genre buttons; fetched once on mount.
  const [categories, setCategories] = useState<Category[]>([]);

  const [toast, setToast] = useState<{
    text: string;
    variant: "success" | "error";
  } | null>(null);
  const [toastKey, setToastKey] = useState(0);

  function showToast(text: string, variant: "success" | "error") {
    setToast({ text, variant });
    setToastKey((k) => k + 1);
  }

  function handlePageChange(next: number) {
    setStatus("loading");
    setPage(next);
  }

  function handleRefresh() {
    setStatus("loading");
    setReloadToken((t) => t + 1);
  }

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    getInboxItems(page)
      .then((data) => {
        if (!active) return;
        setItems(data.results);
        setTotalPages(data.total_pages);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [page, reloadToken]);

  // A scan / manual add on the same "Add Movie" page queues a review entry; jump
  // back to the newest page and refetch so it appears without a manual reload.
  useEffect(() => {
    function onScanQueued() {
      setPage(1);
      setReloadToken((t) => t + 1);
    }
    window.addEventListener("cinelog:scan-queued", onScanQueued);
    return () =>
      window.removeEventListener("cinelog:scan-queued", onScanQueued);
  }, []);

  async function handleAccept(id: number, payload: InboxAcceptPayload) {
    try {
      await acceptInboxItem(id, payload);
      setItems((prev) => prev.filter((it) => it.id !== id));
      showToast(t("accepted", { title: payload.title }), "success");
    } catch (err) {
      showToast(t("acceptError"), "error");
      throw err;
    }
  }

  async function handleReject(id: number) {
    try {
      await rejectInboxItem(id);
      setItems((prev) => prev.filter((it) => it.id !== id));
      showToast(t("rejected"), "success");
    } catch (err) {
      showToast(t("rejectError"), "error");
      throw err;
    }
  }

  return (
    <Box flexDirection="column" marginTop={32} marginBottom={32}>
      {toast && (
        <Toast
          key={toastKey}
          message={toast.text}
          variant={toast.variant}
          position="top-center"
        />
      )}

      <Box justifyContent="space-between" alignItems="flex-start">
        <Typography as="h1" variant="h2" fontWeight={700}>
          {t("title")}
        </Typography>
        <Button
          text={t("refresh")}
          icon="/icons/refresh.svg"
          onClick={handleRefresh}
          isLoading={status === "loading"}
          kind="primary"
          size="md"
        />
      </Box>
      <Typography variant="body" styles={{ opacity: 0.6 }} marginTop={4}>
        {t("subtitle")}
      </Typography>

      {status === "loading" && (
        <Box display="flex" justifyContent="center" paddingY={40}>
          <Spinner label={t("loading")} />
        </Box>
      )}

      {status === "error" && (
        <Typography variant="body" role="alert" textAlign="center">
          {t("error")}
        </Typography>
      )}

      {status === "ready" && items.length === 0 && (
        <Typography variant="body" textAlign="center" styles={{ opacity: 0.6 }}>
          {t("empty")}
        </Typography>
      )}

      {status === "ready" && items.length > 0 && (
        <Grid container spacing={2} marginTop={16}>
          {items.map((item) => (
            <Grid key={item.id} size={{ xs: 12 }}>
              <InboxCard
                item={item}
                categories={categories}
                onAccept={handleAccept}
                onReject={handleReject}
              />
            </Grid>
          ))}
        </Grid>
      )}

      {status === "ready" && items.length > 0 && (
        <MoviePagination
          page={page}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
      )}
    </Box>
  );
}
