"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Box } from "./box";
import { Button } from "./button";
import { Typography } from "./typography";
import {
  useGroqProxy,
  type LlmMessage,
  type UseGroqOptions,
} from "../use-groq";

// Owns the streaming LLM hook so that the per-token `streamingText` updates
// re-render only this panel, not the parent form/page. The parent triggers a
// run via the imperative `start` handle and learns about coarse state changes
// (generating on/off, preview present/absent) through callbacks that fire only
// on transitions - never per token.

export interface StreamingEnhanceHandle {
  /** Start a new generation. Resets any previous preview first. */
  start: (messages: LlmMessage[]) => void;
}

export interface StreamingEnhanceLabels {
  /** Shown while generating; cancels the in-flight stream. */
  stop: string;
  /** Shown when done; discards the preview. */
  discard: string;
  /** Shown when done; applies the preview via `onAccept`. */
  accept: string;
}

export interface StreamingEnhancePanelProps {
  /** Called with the preview text when the user accepts it. */
  onAccept: (text: string) => void;
  /** Fires only on generating on/off transitions, never per token. */
  onGeneratingChange?: (generating: boolean) => void;
  /** Fires only when the preview appears/disappears, never per token. */
  onPreviewActiveChange?: (active: boolean) => void;
  /** Button labels (i18n supplied by the caller). */
  labels: StreamingEnhanceLabels;
  /** Forwarded to `useGroqProxy`. Defaults to `{ temperature: 0.7 }`. */
  groqOptions?: Omit<UseGroqOptions, "proxyBase"> & { proxyBase?: string };
  className?: string;
}

export const StreamingEnhancePanel = forwardRef<
  StreamingEnhanceHandle,
  StreamingEnhancePanelProps
>(function StreamingEnhancePanel(
  {
    onAccept,
    onGeneratingChange,
    onPreviewActiveChange,
    labels,
    groqOptions,
    className,
  },
  ref,
) {
  const [preview, setPreview] = useState("");
  const { streamingText, isGenerating, generate, abort, reset } = useGroqProxy(
    groqOptions ?? { temperature: 0.7 },
  );

  useEffect(() => {
    if (streamingText) setPreview(streamingText);
  }, [streamingText]);

  useEffect(() => {
    onGeneratingChange?.(isGenerating);
  }, [isGenerating, onGeneratingChange]);

  const hadPreviewRef = useRef(false);
  useEffect(() => {
    const has = preview.length > 0;
    if (has !== hadPreviewRef.current) {
      hadPreviewRef.current = has;
      onPreviewActiveChange?.(has);
    }
  }, [preview, onPreviewActiveChange]);

  // Abort an in-flight stream if the panel unmounts (e.g. its modal closes).
  const isGeneratingRef = useRef(isGenerating);
  isGeneratingRef.current = isGenerating;
  const abortRef = useRef(abort);
  abortRef.current = abort;
  useEffect(
    () => () => {
      if (isGeneratingRef.current) abortRef.current();
    },
    [],
  );

  useImperativeHandle(
    ref,
    () => ({
      start: (messages) => {
        setPreview("");
        reset();
        void generate(messages).catch(() => {
          // Errors surface through the hook's internal error state; swallow the
          // floating promise so it doesn't become an unhandled rejection.
        });
      },
    }),
    [generate, reset],
  );

  const handleAccept = () => {
    if (preview) onAccept(preview);
    setPreview("");
    reset();
  };

  const handleDiscard = () => {
    if (isGenerating) abort();
    setPreview("");
    reset();
  };

  if (!preview) return null;

  return (
    <Box
      className={className}
      display="flex"
      flexDirection="column"
      gap={10}
      paddingX={14}
      paddingY={12}
      borderRadius={8}
      border="1px solid color-mix(in srgb, var(--primary, #06b6d4) 30%, transparent)"
      backgroundColor="color-mix(in srgb, var(--primary, #06b6d4) 5%, transparent)"
    >
      <Typography
        variant="body"
        styles={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}
      >
        {preview}
      </Typography>
      <Box display="flex" gap={8} alignItems="center" marginTop={4}>
        {isGenerating ? (
          <Button
            text={labels.stop}
            type="button"
            size="md"
            onClick={handleDiscard}
          />
        ) : (
          <>
            <Button
              text={labels.discard}
              type="button"
              size="md"
              onClick={handleDiscard}
            />
            <Button
              text={labels.accept}
              type="button"
              size="md"
              kind="primary"
              onClick={handleAccept}
            />
          </>
        )}
      </Box>
    </Box>
  );
});
