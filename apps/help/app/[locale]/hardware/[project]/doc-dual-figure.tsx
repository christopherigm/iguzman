"use client";

import { useState, type ReactNode } from "react";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Switch } from "@repo/ui/core-elements/switch";

/**
 * A figure that carries two drawings of the same circuit and a switch between
 * them: the **schematic**, and the **breadboard** view built from
 * `@repo/ui/hardware`.
 *
 * The two are not draft and final - they answer different questions, and which
 * one is useful depends entirely on who is reading. A schematic states the
 * topology and nothing else, which is the faster read once you can read one and
 * the only view that survives being redrawn on paper. The breadboard view
 * states the *build*: which hole, which way round the band faces, what the part
 * looks like in your hand. Someone who has never wired a transistor cannot get
 * that from a symbol, and someone who has does not want to count holes.
 *
 * ── Why the toggle is per figure and not per page ──────────────────────────
 *
 * Because the choice is per *question*, not per reader. The power path is worth
 * seeing as a breadboard even if you read schematics fluently - it is where the
 * diode's polarity bites - while the two driver stages in Fig 3 are far quicker
 * to check as symbols once you know what a TO-92 looks like. A single sticky
 * setting for the whole document would force one answer onto three different
 * questions.
 *
 * ── Why this is the only client component in the build sheet ───────────────
 *
 * The drawings themselves are static SVG with CSS animations, so every part in
 * `@repo/ui/hardware` renders on the server. Only the switch needs state, so
 * only this wrapper is `"use client"` - keep it that way rather than pushing
 * the boundary up into `doc-primitives`, which the whole document is built
 * from.
 *
 * The labels are authored English, like the rest of the build-sheet body - see
 * `apps/help/CLAUDE.md` → Hardware for why the body is not translated while the
 * navigation around it is.
 */

export interface DocDualFigureProps {
  /** e.g. `"Fig 1"`. */
  captionLabel: string;
  /** The caption for the schematic view. */
  caption: ReactNode;
  /** The caption for the breadboard view. Falls back to `caption`. */
  pictorialCaption?: ReactNode;
  schematic: ReactNode;
  pictorial: ReactNode;
  /**
   * Open on the breadboard view instead of the schematic.
   *
   * The default is the schematic because that is what this document has always
   * shown, and a build sheet that silently redrew itself would be a worse
   * surprise than one extra click. Flip it per figure if a particular step
   * genuinely reads better as parts.
   */
  defaultPictorial?: boolean;
}

export function DocDualFigure({
  captionLabel,
  caption,
  pictorialCaption,
  schematic,
  pictorial,
  defaultPictorial = false,
}: DocDualFigureProps) {
  const [showPictorial, setShowPictorial] = useState(defaultPictorial);

  return (
    <figure className="hw-figure">
      <Box
        className="hw-figure__head"
        alignItems="center"
        gap={10}
        paddingX={20}
        paddingY={10}
      >
        <Typography
          as="span"
          variant="none"
          className="hw-figure__viewlabel"
          color={showPictorial ? "var(--ink-faint)" : "var(--ember)"}
        >
          Schematic
        </Typography>
        <Switch
          checked={showPictorial}
          onChange={setShowPictorial}
          aria-label={`${captionLabel}: show the breadboard view instead of the schematic`}
        />
        <Typography
          as="span"
          variant="none"
          className="hw-figure__viewlabel"
          color={showPictorial ? "var(--ember)" : "var(--ink-faint)"}
        >
          Breadboard
        </Typography>
      </Box>

      <div className="hw-figure__scroll">
        {showPictorial ? pictorial : schematic}
      </div>

      <figcaption>
        <b>{captionLabel}</b>
        {showPictorial ? (pictorialCaption ?? caption) : caption}
      </figcaption>
    </figure>
  );
}
