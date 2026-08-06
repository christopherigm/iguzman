import type { ReactNode } from "react";
import { Typography } from "@repo/ui/core-elements/typography";

/**
 * The building blocks every hardware build sheet is written from.
 *
 * A project's documentation is a *drawing with a legend*, not app UI: numbered
 * sections, figures with captions, dense value tables and two kinds of callout.
 * Those pieces repeat across every project, so they live here rather than being
 * re-declared in each `_projects/<slug>.tsx`.
 *
 * Two notes on how this is styled, both deliberate:
 *
 * - The wrappers are **raw semantic elements** (`section`, `figure`, `table`),
 *   not `Box`. `Box` renders a `div` or an anchor and has no element override,
 *   and a build sheet's structure is exactly what semantic HTML is for. The
 *   props-first rule governs `@repo/ui` components; a bare `<figure>` carrying
 *   its own class is the ordinary way to style a raw element.
 * - Headings and prose go through `<Typography variant="none">`, the documented
 *   escape hatch for when a CSS class must fully own typography - here the
 *   monospace display face, the letter-spacing and the uppercase section rules
 *   that make the document read as a drawing rather than a web page.
 */

/** A paragraph of build-sheet prose. */
export function P({ children }: { children: ReactNode }) {
  return (
    <Typography as="p" variant="none">
      {children}
    </Typography>
  );
}

/**
 * A top-level section, e.g. "01 How many cells".
 *
 * `num` is optional so a document can carry **one** numbered sequence. The
 * build sheet's prose cross-references its own sections by number ("see §04",
 * "§2 of the schematic"), so those keep their numbers; the how-to sections that
 * precede them are titled but unnumbered, and a bare "§04" stays unambiguous.
 */
export function DocSection({
  num,
  title,
  children,
}: {
  num?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="hw-section">
      <Typography as="h2" variant="none" className="hw-h2">
        {num ? <span className="hw-num">{num}</span> : null}
        <span>{title}</span>
      </Typography>
      {children}
    </section>
  );
}

/** A sub-heading inside a section. */
export function DocH3({ children }: { children: ReactNode }) {
  return (
    <Typography as="h3" variant="none" className="hw-h3">
      {children}
    </Typography>
  );
}

/**
 * A callout. `kind="key"` is an ember-tagged aside (the interesting trade-off);
 * `kind="warn"` is the rust-bordered one (the thing that will bite you).
 */
export function DocNote({
  kind = "key",
  tag,
  children,
}: {
  kind?: "key" | "warn";
  tag: string;
  children: ReactNode;
}) {
  return (
    <aside className={`hw-note${kind === "warn" ? " hw-note--warn" : ""}`}>
      <Typography as="span" variant="none" className="hw-note__tag">
        {tag}
      </Typography>
      {children}
    </aside>
  );
}

/**
 * A schematic figure. The drawing keeps its own intrinsic width and scrolls
 * horizontally on a narrow screen rather than being squeezed until the pin
 * labels collide - so the caption stays put while the diagram pans.
 */
export function DocFigure({
  caption,
  captionLabel,
  children,
}: {
  caption: ReactNode;
  captionLabel: string;
  children: ReactNode;
}) {
  return (
    <figure className="hw-figure">
      <div className="hw-figure__scroll">{children}</div>
      <figcaption>
        <b>{captionLabel}</b>
        {caption}
      </figcaption>
    </figure>
  );
}

/** A value table, scrolling horizontally inside its own box on a phone. */
export function DocTable({ children }: { children: ReactNode }) {
  return (
    <div className="hw-tablewrap">
      <table>{children}</table>
    </div>
  );
}
