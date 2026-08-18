"use client";

import { useCallback, useState } from "react";
import type { NewImage } from "@/components/admin-image-uploader/admin-image-uploader";
import { stockImageFields, type StockImageFile } from "@/lib/admin-api";

/** One record's single-image field, as the CMS forms edit it. */
export type AdminImageField = {
  existing: { id: number; url: string }[];
  /** Seeds the field from a loaded record (`data.image`), or clears it. */
  load: (url: unknown, id: number) => void;
  picked: StockImageFile[];
  /** Bumped to remount the uploader - see `onPick`. */
  uploaderKey: number;
  /** Wire to `AdminImageUploader.onChange`. */
  onUploaderChange: (
    next: NewImage[],
    deleted: number[],
    orderedExisting: number[],
  ) => void;
  /** Wire to `ImageWebSearch.onChange`. */
  onPick: (picked: StockImageFile[]) => void;
  /** The `image` (+ credit) keys this field contributes to a save payload. */
  payload: () => Record<string, unknown>;
  /** Whether anything is waiting to be written (a file or a picked photo). */
  isDirty: boolean;
  /** Call after a save, with whatever `image` the API stored. */
  settle: (url: unknown, id: number) => void;
};

/**
 * The state behind a single-image CMS field: what is stored, what the operator
 * queued from their disk, and what they picked out of a stock bank.
 *
 * It exists because that is three pieces of state with one non-obvious rule
 * between them, repeated on every form that has an image - and the rule is the
 * part worth writing once:
 *
 * ⚠ **The uploader and the picker are one field with two doors, never two
 * pending images.** Picking a bank photo drops a queued file (and remounts the
 * uploader, whose file list is its own state); queuing a file drops the picked
 * photo. Whichever the operator chose last is the one they are asking for, and
 * the save is a single `image` key that cannot carry both.
 *
 * ⚠ **A picked photo's credit travels in the same write as the file.** Storing
 * an image clears whatever attribution the record carried - a customer's own
 * photo owes nobody - so a credit sent separately is wiped by the write it was
 * meant to describe. `payload()` emits all three keys together; see
 * website-api's `_apply_attribution`.
 */
export function useAdminImageField(): AdminImageField {
  const [existing, setExisting] = useState<{ id: number; url: string }[]>([]);
  const [pending, setPending] = useState<NewImage[]>([]);
  const [picked, setPicked] = useState<StockImageFile[]>([]);
  const [uploaderKey, setUploaderKey] = useState(0);

  const load = useCallback((url: unknown, id: number) => {
    setExisting(url ? [{ id, url: String(url) }] : []);
  }, []);

  const onUploaderChange = useCallback(
    (next: NewImage[], _deleted: number[], orderedExisting: number[]) => {
      setPending(next);
      setExisting((prev) =>
        prev.filter((img) => orderedExisting.includes(img.id)),
      );
      // The operator's own file wins over a bank photo picked before it.
      if (next.length > 0) setPicked([]);
    },
    [],
  );

  const onPick = useCallback((next: StockImageFile[]) => {
    setPicked(next);
    if (next.length > 0) {
      setPending([]);
      setUploaderKey((k) => k + 1);
    }
  }, []);

  const payload = useCallback((): Record<string, unknown> => {
    if (picked[0]) return stockImageFields(picked[0]);
    if (pending.length > 0) return { image: pending[0]?.base64 };
    // Clearing needs an explicit null: updates are PATCH, so an omitted key
    // means "leave unchanged" and could never remove a stored image.
    if (existing.length === 0) return { image: null };
    return {};
  }, [picked, pending, existing]);

  const settle = useCallback(
    (url: unknown, id: number) => {
      // Only after a picked photo: it is stored on the record now, and keeping
      // the selection would re-send the same file on the operator's next save.
      if (picked.length === 0) return;
      setPicked([]);
      setExisting(url ? [{ id, url: String(url) }] : []);
      setUploaderKey((k) => k + 1);
    },
    [picked],
  );

  return {
    existing,
    load,
    picked,
    uploaderKey,
    onUploaderChange,
    onPick,
    payload,
    isDirty: picked.length > 0 || pending.length > 0,
    settle,
  };
}

/**
 * Slots a gallery's stock-image picker may still fill, given what its uploader
 * is already holding.
 *
 * ⚠ It counts the **deletions** rather than trusting the uploader's last
 * reported order, which is empty until the operator touches the control - and
 * "empty because nothing has changed" and "empty because they removed
 * everything" are different answers that the picker's cap must not confuse.
 */
export function remainingGallerySlots(
  maxImages: number,
  existing: { id: number }[],
  deletedIds: number[],
  pendingUploads: unknown[],
): number {
  const kept = existing.filter((img) => !deletedIds.includes(img.id)).length;
  return Math.max(0, maxImages - kept - pendingUploads.length);
}
