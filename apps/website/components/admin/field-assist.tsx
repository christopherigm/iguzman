"use client";

import { useRef, useCallback, useEffect } from "react";
import { SpeechButton } from "@repo/ui/core-elements/speech-button";
import { type LlmMessage } from "@repo/ui/use-llm";
import { PARAGRAPH_WORD_COUNTS } from "./paragraph-options";

// Shared field-assist helpers (speech dictation + LLM enhance/translate prompts).
//
// Extracted from `admin-form.tsx` so the flat admin form and the standalone
// bilingual groups (e.g. the System page's Spotlight section) build identical
// prompts and dictate the same way, rather than each carrying its own copy.

// ── SpeechFieldButton ──────────────────────────────────────────────────────
//
// Stable mic button for a single text field. Uses refs so `onTranscript`
// identity never changes across renders, preventing SpeechButton's effect from
// re-firing after the parent updates values in response to a transcript (which
// would cause an infinite append loop). The dictation language follows the
// field key: an `en_`-prefixed field dictates in English, everything else in
// Spanish.

export function SpeechFieldButton({
  fieldKey,
  getFieldValue,
  onChange,
}: {
  fieldKey: string;
  getFieldValue: () => string;
  onChange: (key: string, value: unknown) => void;
}) {
  const onChangeRef = useRef(onChange);
  const getValueRef = useRef(getFieldValue);
  useEffect(() => {
    onChangeRef.current = onChange;
    getValueRef.current = getFieldValue;
  });

  const handleTranscript = useCallback(
    (text: string) => {
      const current = getValueRef.current();
      onChangeRef.current(fieldKey, current ? `${current} ${text}` : text);
    },
    [fieldKey], // fieldKey is stable per mounted instance
  );

  return (
    <SpeechButton
      language={fieldKey.startsWith("en_") ? "en" : "es"}
      onTranscript={handleTranscript}
      micIcon="/icons/mic.svg"
    />
  );
}

// ── LLM enhance helpers ────────────────────────────────────────────────────

export const FIELD_CONTEXT: Record<string, { en: string; es: string }> = {
  about: {
    en: "company about/overview section",
    es: 'sección "Acerca de" de la empresa',
  },
  en_about: {
    en: "company about/overview section",
    es: 'sección "Acerca de" de la empresa',
  },
  mission: { en: "company mission statement", es: "misión de la empresa" },
  en_mission: { en: "company mission statement", es: "misión de la empresa" },
  vision: { en: "company vision statement", es: "visión de la empresa" },
  en_vision: { en: "company vision statement", es: "visión de la empresa" },
  privacy_policy: { en: "privacy policy", es: "política de privacidad" },
  en_privacy_policy: { en: "privacy policy", es: "política de privacidad" },
  terms_and_conditions: {
    en: "terms and conditions",
    es: "términos y condiciones",
  },
  en_terms_and_conditions: {
    en: "terms and conditions",
    es: "términos y condiciones",
  },
  user_data: { en: "user data policy", es: "política de datos del usuario" },
  en_user_data: { en: "user data policy", es: "política de datos del usuario" },
  highlights_subtitle: {
    en: "highlights section description",
    es: "descripción de la sección de destacados",
  },
  en_highlights_subtitle: {
    en: "highlights section description",
    es: "descripción de la sección de destacados",
  },
  spotlight_text: {
    en: "featured spotlight section description",
    es: "descripción de la sección destacada",
  },
  en_spotlight_text: {
    en: "featured spotlight section description",
    es: "descripción de la sección destacada",
  },
  description: {
    en: "product/service description",
    es: "descripción del producto o servicio",
  },
  en_description: {
    en: "product/service description",
    es: "descripción del producto o servicio",
  },
  short_description: {
    en: "short product/service description",
    es: "descripción corta del producto o servicio",
  },
  en_short_description: {
    en: "short product/service description",
    es: "descripción corta del producto o servicio",
  },
};

export function buildEnhanceMessages(
  text: string,
  fieldKey: string,
  paragraphs: number,
  paragraphLength: string,
): LlmMessage[] {
  const isEnglish = fieldKey.startsWith("en_");
  const ctx = FIELD_CONTEXT[fieldKey] ?? {
    en: "website content",
    es: "contenido del sitio web",
  };
  const { min, max } = PARAGRAPH_WORD_COUNTS[paragraphLength] ?? {
    min: 80,
    max: 120,
  };
  const paraLabel = paragraphs === 1 ? "paragraph" : "paragraphs";

  if (isEnglish) {
    return [
      {
        role: "system",
        content: `You are a professional copywriter for a company website. Rewrite and expand the following text into polished, professional prose suitable for the ${ctx.en}. Write exactly ${paragraphs} ${paraLabel}. Each paragraph must be between ${min} and ${max} words. Add relevant detail, context, or supporting ideas - do not pad with filler. Return only the improved text - no explanations, labels, or formatting marks.`,
      },
      { role: "user", content: text },
    ];
  }
  return [
    {
      role: "system",
      content: `Eres un redactor profesional para un sitio web corporativo. Reescribe y amplía el siguiente texto en prosa profesional, adecuada para la ${ctx.es} de la empresa. Escribe exactamente ${paragraphs} párrafo${paragraphs !== 1 ? "s" : ""}. Cada párrafo debe tener entre ${min} y ${max} palabras. Agrega detalles relevantes, contexto o ideas de apoyo - no uses relleno. Devuelve únicamente el texto mejorado - sin explicaciones, etiquetas ni marcas de formato.`,
    },
    { role: "user", content: text },
  ];
}

// ── LLM translate helpers ──────────────────────────────────────────────────

export function buildTranslateMessages(
  text: string,
  sourceFieldKey: string,
): LlmMessage[] {
  const isSourceEnglish = sourceFieldKey.startsWith("en_");
  if (isSourceEnglish) {
    return [
      {
        role: "system",
        content:
          "You are a professional translator. Translate the following text from English to Spanish. Return only the translated text - no explanations, labels, or formatting marks.",
      },
      { role: "user", content: text },
    ];
  }
  return [
    {
      role: "system",
      content:
        "Eres un traductor profesional. Traduce el siguiente texto del español al inglés. Devuelve únicamente el texto traducido - sin explicaciones, etiquetas ni marcas de formato.",
    },
    { role: "user", content: text },
  ];
}
