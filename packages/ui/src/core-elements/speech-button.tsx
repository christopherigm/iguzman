'use client';

import React, { useEffect } from 'react';
import { Button } from './button';
import { Icon } from './icon';
import { Badge } from './badge';
import { useSpeechToText, UseSpeechToTextOptions } from '../use-speech-to-text';
import type { UIComponentProps } from './utils';
import './speech-button.css';

export interface SpeechButtonProps
  extends UIComponentProps, UseSpeechToTextOptions {
  /** SVG path for the idle microphone icon. */
  micIcon?: string;
  /**
   * SVG path shown while recording (instead of the mic icon).
   * Falls back to `micIcon` if not provided — the recording state is
   * communicated via color and the pulse animation instead.
   */
  stopIcon?: string;
  /** Accessible label. Defaults to `'Start voice input'` / `'Stop recording'`. */
  'aria-label'?: string;
  /**
   * Called each time the transcript is updated (real-time mode) or
   * finalized (batch mode).
   */
  onTranscript?: (text: string) => void;
  /** Called in real-time mode each time the interim text changes. */
  onInterimTranscript?: (text: string) => void;
}

/**
 * SpeechButton — a mic toggle button backed by Whisper ASR.
 *
 * Press once to start recording; press again to stop and transcribe.
 * Fires `onTranscript` with the recognized text once transcription
 * is complete.
 *
 * Requires COOP + COEP headers on the host page (SharedArrayBuffer support).
 *
 * @example
 * <SpeechButton
 *   mode="batch"
 *   language="en"
 *   onTranscript={(text) => setSearchQuery(text)}
 *   micIcon="/icons/mic.svg"
 * />
 */
export const SpeechButton: React.FC<SpeechButtonProps> = ({
  mode,
  language,
  model,
  realtimeInterval,
  micIcon = '/icons/mic.svg',
  stopIcon,
  onTranscript,
  onInterimTranscript,
  'aria-label': ariaLabel,
  className,
  ...uiProps
}) => {
  const {
    transcript,
    interimTranscript,
    isListening,
    isModelLoading,
    isTranscribing,
    error,
    startListening,
    stopListening,
  } = useSpeechToText({ mode, language, model, realtimeInterval });

  useEffect(() => {
    if (error) console.error('[SpeechButton] STT error:', error);
  }, [error]);

  useEffect(() => {
    if (transcript) onTranscript?.(transcript);
  }, [transcript, onTranscript]);

  useEffect(() => {
    if (interimTranscript) onInterimTranscript?.(interimTranscript);
  }, [interimTranscript, onInterimTranscript]);

  const activeIcon = stopIcon ?? micIcon;
  const isBusy = isModelLoading || isTranscribing;

  return (
    <Button
      {...uiProps}
      unstyled
      onClick={isListening ? stopListening : startListening}
      aria-label={
        ariaLabel ?? (isListening ? 'Stop recording' : 'Start voice input')
      }
      aria-pressed={isListening}
      className={[
        'stt-speech-button',
        isListening ? 'stt-speech-button--recording' : '',
        isBusy ? 'stt-speech-button--busy' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Icon
        icon={isListening ? activeIcon : micIcon}
        size="20px"
        color={
          isListening ? 'var(--error, #ef4444)' : 'var(--foreground, #171717)'
        }
      />
      {language && (
        <Badge
          variant="subtle"
          size="sm"
          color={
            isListening ? 'var(--error, #ef4444)' : 'var(--accent, #06b6d4)'
          }
          className="stt-speech-button__lang"
        >
          {language.slice(0, 2).toUpperCase()}
        </Badge>
      )}
    </Button>
  );
};

export default SpeechButton;
