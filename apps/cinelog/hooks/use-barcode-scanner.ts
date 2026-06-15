"use client";

import { useCallback, useRef, useState } from "react";

export type ScanStatus = "idle" | "scanning" | "permission_denied";

export type ScanFeedback = {
  barcode: string;
  status: "pending" | "saved" | "queued" | "exists" | "error";
  title?: string;
};

type ApiScanResponse = {
  status: "saved" | "queued" | "exists";
  movie?: { title: string };
};

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}

export function useBarcodeScanner() {
  const [lastScan, setLastScan] = useState<ScanFeedback | null>(null);
  const [flash, setFlash] = useState(false);
  const [scanCount, setScanCount] = useState(0);

  const lastBarcodeRef = useRef("");
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onScan = useCallback(async (barcode: string) => {
    if (barcode === lastBarcodeRef.current) return;
    lastBarcodeRef.current = barcode;

    // A new scan supersedes any pending auto-clear of the previous result.
    if (clearRef.current) clearTimeout(clearRef.current);

    if (flashRef.current) clearTimeout(flashRef.current);
    setFlash(true);
    setScanCount((c) => c + 1);
    flashRef.current = setTimeout(() => setFlash(false), 600);

    if (cooldownRef.current) clearTimeout(cooldownRef.current);
    cooldownRef.current = setTimeout(() => {
      lastBarcodeRef.current = "";
    }, 3000);

    vibrate(50);
    setLastScan({ barcode, status: "pending" });

    try {
      const res = await fetch("/api/catalog/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcode }),
      });
      if (res.ok) {
        const data = (await res.json()) as ApiScanResponse;
        if (data.status === "saved") vibrate(150);
        else if (data.status === "exists") vibrate([50, 50, 50]);
        setLastScan({ barcode, status: data.status, title: data.movie?.title });
        // The slow path is already handed off to the worker; the user can keep
        // scanning and review it later in the inbox. Auto-clear so the lingering
        // "queued" card doesn't imply there's something to wait for here.
        if (data.status === "queued") {
          clearRef.current = setTimeout(() => setLastScan(null), 2500);
        }
      } else {
        setLastScan({ barcode, status: "error" });
      }
    } catch {
      setLastScan({ barcode, status: "error" });
    }
  }, []);

  return { lastScan, flash, scanCount, onScan };
}
