import type { useTranslations } from 'next-intl';

export type LyricsMode = 'custom' | 'generate';
export type VoiceGender = 'male' | 'female';

export type Voice = {
  id: string;
  gender: VoiceGender;
  variant: string | null;
};

export type TFn = ReturnType<typeof useTranslations<'AppPage'>>;

export type FormState = {
  // Step: style
  rhythms: string[];
  emotions: string[];
  instruments: string[];
  voices: Voice[];
  // Step: lyrics
  songName: string;
  lyricsMode: LyricsMode | null;
  lyrics: string;
  lyricsPrompt: string;
};

export type FormHandlers = {
  // Style step
  onToggleRhythm: (rhythm: string) => void;
  onToggleEmotion: (emotion: string) => void;
  onToggleInstrument: (instrument: string) => void;
  onAddVoice: (voice: Voice) => void;
  onRemoveVoice: (id: string) => void;
  // Lyrics step
  onSongNameChange: (v: string) => void;
  onSelectLyricsMode: (mode: LyricsMode) => void;
  onLyricsChange: (v: string) => void;
  onPromptChange: (v: string) => void;
};
