import { type LlmMessage } from "@repo/ui/use-llm";
import { PARAGRAPH_WORD_COUNTS } from "./paragraph-options";

/**
 * The prompts behind the CMS's two per-field buttons: **enhance** (rewrite and
 * expand this text) and **translate** (fill the other half of a Spanish/English
 * pair).
 *
 * Both stream through `/api/ai/chat` → animals-api's `/api/ai/chat/`, which
 * owns the provider and the keys. Nothing here writes to the database: the
 * result lands in a preview the author accepts or discards, because a journal's
 * whole value is that a person vouched for what it says.
 *
 * The voice these prompts ask for is a **field naturalist's**, not a
 * copywriter's - this is the one place the port from website's CMS genuinely had
 * to change. A prompt asking for "polished, professional prose suitable for a
 * company website" turns a note about a fawn into marketing, which is exactly
 * what an author would then have to undo by hand.
 */

/** What each field is *for*, so the model writes to the right length and register. */
export const FIELD_CONTEXT: Record<string, { en: string; es: string }> = {
  description: {
    en: "the full journal entry - what was seen, where, and what it was doing",
    es: "la entrada completa del diario - qué se vio, dónde y qué estaba haciendo",
  },
  short_description: {
    en: "a one- or two-line excerpt shown on a feed card",
    es: "un extracto de una o dos líneas para la tarjeta del listado",
  },
  site_description: {
    en: "a short description of this nature journal as a whole",
    es: "una descripción breve de este diario de naturaleza en conjunto",
  },
};

// Every `en_` twin shares its Spanish counterpart's context.
Object.keys({ ...FIELD_CONTEXT }).forEach((key) => {
  const context = FIELD_CONTEXT[key];
  if (context) FIELD_CONTEXT[`en_${key}`] = context;
});

const DEFAULT_CONTEXT = {
  en: "an entry in a nature field journal",
  es: "una entrada de un diario de campo de naturaleza",
};

export function buildEnhanceMessages(
  text: string,
  fieldKey: string,
  paragraphs: number,
  paragraphLength: string,
): LlmMessage[] {
  const isEnglish = fieldKey.startsWith("en_");
  const ctx = FIELD_CONTEXT[fieldKey] ?? DEFAULT_CONTEXT;
  const { min, max } = PARAGRAPH_WORD_COUNTS[paragraphLength] ?? { min: 80, max: 120 };
  const paraLabel = paragraphs === 1 ? "paragraph" : "paragraphs";

  if (isEnglish) {
    return [
      {
        role: "system",
        content:
          `You are a field naturalist writing ${ctx.en}. Rewrite and expand the ` +
          `text below in clear, observational prose - concrete and specific, in ` +
          `the first person where the original is. Write exactly ${paragraphs} ` +
          `${paraLabel}, each between ${min} and ${max} words. ` +
          `**Invent nothing**: do not add species, dates, places, counts or ` +
          `behaviours the text does not already state - this is a record of ` +
          `something a person actually saw. Return only the improved text, with ` +
          `no explanations, labels or formatting marks.`,
      },
      { role: "user", content: text },
    ];
  }
  return [
    {
      role: "system",
      content:
        `Eres un naturalista de campo escribiendo ${ctx.es}. Reescribe y amplía ` +
        `el texto siguiente en prosa clara y de observación - concreta y ` +
        `específica, en primera persona si el original lo está. Escribe ` +
        `exactamente ${paragraphs} párrafo${paragraphs !== 1 ? "s" : ""}, cada ` +
        `uno de entre ${min} y ${max} palabras. **No inventes nada**: no agregues ` +
        `especies, fechas, lugares, cantidades ni comportamientos que el texto no ` +
        `mencione - esto es el registro de algo que una persona vio de verdad. ` +
        `Devuelve únicamente el texto mejorado, sin explicaciones, etiquetas ni ` +
        `marcas de formato.`,
    },
    { role: "user", content: text },
  ];
}

export function buildTranslateMessages(text: string, sourceFieldKey: string): LlmMessage[] {
  // The bare field is Spanish and its `en_` twin English (see the API's
  // TRANSLATED_FIELDS), so the source key alone says which direction this is.
  const isSourceEnglish = sourceFieldKey.startsWith("en_");
  if (isSourceEnglish) {
    return [
      {
        role: "system",
        content:
          "You are a professional translator working on a nature field journal. " +
          "Translate the following text from English to Spanish. Leave scientific " +
          "names in Latin exactly as they are. Return only the translated text - " +
          "no explanations, labels or formatting marks.",
      },
      { role: "user", content: text },
    ];
  }
  return [
    {
      role: "system",
      content:
        "Eres un traductor profesional trabajando en un diario de campo de " +
        "naturaleza. Traduce el siguiente texto del español al inglés. Deja los " +
        "nombres científicos en latín exactamente como están. Devuelve únicamente " +
        "el texto traducido - sin explicaciones, etiquetas ni marcas de formato.",
    },
    { role: "user", content: text },
  ];
}
