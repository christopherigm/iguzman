import type { LlmMessage } from "@repo/helpers/llm";
import type { EnhanceOptions } from "@/components/enhance/enhance-options-modal";

/**
 * Single source of truth for every client-side AI "enhance" / "tailor" prompt in
 * the app. Each prompt is assembled from one shared skeleton -
 *
 *   persona → task + subject → length clause → focus phrase → output constraint
 *
 * so the voice, length handling, and trailing constraints stay identical across
 * every page. Only the per-kind subject and focus phrase differ. Prompts branch
 * on `es` vs everything-else (English), matching the app's existing behavior:
 * de/fr/pt users get the English prompt today.
 */

export type EnhanceKind =
  // Standalone dashboard pages (general portfolio polish, no target role):
  | "achievement" // matrix bullet points
  | "summary" // profile professional summary
  | "education" // education description
  | "workExperience" // work-experience description
  | "project" // project description
  // Application tailoring (targeted at a specific role via `roleCtx`):
  | "roleBullets"
  | "roleSummary"
  | "roleDescription";

export interface BuildEnhanceParams {
  kind: EnhanceKind;
  locale: string;
  /** The current content the user wants improved; becomes the user message. */
  text: string;
  /** Length/paragraph band chosen in the enhance modal, when the kind uses one. */
  opts?: EnhanceOptions;
  /** `"Job title at Company"` - required for the `role*` kinds. */
  roleCtx?: string;
  /** Extra profile context appended to the summary prompt, when available. */
  profileCtx?: string;
}

type Copy = {
  persona: string;
  /** Task verb + subject; role kinds interpolate the target role. */
  subject: Record<EnhanceKind, (roleCtx: string) => string>;
  /** Per-kind focus sentence; role kinds intentionally omit it. */
  focus: Partial<Record<EnhanceKind, string>>;
  /**
   * Shared guardrail appended to every prompt: keep only figures present in the
   * source (no invented metrics) and avoid buzzwords / hype adjectives.
   */
  grounding: string;
  proseLengthWithOpts: (o: EnhanceOptions) => string;
  proseLengthFallback: string;
  proseConstraint: string;
  profileContext: (ctx: string) => string;
  bulletsShapeWithOpts: (o: EnhanceOptions) => string;
  bulletsShapeFallback: string;
  bulletsBody: (shape: string) => string;
};

const EN: Copy = {
  persona: "You are an expert resume writer and career coach.",
  subject: {
    achievement: () =>
      "Rewrite and expand the following career achievement into polished, impactful prose for a professional portfolio.",
    summary: () =>
      "Rewrite and enhance the following professional summary into polished, compelling prose for a resume or portfolio.",
    education: () =>
      "Rewrite the following education description into polished, impactful prose for a professional portfolio.",
    workExperience: () =>
      "Rewrite and expand the following work experience description into polished, impactful prose for a professional portfolio.",
    project: () =>
      "Rewrite and expand the following project description into polished, impactful prose for a professional portfolio.",
    roleSummary: (ctx) =>
      `Rewrite and improve the following professional summary for a ${ctx} role.`,
    roleDescription: (ctx) =>
      `Rewrite and improve the following description for a ${ctx} role.`,
    roleBullets: (ctx) =>
      `Improve the following achievement bullet points for a ${ctx} role.`,
  },
  focus: {
    achievement:
      "Focus on the concrete actions taken, the scope of ownership, and the real outcome.",
    summary:
      "Focus on actual career achievements, key skills, and the value the candidate brings.",
    education:
      "Focus on academic achievements, relevant coursework, and transferable skills.",
    workExperience:
      "Focus on the concrete actions taken, the scope of ownership, and the real outcome.",
    project:
      "Focus on the problem solved, technologies used, and the resulting outcome.",
  },
  grounding:
    "Keep only the facts and figures already in the original text - never invent, estimate, or round any number, percentage, dollar amount, team size, or timeframe the source does not state. Write in plain, direct language; do not describe the candidate as seasoned, dynamic, passionate, results-driven, world-class, or a rockstar / ninja / guru, and avoid filler like proven track record, leverage, or synergy.",
  proseLengthWithOpts: (o) =>
    `Write exactly ${o.paragraphs} ${o.paragraphs === 1 ? "paragraph" : "paragraphs"}, each between ${o.minWords} and ${o.maxWords} words.`,
  proseLengthFallback:
    "Write it as concise, compelling prose of 2-4 sentences.",
  proseConstraint:
    "Return only the improved text - no explanations, labels, or formatting marks.",
  profileContext: (ctx) => `Profile context: ${ctx}.`,
  bulletsShapeWithOpts: (o) =>
    `Return exactly ${o.paragraphs} ${o.paragraphs === 1 ? "bullet" : "bullets"}, each between ${o.minWords} and ${o.maxWords} words`,
  bulletsShapeFallback: "preserve the same number of bullets",
  bulletsBody: (shape) =>
    `Keep them as concise, results-oriented bullets, one per line, with no leading dashes or numbering, and ${shape}. Return only the improved bullets, one per line.`,
};

const ES: Copy = {
  persona:
    "Eres un redactor experto de currículums y coach profesional de carrera.",
  subject: {
    achievement: () =>
      "Reescribe y amplía el siguiente logro profesional en prosa impactante para un portafolio profesional.",
    summary: () =>
      "Reescribe y mejora el siguiente resumen profesional en prosa convincente para un CV o portafolio.",
    education: () =>
      "Reescribe la siguiente descripción académica en prosa clara e impactante para un portafolio profesional.",
    workExperience: () =>
      "Reescribe y amplía la siguiente descripción de experiencia laboral en prosa impactante para un portafolio profesional.",
    project: () =>
      "Reescribe y amplía la siguiente descripción de proyecto en prosa impactante para un portafolio profesional.",
    roleSummary: (ctx) =>
      `Reescribe y mejora el siguiente resumen profesional para el puesto de ${ctx}.`,
    roleDescription: (ctx) =>
      `Reescribe y mejora la siguiente descripción para el puesto de ${ctx}.`,
    roleBullets: (ctx) =>
      `Mejora los siguientes puntos de logros para el puesto de ${ctx}.`,
  },
  focus: {
    achievement:
      "Enfócate en las acciones concretas realizadas, el alcance de la responsabilidad y el resultado real.",
    summary:
      "Enfócate en logros reales de carrera, habilidades clave y el valor que aporta la persona.",
    education:
      "Enfócate en logros académicos, habilidades y actividades relevantes.",
    workExperience:
      "Enfócate en las acciones concretas realizadas, el alcance de la responsabilidad y el resultado real.",
    project:
      "Enfócate en el problema resuelto, las tecnologías usadas y el resultado obtenido.",
  },
  grounding:
    "Conserva únicamente los datos y cifras que ya aparecen en el texto original - nunca inventes, estimes ni redondees ningún número, porcentaje, monto, tamaño de equipo o plazo que la fuente no indique. Escribe en lenguaje claro y directo; no describas a la persona como veterana, dinámica, apasionada, orientada a resultados, de talla mundial ni como un crack / gurú, y evita muletillas como trayectoria comprobada, aprovechar sinergias o potenciar.",
  proseLengthWithOpts: (o) =>
    `Escribe exactamente ${o.paragraphs} párrafo${o.paragraphs !== 1 ? "s" : ""}, cada uno de entre ${o.minWords} y ${o.maxWords} palabras.`,
  proseLengthFallback:
    "Escríbelo en prosa concisa y convincente de 2 a 4 oraciones.",
  proseConstraint:
    "Devuelve únicamente el texto mejorado - sin explicaciones, etiquetas ni marcas de formato.",
  profileContext: (ctx) => `Contexto del perfil: ${ctx}.`,
  bulletsShapeWithOpts: (o) =>
    `Devuelve exactamente ${o.paragraphs} viñeta${o.paragraphs !== 1 ? "s" : ""}, cada una de entre ${o.minWords} y ${o.maxWords} palabras`,
  bulletsShapeFallback: "conserva la misma cantidad de viñetas",
  bulletsBody: (shape) =>
    `Mantenlos como viñetas concisas y orientadas a resultados, una por línea, sin guiones ni numeración al inicio, y ${shape}. Devuelve únicamente las viñetas mejoradas, una por línea.`,
};

/**
 * Build the `[system, user]` message pair for an AI enhance/tailor action.
 * Returns the shared `LlmMessage` shape consumed by `StreamingEnhancePanel` and
 * the tailored-editable-card streaming panel.
 */
export function buildEnhance({
  kind,
  locale,
  text,
  opts,
  roleCtx = "",
  profileCtx = "",
}: BuildEnhanceParams): LlmMessage[] {
  const c = locale === "es" ? ES : EN;

  let system: string;
  if (kind === "roleBullets") {
    const shape = opts ? c.bulletsShapeWithOpts(opts) : c.bulletsShapeFallback;
    system = [
      c.persona,
      c.subject.roleBullets(roleCtx),
      c.grounding,
      c.bulletsBody(shape),
    ]
      .filter(Boolean)
      .join(" ");
  } else {
    const length = opts ? c.proseLengthWithOpts(opts) : c.proseLengthFallback;
    system = [
      c.persona,
      c.subject[kind](roleCtx),
      length,
      c.focus[kind],
      c.grounding,
      c.proseConstraint,
      profileCtx ? c.profileContext(profileCtx) : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return [
    { role: "system", content: system },
    { role: "user", content: text },
  ];
}
