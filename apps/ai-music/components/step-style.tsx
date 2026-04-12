'use client';

import { useState } from 'react';
import { Box } from '@repo/ui/core-elements/box';
import { Button } from '@repo/ui/core-elements/button';
import { Typography } from '@repo/ui/core-elements/typography';
import type {
  FormState,
  FormHandlers,
  TFn,
  Voice,
  VoiceGender,
} from './music-form.types';
import './step-style.css';

// ── Data ──────────────────────────────────────────────────────────────────────

// Rhythm names are intentionally not translated — they are internationally
// recognised genre labels (Rock, Pop, Mariachi, etc.).
const RHYTHMS = [
  'Rock', 'Pop', 'Electronico', 'Metal', 'Country', 'Mariachi', 'Balada',
  'Jazz', 'Prehispanico', 'Tropical', 'Cumbia', 'Salsa', 'Trio', 'Trap',
  'Merengue', 'Mambo', 'Ranchera', 'Regional Mexicano', 'Corrido', 'Norteño',
  'Tribal', 'Banda Sinaloense', 'Bachata', 'Reggaeton', 'Reggae', 'Urbano',
  'K-Pop', 'Hip-Hop', 'Rap', 'Blues', 'Ska', 'Indie', 'Acustico', 'R&B',
] as const;

const EMOTIONS = [
  'happiness', 'joy', 'love', 'sadness', 'proud', 'romantic', 'nostalgic',
  'spite', 'angry', 'melodic', 'modern', 'emotional', 'energetic', 'peaceful',
  'dark', 'uplifting', 'melancholic', 'passionate',
] as const;

type EmotionKey = (typeof EMOTIONS)[number];

const INSTRUMENTS = [
  'piano', 'acousticGuitar', 'electricGuitar', 'bassGuitar', 'violin',
  'cello', 'drums', 'trumpet', 'saxophone', 'flute', 'clarinet',
  'synthesizer', 'organ', 'harp', 'banjo', 'ukulele', 'percussion',
] as const;

type InstrumentKey = (typeof INSTRUMENTS)[number];

const VOICE_VARIANTS: Record<VoiceGender, readonly string[]> = {
  male: ['deep', 'tenor', 'soft', 'young', 'raspy', 'powerful', 'warm'],
  female: ['soprano', 'alto', 'soft', 'young', 'breathy', 'powerful', 'warm'],
};

// Union of all possible variant strings for the type assertion on t()
type VoiceVariantKey =
  | 'deep' | 'tenor' | 'soft' | 'young' | 'raspy'
  | 'powerful' | 'warm' | 'soprano' | 'alto' | 'breathy';

// ── Shared sub-components ─────────────────────────────────────────────────────

function PillButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      unstyled
      className={`step-style__pill${selected ? ' step-style__pill--selected' : ''}`}
      onClick={onClick}
      aria-pressed={selected}
    >
      {label}
    </Button>
  );
}

function StyleSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Box display="flex" flexDirection="column" gap={10}>
      <Typography as="h3" variant="body-sm" fontWeight={700}>
        {title}
      </Typography>
      <Box display="flex" flexWrap="wrap" gap={8}>
        {children}
      </Box>
    </Box>
  );
}

// ── Voice pill — shows an added voice with a remove button ────────────────────

function VoicePill({
  voice,
  onRemove,
  t,
}: {
  voice: Voice;
  onRemove: () => void;
  t: TFn;
}) {
  const genderLabel = t(
    `style.genders.${voice.gender}` as `style.genders.${VoiceGender}`,
  );
  const variantLabel = voice.variant
    ? t(
        `style.voiceVariants.${voice.variant}` as `style.voiceVariants.${VoiceVariantKey}`,
      )
    : null;
  const label = variantLabel ? `${genderLabel} · ${variantLabel}` : genderLabel;

  return (
    <Box
      display="flex"
      alignItems="center"
      gap={4}
      padding="5px 10px"
      borderRadius={999}
      border="1.5px solid var(--accent)"
      backgroundColor="color-mix(in srgb, var(--accent) 14%, transparent)"
    >
      <Typography as="span" variant="body-sm">
        {label}
      </Typography>
      <Button
        unstyled
        className="step-style__voice-remove"
        onClick={onRemove}
        aria-label={t('style.removeVoice')}
      >
        ×
      </Button>
    </Box>
  );
}

// ── VoiceAdd — inline sequential form: gender → variants → confirm ────────────

function VoiceAdd({
  onAdd,
  onCancel,
  t,
}: {
  onAdd: (voice: Voice) => void;
  onCancel: () => void;
  t: TFn;
}) {
  const [gender, setGender] = useState<VoiceGender | null>(null);
  const [variant, setVariant] = useState<string | null>(null);

  function handleGenderSelect(g: VoiceGender) {
    setGender(g);
    setVariant(null); // reset variant when gender changes
  }

  function handleConfirm() {
    if (!gender) return;
    onAdd({ id: crypto.randomUUID(), gender, variant });
  }

  return (
    <Box
      display="flex"
      flexDirection="column"
      gap={12}
      padding={12}
      borderRadius={8}
      border="1.5px solid var(--border, #e5e7eb)"
    >
      {/* Step 1: gender (mutually exclusive) */}
      <Box display="flex" flexDirection="column" gap={8}>
        <Typography
          as="span"
          variant="body-sm"
          fontWeight={600}
          color="var(--muted-foreground, #6b7280)"
        >
          {t('style.genderLabel')}
        </Typography>
        <Box display="flex" gap={8}>
          <PillButton
            label={t('style.genders.male')}
            selected={gender === 'male'}
            onClick={() => handleGenderSelect('male')}
          />
          <PillButton
            label={t('style.genders.female')}
            selected={gender === 'female'}
            onClick={() => handleGenderSelect('female')}
          />
        </Box>
      </Box>

      {/* Step 2: variants — appear only after gender is chosen */}
      {gender && (
        <Box display="flex" flexDirection="column" gap={8}>
          <Typography
            as="span"
            variant="body-sm"
            fontWeight={600}
            color="var(--muted-foreground, #6b7280)"
          >
            {t('style.variantLabel')}
          </Typography>
          <Box display="flex" flexWrap="wrap" gap={8}>
            {VOICE_VARIANTS[gender].map((v) => (
              <PillButton
                key={v}
                label={t(
                  `style.voiceVariants.${v}` as `style.voiceVariants.${VoiceVariantKey}`,
                )}
                selected={variant === v}
                onClick={() => setVariant((prev) => (prev === v ? null : v))}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* Confirm / Cancel */}
      <Box display="flex" gap={8} justifyContent="flex-end">
        <Button
          unstyled
          className="step-style__action-btn step-style__action-btn--cancel"
          onClick={onCancel}
        >
          {t('style.cancel')}
        </Button>
        <Button
          unstyled
          className="step-style__action-btn step-style__action-btn--confirm"
          onClick={handleConfirm}
          disabled={!gender}
        >
          {t('style.addVoiceConfirm')}
        </Button>
      </Box>
    </Box>
  );
}

// ── StepStyle ─────────────────────────────────────────────────────────────────

export function StepStyle({
  state,
  handlers,
  t,
}: {
  state: FormState;
  handlers: FormHandlers;
  t: TFn;
}) {
  const [showVoiceAdd, setShowVoiceAdd] = useState(false);

  function handleAddVoice(voice: Voice) {
    handlers.onAddVoice(voice);
    setShowVoiceAdd(false);
  }

  return (
    <Box display="flex" flexDirection="column" gap={20}>
      {/* Rhythms */}
      <StyleSection title={t('style.rhythmsTitle')}>
        {RHYTHMS.map((r) => (
          <PillButton
            key={r}
            label={r}
            selected={state.rhythms.includes(r)}
            onClick={() => handlers.onToggleRhythm(r)}
          />
        ))}
      </StyleSection>

      {/* Emotions */}
      <StyleSection title={t('style.emotionsTitle')}>
        {EMOTIONS.map((e) => (
          <PillButton
            key={e}
            label={t(`style.emotions.${e}` as `style.emotions.${EmotionKey}`)}
            selected={state.emotions.includes(e)}
            onClick={() => handlers.onToggleEmotion(e)}
          />
        ))}
      </StyleSection>

      {/* Instruments */}
      <StyleSection title={t('style.instrumentsTitle')}>
        {INSTRUMENTS.map((i) => (
          <PillButton
            key={i}
            label={t(
              `style.instruments.${i}` as `style.instruments.${InstrumentKey}`,
            )}
            selected={state.instruments.includes(i)}
            onClick={() => handlers.onToggleInstrument(i)}
          />
        ))}
      </StyleSection>

      {/* Voices */}
      <Box display="flex" flexDirection="column" gap={10}>
        <Typography as="h3" variant="body-sm" fontWeight={700}>
          {t('style.voicesTitle')}
        </Typography>
        <Box display="flex" flexWrap="wrap" gap={8} alignItems="center">
          {state.voices.map((v) => (
            <VoicePill
              key={v.id}
              voice={v}
              onRemove={() => handlers.onRemoveVoice(v.id)}
              t={t}
            />
          ))}
          {!showVoiceAdd && (
            <Button
              unstyled
              className="step-style__add-voice-btn"
              onClick={() => setShowVoiceAdd(true)}
            >
              {t('style.addVoice')}
            </Button>
          )}
        </Box>
        {showVoiceAdd && (
          <VoiceAdd
            onAdd={handleAddVoice}
            onCancel={() => setShowVoiceAdd(false)}
            t={t}
          />
        )}
      </Box>
    </Box>
  );
}
