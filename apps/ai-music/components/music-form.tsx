'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Container } from '@repo/ui/core-elements/container';
import { Box } from '@repo/ui/core-elements/box';
import { Button } from '@repo/ui/core-elements/button';
import { Typography } from '@repo/ui/core-elements/typography';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Switch } from '@repo/ui/core-elements/switch';
import { SpeechButton } from '@repo/ui/core-elements/speech-button';
import { useGroqProxy } from '@repo/ui/use-groq';
import { StepStyle } from './step-style';
import type {
  LyricsMode,
  TFn,
  FormState,
  FormHandlers,
  VoiceGender,
} from './music-form.types';
import './music-form.css';

// ── Local type aliases for typed t() key assertions ───────────────────────────

type EmotionKey =
  | 'happiness' | 'joy' | 'love' | 'sadness' | 'proud' | 'romantic'
  | 'nostalgic' | 'spite' | 'angry' | 'melodic' | 'modern' | 'emotional'
  | 'energetic' | 'peaceful' | 'dark' | 'uplifting' | 'melancholic' | 'passionate';

type InstrumentKey =
  | 'piano' | 'acousticGuitar' | 'electricGuitar' | 'bassGuitar' | 'violin'
  | 'cello' | 'drums' | 'trumpet' | 'saxophone' | 'flute' | 'clarinet'
  | 'synthesizer' | 'organ' | 'harp' | 'banjo' | 'ukulele' | 'percussion';

type VoiceVariantKey =
  | 'deep' | 'tenor' | 'soft' | 'young' | 'raspy'
  | 'powerful' | 'warm' | 'soprano' | 'alto' | 'breathy';

// ── Locale-aware LLM prompt labels ────────────────────────────────────────────

type LocaleLabels = {
  system: string;
  userInstruction: string;
  song: string;
  description: string;
  rhythms: string;
  emotions: string;
  instruments: string;
  voices: string;
};

const LOCALE_LABELS: Record<string, LocaleLabels> = {
  es: {
    system:
      'Eres un compositor profesional. Escribe letras únicas y originales con imágenes vívidas — evita clichés y frases genéricas.\n\nFormatea cada sección con un encabezado descriptivo entre corchetes que capture cómo debe sonar esa parte: [Verso 1: piano suave, introspectivo y tranquilo], [Coro: banda completa, oleada emocional, voces poderosas], [Pausa musical: solo de guitarra eléctrica, batería se intensifica]. Nunca uses etiquetas simples como "Verso 1:" o "Coro:" solos.\n\nIncluye exactamente 2 pausas musicales (secciones solo instrumentales) colocadas de forma natural en la canción — cada una con instrumentos específicos y una descripción del ambiente.\n\nUsa los ritmos, emociones, instrumentos y características vocales indicados en los encabezados de sección para dirigir la producción. Devuelve solo la letra formateada — sin explicaciones ni comentarios.',
    userInstruction:
      'Escribe letras únicas para la siguiente canción. Incorpora los ritmos, emociones, instrumentos y estilos vocales indicados directamente en los encabezados de las secciones para describir cómo debe sonar cada parte.',
    song: 'Nombre de la canción',
    description: 'Descripción',
    rhythms: 'Ritmos',
    emotions: 'Emociones',
    instruments: 'Instrumentos',
    voices: 'Voces',
  },
  fr: {
    system:
      "Vous êtes un parolier professionnel. Écrivez des paroles uniques et originales avec des images vives — évitez les clichés et les phrases génériques.\n\nFormatez chaque section avec un en-tête descriptif entre crochets qui capture comment cette partie doit sonner : [Couplet 1 : piano doux, introspectif et calme], [Refrain : groupe complet, montée émotionnelle, voix puissantes], [Pause musicale : solo de guitare électrique, batterie s'intensifie]. N'utilisez jamais des étiquettes simples comme « Couplet 1 : » ou « Refrain : » seuls.\n\nIncluez exactement 2 pauses musicales (sections instrumentales uniquement) placées naturellement dans la chanson — chacune avec des instruments spécifiques et une description de l'ambiance.\n\nUtilisez les rythmes, émotions, instruments et caractéristiques vocales indiqués dans les en-têtes de section pour guider la production. Retournez uniquement les paroles formatées — sans explications ni commentaires.",
    userInstruction:
      "Écrivez des paroles uniques pour la chanson suivante. Incorporez les rythmes, émotions, instruments et styles vocaux indiqués directement dans les en-têtes de section pour décrire comment chaque partie doit sonner.",
    song: 'Titre de la chanson',
    description: 'Description',
    rhythms: 'Rythmes',
    emotions: 'Émotions',
    instruments: 'Instruments',
    voices: 'Voix',
  },
  de: {
    system:
      'Du bist ein professioneller Songwriter. Schreibe einzigartige, originelle Liedtexte mit lebendigen Bildern — vermeide Klischees und generische Phrasen.\n\nFormatiere jeden Abschnitt mit einem beschreibenden Header in eckigen Klammern, der erfasst, wie dieser Teil klingen soll: [Strophe 1: sanftes Klavier, introspektiv und ruhig], [Chorus: volle Band, emotionaler Aufstieg, kraftvolle Stimmen], [Musikpause: E-Gitarren-Solo, Schlagzeug intensiviert sich]. Verwende niemals einfache Labels wie „Strophe 1:" oder „Chorus:" allein.\n\nFüge genau 2 Musikpausen (rein instrumentale Abschnitte) ein, die natürlich im Song platziert sind — jeweils mit spezifischen Instrumenten und einer Stimmungsbeschreibung.\n\nVerwende die angegebenen Rhythmen, Emotionen, Instrumente und Stimmcharakteristika in den Abschnittsüberschriften, um die Produktion zu leiten. Gib nur die formatierten Texte zurück — keine Erklärungen oder Meta-Kommentare.',
    userInstruction:
      'Schreibe einzigartige Texte für den folgenden Song. Integriere die angegebenen Rhythmen, Emotionen, Instrumente und Vokalstile direkt in die Abschnittsüberschriften, um zu beschreiben, wie jeder Teil klingen soll.',
    song: 'Songname',
    description: 'Beschreibung',
    rhythms: 'Rhythmen',
    emotions: 'Emotionen',
    instruments: 'Instrumente',
    voices: 'Stimmen',
  },
  pt: {
    system:
      'Você é um compositor profissional. Escreva letras únicas e originais com imagens vívidas — evite clichês e frases genéricas.\n\nFormate cada seção com um cabeçalho descritivo entre colchetes que capture como aquela parte deve soar: [Verso 1: piano suave, introspectivo e tranquilo], [Refrão: banda completa, ascensão emocional, vocais poderosos], [Pausa musical: solo de guitarra elétrica, bateria se intensifica]. Nunca use rótulos simples como "Verso 1:" ou "Refrão:" sozinhos.\n\nInclua exatamente 2 pausas musicais (seções apenas instrumentais) colocadas naturalmente na música — cada uma com instrumentos específicos e uma descrição do clima.\n\nUse os ritmos, emoções, instrumentos e características vocais indicados nos cabeçalhos de seção para orientar a produção. Retorne apenas a letra formatada — sem explicações ou comentários.',
    userInstruction:
      'Escreva letras únicas para a seguinte música. Incorpore os ritmos, emoções, instrumentos e estilos vocais indicados diretamente nos cabeçalhos das seções para descrever como cada parte deve soar.',
    song: 'Nome da música',
    description: 'Descrição',
    rhythms: 'Ritmos',
    emotions: 'Emoções',
    instruments: 'Instrumentos',
    voices: 'Vozes',
  },
};

const DEFAULT_LOCALE_LABELS: LocaleLabels = {
  system:
    "You are a professional songwriter. Write unique, original lyrics with vivid imagery and fresh perspectives — avoid clichés and generic phrases.\n\nFormat every section with a descriptive header in brackets that conveys the musical feel and production of that part: [Verse 1: soft piano intro, introspective and quiet], [Chorus: full band kicks in, emotional surge, powerful vocals], [Music Break: electric guitar solo, drums intensify]. Never use plain labels like \"Verse 1:\" or \"Chorus:\" alone.\n\nInclude exactly 2 music breaks (instrumental-only sections) placed naturally within the song — each with specific instruments and a mood description.\n\nUse the provided rhythms, emotions, instruments, and vocal characteristics directly in the section headers to guide the production feel. Return only the formatted lyrics — no explanations, intros, or meta-commentary.",
  userInstruction:
    'Write unique lyrics for the following song. Incorporate the listed rhythms, emotions, instruments, and vocal styles directly into the section headers to describe how each part should sound.',
  song: 'Song name',
  description: 'Description',
  rhythms: 'Rhythms',
  emotions: 'Emotions',
  instruments: 'Instruments',
  voices: 'Voices',
};

// ── Generate opts / LLM props ─────────────────────────────────────────────────

type GenerateOpts = {
  includeRhythms: boolean;
  includeEmotions: boolean;
  includeInstruments: boolean;
  includeVoices: boolean;
};

type LyricsLlmProps = {
  lyricsPreview: string;
  isGenerating: boolean;
  onGenerate: (opts: GenerateOpts) => void;
  onAccept: () => void;
  onDiscard: () => void;
};

// ── User message builder ──────────────────────────────────────────────────────

function buildUserMessage(
  state: FormState,
  opts: GenerateOpts,
  locale: string,
  t: TFn,
): string {
  const labels = LOCALE_LABELS[locale] ?? DEFAULT_LOCALE_LABELS;
  const lines: string[] = [labels.userInstruction, ''];

  if (state.songName.trim()) {
    lines.push(`${labels.song}: ${state.songName.trim()}`);
  }
  if (state.lyricsPrompt.trim()) {
    lines.push(`${labels.description}: ${state.lyricsPrompt.trim()}`);
  }
  if (opts.includeRhythms && state.rhythms.length > 0) {
    lines.push(`${labels.rhythms}: ${state.rhythms.join(', ')}`);
  }
  if (opts.includeEmotions && state.emotions.length > 0) {
    const emotionLabels = state.emotions.map((e) =>
      t(`style.emotions.${e}` as `style.emotions.${EmotionKey}`),
    );
    lines.push(`${labels.emotions}: ${emotionLabels.join(', ')}`);
  }
  if (opts.includeInstruments && state.instruments.length > 0) {
    const instrumentLabels = state.instruments.map((i) =>
      t(`style.instruments.${i}` as `style.instruments.${InstrumentKey}`),
    );
    lines.push(`${labels.instruments}: ${instrumentLabels.join(', ')}`);
  }
  if (opts.includeVoices && state.voices.length > 0) {
    const voiceLabels = state.voices.map((v) => {
      const gender = t(`style.genders.${v.gender}` as `style.genders.${VoiceGender}`);
      const variant = v.variant
        ? t(`style.voiceVariants.${v.variant}` as `style.voiceVariants.${VoiceVariantKey}`)
        : null;
      return variant ? `${gender} · ${variant}` : gender;
    });
    lines.push(`${labels.voices}: ${voiceLabels.join(', ')}`);
  }

  return lines.join('\n');
}

// ── Workflow step descriptor ───────────────────────────────────────────────────

type StepConfig = {
  id: string;
  getTitle: (t: TFn) => string;
  getSubtitle: (t: TFn) => string;
  render: (state: FormState, handlers: FormHandlers, t: TFn, llm?: LyricsLlmProps) => ReactNode;
  canProceed: (state: FormState) => boolean;
};

// ── SVG arrow icons ───────────────────────────────────────────────────────────

function ChevronLeft() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ── SpeechFieldButton ─────────────────────────────────────────────────────────

function SpeechFieldButton({
  getValue,
  onChange,
  language,
}: {
  getValue: () => string;
  onChange: (v: string) => void;
  language?: string;
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const getValueRef = useRef(getValue);
  getValueRef.current = getValue;

  const handleTranscript = useCallback((text: string) => {
    const current = getValueRef.current();
    onChangeRef.current(current ? `${current} ${text}` : text);
  }, []);

  return (
    <SpeechButton
      language={language}
      onTranscript={handleTranscript}
      micIcon="/icons/mic.svg"
    />
  );
}

// ── Entry step: type selection ────────────────────────────────────────────────

function StepType({
  vocal,
  onSelect,
  t,
}: {
  vocal: boolean | null;
  onSelect: (value: boolean) => void;
  t: TFn;
}) {
  return (
    <Box display="flex" gap={16}>
      {/* Vocal option */}
      <Button
        unstyled
        className="music-form__option-card"
        onClick={() => onSelect(true)}
        flex={1}
        display="flex"
        flexDirection="column"
        alignItems="center"
        gap={12}
        padding={24}
        borderRadius={12}
        border={
          vocal === true
            ? '2px solid var(--accent)'
            : '2px solid var(--border, #e5e7eb)'
        }
        backgroundColor={
          vocal === true
            ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
            : 'transparent'
        }
        color="var(--foreground)"
        aria-pressed={vocal === true}
      >
        <Box
          width={64}
          height={64}
          borderRadius="50%"
          backgroundColor="rgba(255,255,255,0.85)"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <Image src="/icons/music.svg" width={40} height={40} alt="" />
        </Box>
        <Typography as="span" variant="body-sm" fontWeight={600}>
          {t('type.vocalLabel')}
        </Typography>
      </Button>

      {/* Instrumental option */}
      <Button
        unstyled
        className="music-form__option-card"
        onClick={() => onSelect(false)}
        flex={1}
        display="flex"
        flexDirection="column"
        alignItems="center"
        gap={12}
        padding={24}
        borderRadius={12}
        border={
          vocal === false
            ? '2px solid var(--accent)'
            : '2px solid var(--border, #e5e7eb)'
        }
        backgroundColor={
          vocal === false
            ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
            : 'transparent'
        }
        color="var(--foreground)"
        aria-pressed={vocal === false}
      >
        <Box
          width={64}
          height={64}
          borderRadius="50%"
          backgroundColor="rgba(255,255,255,0.85)"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <Image src="/icons/instrumental.svg" width={40} height={40} alt="" />
        </Box>
        <Typography as="span" variant="body-sm" fontWeight={600}>
          {t('type.instrumentalLabel')}
        </Typography>
      </Button>
    </Box>
  );
}

// ── StepLyrics ────────────────────────────────────────────────────────────────

function StepLyrics({
  state,
  handlers,
  t,
  llm,
}: {
  state: FormState;
  handlers: FormHandlers;
  t: TFn;
  llm?: LyricsLlmProps;
}) {
  const locale = useLocale();

  // Category include switches — default ON, only shown when selections exist
  const [includeRhythms, setIncludeRhythms] = useState(true);
  const [includeEmotions, setIncludeEmotions] = useState(true);
  const [includeInstruments, setIncludeInstruments] = useState(true);
  const [includeVoices, setIncludeVoices] = useState(true);

  const hasRhythms = state.rhythms.length > 0;
  const hasEmotions = state.emotions.length > 0;
  const hasInstruments = state.instruments.length > 0;
  const hasVoices = state.voices.length > 0;
  const hasAnySelections = hasRhythms || hasEmotions || hasInstruments || hasVoices;

  const showPreview = !!(llm?.lyricsPreview || llm?.isGenerating);

  return (
    <Box display="flex" flexDirection="column" gap={16}>
      {/* Song name — common to both modes */}
      <TextInput
        label={t('lyrics.songNameLabel')}
        value={state.songName}
        onChange={handlers.onSongNameChange}
      />

      {/* Mode selector */}
      <Box display="flex" gap={8}>
        <Button
          unstyled
          className="music-form__lyric-btn"
          onClick={() => handlers.onSelectLyricsMode('custom')}
          flex={1}
          padding="10px 8px"
          borderRadius={8}
          border={
            state.lyricsMode === 'custom'
              ? '2px solid var(--accent)'
              : '2px solid var(--border, #e5e7eb)'
          }
          backgroundColor={
            state.lyricsMode === 'custom'
              ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
              : 'transparent'
          }
          color="var(--foreground)"
          aria-pressed={state.lyricsMode === 'custom'}
          styles={{ fontSize: 13 }}
        >
          {t('lyrics.ownLyrics')}
        </Button>

        <Button
          unstyled
          className="music-form__lyric-btn"
          onClick={() => handlers.onSelectLyricsMode('generate')}
          flex={1}
          padding="10px 8px"
          borderRadius={8}
          border={
            state.lyricsMode === 'generate'
              ? '2px solid var(--accent)'
              : '2px solid var(--border, #e5e7eb)'
          }
          backgroundColor={
            state.lyricsMode === 'generate'
              ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
              : 'transparent'
          }
          color="var(--foreground)"
          aria-pressed={state.lyricsMode === 'generate'}
          styles={{ fontSize: 13 }}
        >
          {t('lyrics.generateLyrics')}
        </Button>
      </Box>

      {/* Custom lyrics textarea */}
      {state.lyricsMode === 'custom' && (
        <TextInput
          label={t('lyrics.lyricsLabel')}
          value={state.lyrics}
          onChange={handlers.onLyricsChange}
          multirow
          rows={8}
        />
      )}

      {/* Generate mode */}
      {state.lyricsMode === 'generate' && (
        <Box display="flex" flexDirection="column" gap={12}>
          {/* Prompt textarea with label row + STT button */}
          <Box display="flex" flexDirection="column" gap={6}>
            <Box
              display="flex"
              alignItems="center"
              justifyContent="space-between"
            >
              <label htmlFor="lyrics-prompt" className="music-form__field-label">
                {t('lyrics.promptLabel')}
              </label>
              <SpeechFieldButton
                getValue={() => state.lyricsPrompt}
                onChange={handlers.onPromptChange}
                language={locale}
              />
            </Box>
            <TextInput
              id="lyrics-prompt"
              value={state.lyricsPrompt}
              onChange={handlers.onPromptChange}
              multirow
              rows={4}
            />
          </Box>

          {/* Category switches — only shown for categories that have selections */}
          {hasAnySelections && (
            <Box display="flex" flexDirection="column" gap={10}>
              {hasRhythms && (
                <Box display="flex" flexDirection="column" gap={2}>
                  <Box display="flex" alignItems="center" gap={8}>
                    <Switch checked={includeRhythms} onChange={setIncludeRhythms} />
                    <Typography as="span" variant="body-sm" fontWeight={600}>
                      {t('lyrics.includeRhythms')}
                    </Typography>
                  </Box>
                  {includeRhythms && (
                    <Typography
                      variant="body-sm"
                      color="var(--muted-foreground, #6b7280)"
                      marginLeft={50}
                    >
                      {state.rhythms.join(', ')}
                    </Typography>
                  )}
                </Box>
              )}

              {hasEmotions && (
                <Box display="flex" flexDirection="column" gap={2}>
                  <Box display="flex" alignItems="center" gap={8}>
                    <Switch checked={includeEmotions} onChange={setIncludeEmotions} />
                    <Typography as="span" variant="body-sm" fontWeight={600}>
                      {t('lyrics.includeEmotions')}
                    </Typography>
                  </Box>
                  {includeEmotions && (
                    <Typography
                      variant="body-sm"
                      color="var(--muted-foreground, #6b7280)"
                      marginLeft={50}
                    >
                      {state.emotions
                        .map((e) =>
                          t(`style.emotions.${e}` as `style.emotions.${EmotionKey}`),
                        )
                        .join(', ')}
                    </Typography>
                  )}
                </Box>
              )}

              {hasInstruments && (
                <Box display="flex" flexDirection="column" gap={2}>
                  <Box display="flex" alignItems="center" gap={8}>
                    <Switch checked={includeInstruments} onChange={setIncludeInstruments} />
                    <Typography as="span" variant="body-sm" fontWeight={600}>
                      {t('lyrics.includeInstruments')}
                    </Typography>
                  </Box>
                  {includeInstruments && (
                    <Typography
                      variant="body-sm"
                      color="var(--muted-foreground, #6b7280)"
                      marginLeft={50}
                    >
                      {state.instruments
                        .map((i) =>
                          t(`style.instruments.${i}` as `style.instruments.${InstrumentKey}`),
                        )
                        .join(', ')}
                    </Typography>
                  )}
                </Box>
              )}

              {hasVoices && (
                <Box display="flex" flexDirection="column" gap={2}>
                  <Box display="flex" alignItems="center" gap={8}>
                    <Switch checked={includeVoices} onChange={setIncludeVoices} />
                    <Typography as="span" variant="body-sm" fontWeight={600}>
                      {t('lyrics.includeVoices')}
                    </Typography>
                  </Box>
                  {includeVoices && (
                    <Typography
                      variant="body-sm"
                      color="var(--muted-foreground, #6b7280)"
                      marginLeft={50}
                    >
                      {state.voices
                        .map((v) => {
                          const gender = t(
                            `style.genders.${v.gender}` as `style.genders.${VoiceGender}`,
                          );
                          const variant = v.variant
                            ? t(
                                `style.voiceVariants.${v.variant}` as `style.voiceVariants.${VoiceVariantKey}`,
                              )
                            : null;
                          return variant ? `${gender} · ${variant}` : gender;
                        })
                        .join(', ')}
                    </Typography>
                  )}
                </Box>
              )}
            </Box>
          )}

          {/* Generate button */}
          <Button
            text={t('lyrics.generateWithAi')}
            onClick={() =>
              llm?.onGenerate({
                includeRhythms,
                includeEmotions,
                includeInstruments,
                includeVoices,
              })
            }
            disabled={!state.lyricsPrompt.trim() || !!llm?.isGenerating}
          />

          {/* Streaming preview panel */}
          {showPreview && (
            <Box
              display="flex"
              flexDirection="column"
              gap={10}
              className="music-form__ai-preview"
            >
              <Typography variant="body-sm" className="music-form__ai-preview-text">
                {llm?.lyricsPreview || '…'}
              </Typography>
              <Box display="flex" gap={8} alignItems="center">
                {llm?.isGenerating ? (
                  <Button
                    text={t('lyrics.aiStop')}
                    unstyled
                    className="music-form__cancel-btn"
                    onClick={llm?.onDiscard}
                  />
                ) : (
                  <>
                    <Button
                      text={t('lyrics.aiAccept')}
                      onClick={llm?.onAccept}
                    />
                    <Button
                      text={t('lyrics.aiDiscard')}
                      unstyled
                      className="music-form__cancel-btn"
                      onClick={llm?.onDiscard}
                    />
                  </>
                )}
              </Box>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

// ── Workflow definitions ──────────────────────────────────────────────────────

const VOCAL_WORKFLOW: StepConfig[] = [
  {
    id: 'style',
    getTitle: (t) => t('style.title'),
    getSubtitle: (t) => t('style.subtitle'),
    render: (state, handlers, t) => (
      <StepStyle state={state} handlers={handlers} t={t} />
    ),
    canProceed: () => true, // all selections are optional
  },
  {
    id: 'lyrics',
    getTitle: (t) => t('lyrics.title'),
    getSubtitle: (t) => t('lyrics.subtitle'),
    render: (state, handlers, t, llm) => (
      <StepLyrics state={state} handlers={handlers} t={t} llm={llm} />
    ),
    canProceed: (state) => {
      if (!state.songName.trim()) return false;
      if (state.lyricsMode === null) return false;
      if (state.lyricsMode === 'custom') return state.lyrics.trim().length > 0;
      return state.lyricsPrompt.trim().length > 0;
    },
  },
];

const INSTRUMENTAL_WORKFLOW: StepConfig[] = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

function toggleItem(arr: string[], item: string): string[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

// ── Main form ─────────────────────────────────────────────────────────────────

export function MusicForm() {
  const t = useTranslations('AppPage');
  const locale = useLocale();

  const [vocal, setVocal] = useState<boolean | null>(null);
  const [currentStep, setCurrentStep] = useState(0); // 0 = entry step
  const [formState, setFormState] = useState<FormState>({
    rhythms: [],
    emotions: [],
    instruments: [],
    voices: [],
    songName: '',
    lyricsMode: null,
    lyrics: '',
    lyricsPrompt: '',
  });

  // ── LLM for lyrics generation ─────────────────────────────────────────────
  const { streamingText, isGenerating, generate, abort, reset: resetLlm } =
    useGroqProxy();

  const [lyricsPreview, setLyricsPreview] = useState('');

  useEffect(() => {
    if (!streamingText) return;
    setLyricsPreview(streamingText);
  }, [streamingText]);

  // ── Active workflow ───────────────────────────────────────────────────────
  const activeWorkflow =
    vocal === true
      ? VOCAL_WORKFLOW
      : vocal === false
        ? INSTRUMENTAL_WORKFLOW
        : [];

  const totalSteps = 1 + activeWorkflow.length; // 1 for the entry step
  const isEntryStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;
  const workflowStep = isEntryStep ? null : activeWorkflow[currentStep - 1];

  // ── Validation ────────────────────────────────────────────────────────────
  const canGoNext = isEntryStep
    ? vocal !== null
    : (workflowStep?.canProceed(formState) ?? false);

  // ── Navigation ────────────────────────────────────────────────────────────
  function goNext() {
    if (!canGoNext || isLastStep) return;
    setCurrentStep((s) => s + 1);
  }

  function goBack() {
    if (currentStep === 0) return;
    setCurrentStep((s) => s - 1);
  }

  // ── Entry step: selecting a workflow resets downstream state ──────────────
  function selectVocal(value: boolean) {
    if (vocal !== value) {
      setFormState({
        rhythms: [],
        emotions: [],
        instruments: [],
        voices: [],
        songName: '',
        lyricsMode: null,
        lyrics: '',
        lyricsPrompt: '',
      });
    }
    setVocal(value);
  }

  // ── Form handlers ─────────────────────────────────────────────────────────
  const handlers: FormHandlers = {
    // Style step
    onToggleRhythm: (r) =>
      setFormState((s) => ({ ...s, rhythms: toggleItem(s.rhythms, r) })),
    onToggleEmotion: (e) =>
      setFormState((s) => ({ ...s, emotions: toggleItem(s.emotions, e) })),
    onToggleInstrument: (i) =>
      setFormState((s) => ({
        ...s,
        instruments: toggleItem(s.instruments, i),
      })),
    onAddVoice: (voice) =>
      setFormState((s) => ({ ...s, voices: [...s.voices, voice] })),
    onRemoveVoice: (id) =>
      setFormState((s) => ({
        ...s,
        voices: s.voices.filter((v) => v.id !== id),
      })),
    // Lyrics step
    onSongNameChange: (v) => setFormState((s) => ({ ...s, songName: v })),
    onSelectLyricsMode: (mode: LyricsMode) => {
      setFormState((s) =>
        s.lyricsMode !== mode
          ? { ...s, lyricsMode: mode, lyrics: '', lyricsPrompt: '' }
          : s,
      );
    },
    onLyricsChange: (v) => setFormState((s) => ({ ...s, lyrics: v })),
    onPromptChange: (v) => setFormState((s) => ({ ...s, lyricsPrompt: v })),
  };

  // ── Lyrics generation ─────────────────────────────────────────────────────

  async function generateLyrics(opts: GenerateOpts) {
    setLyricsPreview('');
    resetLlm();
    const labels = LOCALE_LABELS[locale] ?? DEFAULT_LOCALE_LABELS;
    await generate([
      { role: 'system', content: labels.system },
      { role: 'user', content: buildUserMessage(formState, opts, locale, t) },
    ]);
  }

  function acceptGenerated() {
    if (lyricsPreview) {
      setFormState((s) => ({ ...s, lyrics: lyricsPreview }));
    }
    setLyricsPreview('');
    resetLlm();
  }

  function discardGenerated() {
    if (isGenerating) abort();
    setLyricsPreview('');
    resetLlm();
  }

  const lyricsLlmProps: LyricsLlmProps = {
    lyricsPreview,
    isGenerating,
    onGenerate: generateLyrics,
    onAccept: acceptGenerated,
    onDiscard: discardGenerated,
  };

  // ── Title / subtitle ──────────────────────────────────────────────────────
  const title = isEntryStep ? t('type.title') : workflowStep!.getTitle(t);
  const subtitle = isEntryStep
    ? t('type.subtitle')
    : workflowStep!.getSubtitle(t);

  return (
    <Container
      display="flex"
      alignItems="center"
      styles={{
        minHeight: '100vh',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        paddingTop: 'var(--ui-navbar-height)',
      }}
      paddingX={10}
    >
      {/* Title row (outside the card, like auth-form) */}
      <Box width="100%" maxWidth={420} marginBottom={20} marginTop={32}>
        <Typography as="h1" variant="h2" fontWeight={600} marginBottom={4}>
          {title}
        </Typography>
        <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
          {subtitle}
        </Typography>
      </Box>

      {/* Form card */}
      <Box
        width="100%"
        maxWidth={420}
        padding={10}
        borderRadius={12}
        display="flex"
        flexDirection="column"
        gap={20}
        elevation={5}
        backgroundColor="var(--surface-1)"
      >
        {/* Step content */}
        {isEntryStep ? (
          <StepType vocal={vocal} onSelect={selectVocal} t={t} />
        ) : (
          workflowStep!.render(formState, handlers, t, lyricsLlmProps)
        )}

        {/* Navigation row */}
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          marginTop={4}
        >
          {/* Back arrow */}
          <Button
            unstyled
            className="music-form__arrow-btn"
            onClick={goBack}
            disabled={currentStep === 0}
            width={36}
            height={36}
            borderRadius="50%"
            display="flex"
            alignItems="center"
            justifyContent="center"
            color="var(--foreground)"
            aria-label={t('nav.back')}
          >
            <ChevronLeft />
          </Button>

          {/* Dots */}
          <Box
            display="flex"
            gap={8}
            alignItems="center"
            role="tablist"
            aria-label="Steps"
          >
            {Array.from({ length: totalSteps }, (_, i) => (
              <Box
                key={i}
                className={`music-form__dot${i === currentStep ? ' music-form__dot--active' : ''}`}
                width={8}
                height={8}
                borderRadius="50%"
                backgroundColor={
                  i === currentStep
                    ? 'var(--accent)'
                    : 'var(--accent-foreground, #d1d5db)'
                }
                role="tab"
                aria-selected={i === currentStep}
              />
            ))}
          </Box>

          {/* Next arrow */}
          <Button
            unstyled
            className="music-form__arrow-btn"
            onClick={goNext}
            disabled={!canGoNext || isLastStep}
            width={36}
            height={36}
            borderRadius="50%"
            display="flex"
            alignItems="center"
            justifyContent="center"
            color="var(--foreground)"
            aria-label={t('nav.next')}
          >
            <ChevronRight />
          </Button>
        </Box>
      </Box>
    </Container>
  );
}
