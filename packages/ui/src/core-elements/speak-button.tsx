'use client';

import React, { useEffect } from 'react';
import { Button } from './button';
import { Icon } from './icon';
import { Badge } from './badge';
import { useTextToSpeech, UseTextToSpeechOptions } from '../use-text-to-speech';
import type { UIComponentProps } from './utils';
import './speak-button.css';

export interface SpeakButtonProps extends UIComponentProps, UseTextToSpeechOptions {
  /** Text to synthesize when the button is pressed. */
  text: string;
  /** SVG path for the idle speaker icon. */
  speakIcon?: string;
  /**
   * SVG path shown while speaking (instead of the speaker icon).
   * Falls back to `speakIcon` if not provided — the speaking state is
   * communicated via color and the pulse animation instead.
   */
  stopIcon?: string;
  /** Accessible label. Defaults to `'Speak text'` / `'Stop speaking'`. */
  'aria-label'?: string;
  /** Called when speech starts. */
  onSpeakStart?: () => void;
  /** Called when speech ends or is stopped. */
  onSpeakEnd?: () => void;
}

/**
 * SpeakButton — a speaker toggle button backed by TTS.
 *
 * Press once to start speaking; press again to stop.
 * Supports two engines:
 *  - `engine="browser"` — Web Speech API, instant, no download.
 *  - `engine="neural"`  — SpeechT5 via Web Worker, high quality, ~100–300 MB
 *                         model download on first use.
 *
 * @example
 * <SpeakButton
 *   text="Hello, world!"
 *   engine="browser"
 *   language="en"
 *   speakIcon="/icons/speaker.svg"
 *   onSpeakEnd={() => console.log('done')}
 * />
 */
export const SpeakButton: React.FC<SpeakButtonProps> = ({
  text,
  engine,
  language,
  model,
  speakerEmbeddings,
  rate,
  pitch,
  volume,
  speakIcon = '/icons/speaker.svg',
  stopIcon,
  onSpeakStart,
  onSpeakEnd,
  'aria-label': ariaLabel,
  className,
  ...uiProps
}) => {
  const { isSpeaking, isModelLoading, error, speak, stop } = useTextToSpeech({
    engine,
    language,
    model,
    speakerEmbeddings,
    rate,
    pitch,
    volume,
  });

  useEffect(() => {
    if (error) console.error('[SpeakButton] TTS error:', error);
  }, [error]);

  const handleClick = () => {
    if (isSpeaking) {
      stop();
      onSpeakEnd?.();
      return;
    }
    onSpeakStart?.();
    speak(text)
      .then(() => onSpeakEnd?.())
      .catch(() => onSpeakEnd?.());
  };

  const activeIcon = stopIcon ?? speakIcon;
  const isBusy = isModelLoading;

  return (
    <Button
      {...uiProps}
      unstyled
      onClick={handleClick}
      aria-label={ariaLabel ?? (isSpeaking ? 'Stop speaking' : 'Speak text')}
      aria-pressed={isSpeaking}
      className={[
        'tts-speak-button',
        isSpeaking ? 'tts-speak-button--speaking' : '',
        isBusy ? 'tts-speak-button--busy' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Icon
        icon={isSpeaking ? activeIcon : speakIcon}
        size="20px"
        color={
          isSpeaking ? 'var(--accent, #06b6d4)' : 'var(--foreground, #171717)'
        }
      />
      {language && (
        <Badge
          variant="subtle"
          size="sm"
          color={
            isSpeaking ? 'var(--accent, #06b6d4)' : 'var(--foreground, #171717)'
          }
          className="tts-speak-button__lang"
        >
          {language.slice(0, 2).toUpperCase()}
        </Badge>
      )}
    </Button>
  );
};

export default SpeakButton;
