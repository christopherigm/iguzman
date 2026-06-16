"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
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
import { MoviePagination } from "@/components/movie-catalog/movie-pagination";
import { InboxCard } from "./inbox-card";

type Status = "loading" | "ready" | "error";

export function Inbox() {
  const t = useTranslations("InboxPage");
  const [items, setItems] = useState<InboxItem[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [toast, setToast] = useState<{
    text: string;
    variant: "success" | "error";
  } | null>(null);
  const [toastKey, setToastKey] = useState(0);

  function showToast(text: string, variant: "success" | "error") {
    setToast({ text, variant });
    setToastKey((k) => k + 1);
  }

  useEffect(() => {
    let active = true;
    setStatus("loading");
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
  }, [page]);

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
    <Box flexDirection="column" gap={16} paddingY={16}>
      {toast && (
        <Toast
          key={toastKey}
          message={toast.text}
          variant={toast.variant}
          position="top-center"
        />
      )}

      <Box flexDirection="column" gap={4}>
        <Typography as="h1" variant="h2" fontWeight={700}>
          {t("title")}
        </Typography>
        <Typography variant="body" styles={{ opacity: 0.6 }}>
          {t("subtitle")}
        </Typography>
      </Box>

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
        <Typography
          variant="body"
          textAlign="center"
          styles={{ opacity: 0.6 }}
        >
          {t("empty")}
        </Typography>
      )}

      {status === "ready" && items.length > 0 && (
        <Box flexDirection="column" gap={12}>
          {items.map((item) => (
            <InboxCard
              key={item.id}
              item={item}
              onAccept={handleAccept}
              onReject={handleReject}
            />
          ))}
        </Box>
      )}

      {status === "ready" && items.length > 0 && (
        <MoviePagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      )}
    </Box>
  );
}
