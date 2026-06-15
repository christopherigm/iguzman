import type { SkeletonJson } from "./skeleton-json";

/** Messages sent FROM the main thread TO the AST worker. */
export type AstWorkerInbound =
  | { type: "EXTRACT"; handle: FileSystemDirectoryHandle }
  | { type: "ABORT" };

/** Messages sent FROM the AST worker TO the main thread. */
export type AstWorkerOutbound =
  | { type: "PROGRESS"; phase: string; pct?: number }
  | { type: "DONE"; skeleton: SkeletonJson }
  | { type: "ERROR"; error: string };
