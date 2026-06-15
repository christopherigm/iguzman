"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from "react";

export interface OPFSVideoUrls {
  videoUrl: string | null;
  thumbnailUrl: string | null;
}

interface OPFSUrlContextValue {
  getUrls: (uuid: string) => OPFSVideoUrls;
  registerUrls: (uuid: string, urls: OPFSVideoUrls) => void;
  revokeUrls: (uuid: string) => void;
}

const EMPTY: OPFSVideoUrls = { videoUrl: null, thumbnailUrl: null };

const OPFSUrlContext = createContext<OPFSUrlContextValue>({
  getUrls: () => EMPTY,
  registerUrls: () => {},
  revokeUrls: () => {},
});

export function OPFSUrlProvider({ children }: { children: React.ReactNode }) {
  const [cache, setCache] = useState<ReadonlyMap<string, OPFSVideoUrls>>(
    new Map(),
  );

  const registerUrls = useCallback((uuid: string, urls: OPFSVideoUrls) => {
    setCache((prev) => {
      const existing = prev.get(uuid);
      if (existing?.videoUrl && existing.videoUrl !== urls.videoUrl) {
        URL.revokeObjectURL(existing.videoUrl);
      }
      if (
        existing?.thumbnailUrl &&
        existing.thumbnailUrl !== urls.thumbnailUrl
      ) {
        URL.revokeObjectURL(existing.thumbnailUrl);
      }
      const next = new Map(prev);
      next.set(uuid, urls);
      return next;
    });
  }, []);

  const revokeUrls = useCallback((uuid: string) => {
    setCache((prev) => {
      const existing = prev.get(uuid);
      if (existing?.videoUrl) URL.revokeObjectURL(existing.videoUrl);
      if (existing?.thumbnailUrl) URL.revokeObjectURL(existing.thumbnailUrl);
      const next = new Map(prev);
      next.delete(uuid);
      return next;
    });
  }, []);

  const getUrls = useCallback(
    (uuid: string): OPFSVideoUrls => cache.get(uuid) ?? EMPTY,
    [cache],
  );

  const value = useMemo(
    () => ({ getUrls, registerUrls, revokeUrls }),
    [getUrls, registerUrls, revokeUrls],
  );

  return (
    <OPFSUrlContext.Provider value={value}>{children}</OPFSUrlContext.Provider>
  );
}

export function useOPFSUrls() {
  return useContext(OPFSUrlContext);
}
