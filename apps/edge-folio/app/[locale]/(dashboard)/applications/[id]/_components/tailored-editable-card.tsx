"use client";

import { useRef, useState, type ReactNode } from "react";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import { Switch } from "@repo/ui/core-elements/switch";
import { TextInput } from "@repo/ui/core-elements/text-input";
import {
  StreamingEnhancePanel,
  type StreamingEnhanceHandle,
} from "@repo/ui/core-elements/streaming-enhance-panel";
import {
  EnhanceOptionsModal,
  type EnhanceOptions,
  type EnhanceOptionsLabels,
} from "@/components/enhance/enhance-options-modal";

/** Chat messages passed to the streaming enhance panel (structurally an LlmMessage). */
export type EnhanceMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface TailoredEditableCardLabels {
  enhance: string;
  stop: string;
  discard: string;
  accept: string;
  save: string;
  saving: string;
}

interface Props {
  /** Card title; when empty the controls still sit flush right. */
  title?: string;
  /**
   * Whether this section is included in the exported resume. Omit
   * `onIncludedChange` to render the card without an include switch (e.g. the
   * always-exported Professional Summary).
   */
  included?: boolean;
  onIncludedChange?: (v: boolean) => void;
  includeLabel?: string;
  labels: TailoredEditableCardLabels;
  /**
   * Editable card (bullets / descriptions). When false the card is display-only
   * (e.g. the skills chips) and renders `children` with just the include switch.
   */
  editable?: boolean;
  value?: string;
  onChange?: (v: string) => void;
  rows?: number;
  placeholder?: string;
  ariaLabel?: string;
  buildEnhanceMessages?: (
    currentText: string,
    opts?: EnhanceOptions,
  ) => EnhanceMessage[];
  /**
   * When set, the enhance button first opens the paragraph/length options modal
   * and the chosen options are passed to `buildEnhanceMessages`. Omit it (the
   * bullet cards) to enhance immediately with no modal.
   */
  enhanceWithOptions?: boolean;
  enhanceOptionsLabels?: EnhanceOptionsLabels;
  onSave?: () => void;
  saving?: boolean;
  dirty?: boolean;
  children?: ReactNode;
}

/**
 * A tailored-results card with an "Include in resume" switch (plus an optional
 * AI-enhance control) aligned to the right of the title, a
 * divider, and — when `editable` — an editable body with a "Save Changes"
 * button that mirrors the Professional Summary editing pattern.
 */
export function TailoredEditableCard({
  title,
  included,
  onIncludedChange,
  includeLabel,
  labels,
  editable = false,
  value = "",
  onChange,
  rows = 5,
  placeholder,
  ariaLabel,
  buildEnhanceMessages,
  enhanceWithOptions = false,
  enhanceOptionsLabels,
  onSave,
  saving = false,
  dirty = false,
  children,
}: Props) {
  const enhanceRef = useRef<StreamingEnhanceHandle>(null);
  const [enhancing, setEnhancing] = useState(false);
  const [previewActive, setPreviewActive] = useState(false);
  const [showEnhanceOptions, setShowEnhanceOptions] = useState(false);

  const handleEnhance = () => {
    if (!buildEnhanceMessages) return;
    const current = value.trim();
    if (!current) return;
    // Prose cards let the user pick paragraphs/length first; others enhance now.
    if (enhanceWithOptions && enhanceOptionsLabels) {
      setShowEnhanceOptions(true);
      return;
    }
    enhanceRef.current?.start(buildEnhanceMessages(current));
  };

  const handleConfirmEnhance = (opts: EnhanceOptions) => {
    setShowEnhanceOptions(false);
    if (!buildEnhanceMessages) return;
    const current = value.trim();
    if (!current) return;
    enhanceRef.current?.start(buildEnhanceMessages(current, opts));
  };

  return (
    <Card
      gap={0}
      styles={{ opacity: included === false ? 0.55 : 1, height: "100%" }}
    >
      {showEnhanceOptions && enhanceOptionsLabels && (
        <EnhanceOptionsModal
          labels={enhanceOptionsLabels}
          onConfirm={handleConfirmEnhance}
          onCancel={() => setShowEnhanceOptions(false)}
        />
      )}
      {/* Title + right-aligned controls — stay on one row at all widths; the
          title wraps to honor the space the controls need. */}
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        gap={10}
      >
        {title ? (
          <Typography
            variant="body"
            fontWeight={600}
            color="var(--foreground)"
            styles={{
              lineHeight: 1.3,
              flex: 1,
              minWidth: 0,
              overflowWrap: "anywhere",
            }}
          >
            {title}
          </Typography>
        ) : (
          <Box flex={1} minWidth={0} />
        )}
        <Box
          display="flex"
          alignItems="center"
          gap={8}
          styles={{ flexShrink: 0 }}
        >
          {editable && (
            <>
              <Button
                unstyled
                type="button"
                icon="/icons/enhance.svg"
                iconSize="16px"
                iconColor={
                  previewActive
                    ? "var(--primary, #06b6d4)"
                    : "var(--foreground, #171717)"
                }
                disabled={enhancing || !value.trim()}
                onClick={handleEnhance}
                aria-label={labels.enhance}
                title={labels.enhance}
                className={[
                  "ai-enhance-btn",
                  enhancing || !value.trim() ? "ai-enhance-btn--busy" : "",
                  previewActive ? "ai-enhance-btn--active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
            </>
          )}
          {onIncludedChange && (
            <Switch
              checked={included ?? true}
              onChange={onIncludedChange}
              aria-label={includeLabel}
            />
          )}
        </Box>
      </Box>

      {/* Divider between the header row and the content */}
      <Box
        styles={{ borderBottom: "1px solid var(--border, #e5e7eb)" }}
        marginTop={10}
        marginBottom={12}
      />

      {editable ? (
        <Box display="flex" flexDirection="column" gap={10}>
          <TextInput
            multirow
            rows={rows}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            width="100%"
            aria-label={ariaLabel ?? title ?? includeLabel}
          />
          <StreamingEnhancePanel
            ref={enhanceRef}
            onAccept={(text) => onChange?.(text)}
            onGeneratingChange={setEnhancing}
            onPreviewActiveChange={setPreviewActive}
            labels={{
              stop: labels.stop,
              discard: labels.discard,
              accept: labels.accept,
            }}
          />
          <Box display="flex" justifyContent="flex-end">
            <Button
              text={saving ? labels.saving : labels.save}
              type="button"
              size="md"
              kind="primary"
              disabled={saving || !dirty}
              onClick={onSave}
            />
          </Box>
        </Box>
      ) : (
        children
      )}
    </Card>
  );
}
