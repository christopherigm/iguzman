"use client";

import { useCallback, useState } from "react";

export type ToastKind = "success" | "error";

/** Small toast controller: exposes the current toast, a re-render key (so the
 *  same message can be shown twice in a row), and a `showToast` helper. */
export function useToast() {
  const [toast, setToast] = useState<{ text: string; kind: ToastKind } | null>(
    null,
  );
  const [toastKey, setToastKey] = useState(0);

  const showToast = useCallback((text: string, kind: ToastKind) => {
    setToast({ text, kind });
    setToastKey((k) => k + 1);
  }, []);

  return { toast, toastKey, showToast };
}

export type ShowToast = ReturnType<typeof useToast>["showToast"];
