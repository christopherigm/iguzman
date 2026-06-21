import katex from "katex";
import "katex/dist/katex.min.css";
import "./math-formula.css";

export interface MathFormulaProps {
  /** Plain-text formula using Unicode math symbols and ^(...) for superscripts */
  formula: string;
  /** Render in display (block) mode — centers and enlarges the formula */
  displayMode?: boolean;
}

/** Converts the plain-text notation used in this project into valid KaTeX/LaTeX.
 *  Handles Unicode math symbols and ^(expr) grouping so callers never need
 *  to write raw LaTeX. */
function toKaTeX(input: string): string {
  return input
    .replace(/×/g, "\\times")
    .replace(/÷/g, "\\div")
    .replace(/−/g, "-")        // U+2212 MINUS SIGN → ASCII hyphen-minus
    .replace(/≥/g, "\\geq")
    .replace(/≤/g, "\\leq")
    .replace(/≠/g, "\\neq")
    .replace(/≈/g, "\\approx")
    .replace(/∞/g, "\\infty")
    .replace(/α/g, "\\alpha{}")
    .replace(/β/g, "\\beta{}")
    .replace(/γ/g, "\\gamma{}")
    .replace(/δ/g, "\\delta{}")
    .replace(/ε/g, "\\epsilon{}")
    .replace(/θ/g, "\\theta{}")
    .replace(/λ/g, "\\lambda{}")
    .replace(/μ/g, "\\mu{}")
    .replace(/π/g, "\\pi{}")
    .replace(/σ/g, "\\sigma{}")
    .replace(/τ/g, "\\tau{}")
    .replace(/φ/g, "\\phi{}")
    .replace(/ω/g, "\\omega{}")
    .replace(/Σ/g, "\\Sigma{}")
    .replace(/Δ/g, "\\Delta{}")
    .replace(/Π/g, "\\Pi{}")
    .replace(/Ω/g, "\\Omega{}")
    .replace(/\^\(([^)]+)\)/g, "^{$1}"); // ^(expr) → ^{expr}
}

export function MathFormula({ formula, displayMode = false }: MathFormulaProps) {
  const html = katex.renderToString(toKaTeX(formula), {
    displayMode,
    throwOnError: false,
    output: "html",
  });

  return (
    <span
      className={`math-formula${displayMode ? " math-formula--display" : ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
