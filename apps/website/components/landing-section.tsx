import type { ReactNode } from "react";
import { Container } from "@repo/ui/core-elements/container";
import { SectionBand, type SectionDivider } from "./section-band";
import "./landing-section.css";

export interface LandingSectionProps {
  /**
   * The band's CSS background. Omitted (or empty) leaves the section unbanded.
   *
   * ⚠ Pass it already through `lib/section-background`'s
   * `fitSectionBackground`, exactly as `SectionBand` has always expected: it is
   * what turns a tenant's stored value into a paintable CSS background.
   */
  background?: string | null;
  /** Shape cut out of the band's top edge. No effect without `background`. */
  topDivider?: SectionDivider;
  /** Shape cut out of the band's bottom edge. No effect without `background`. */
  bottomDivider?: SectionDivider;
  /**
   * Render the children directly, without the page `Container`. For a section
   * that is already inside one (the catalog and menu listing pages) or whose
   * content is itself edge-to-edge and brings its own container where it needs
   * one (the flyers' swiper).
   */
  bare?: boolean;
  /** Drop the top half of the rhythm - see `landing-section.css`. */
  flushTop?: boolean;
  /** Drop the bottom half of the rhythm. */
  flushBottom?: boolean;
  /** Extra classes on the `<section>` (state/behaviour, not spacing). */
  className?: string;
  children: ReactNode;
}

/**
 * Everything a landing block forwards to its own `LandingSection` - i.e. its
 * props minus the content it is wrapping.
 *
 * Every composable block takes this and spreads it, so which sections sit on a
 * colour band, and which one opens a page, are decisions made at the **call
 * site** while the block itself stays layout-agnostic. Blocks with props of
 * their own (`FindUs`, `AboutIntro`) extend it and spread the rest.
 */
export type LandingBlockProps = Omit<LandingSectionProps, "children">;

/**
 * The one wrapper every landing block renders itself in - and the reason a
 * landing is a re-orderable list.
 *
 * It owns the three things that used to be spread across the blocks and the
 * landings that composed them:
 *
 * 1. **The vertical rhythm.** One symmetric `--section-space` above and below
 *    (`.landing-section`). Before this, five blocks carried `48px 0 56px` in
 *    their own CSS file and four carried `paddingY={64}` inline, so the gap
 *    between two sections depended on which two they were and reordering a
 *    landing silently changed its spacing.
 * 2. **The page gutter.** The `Container paddingX={10}` each landing used to
 *    wrap half its blocks in by hand (the other half wrapped themselves), which
 *    meant moving a block meant remembering which kind it was.
 * 3. **The optional band.** `background` / `topDivider` / `bottomDivider` are
 *    forwarded straight to `SectionBand`, so a banded section is a prop on the
 *    block rather than a wrapper the landing has to carry around it.
 *
 * **A block renders this *after* its own "nothing to show" guard**, never the
 * other way round: a landing composes `<Spotlight />` blind, and a block that
 * returns `null` must contribute no padded, empty section. That is what keeps
 * `<Events />`, `<Spotlight />`, `<HomepageFlyers />` and `<FindUs />` safe to
 * place in any landing before the tenant has the content for them.
 *
 * Bands sit **flush** in the rhythm: a band's inset *is* its section's space, so
 * two adjacent bands meet - which is what the tenant's shape dividers are cut
 * for. There is deliberately no page-background margin around a band.
 */
export function LandingSection({
  background,
  topDivider,
  bottomDivider,
  bare = false,
  flushTop = false,
  flushBottom = false,
  className,
  children,
}: LandingSectionProps) {
  const classes = ["landing-section"];
  if (flushTop) classes.push("landing-section--flush-top");
  if (flushBottom) classes.push("landing-section--flush-bottom");
  if (className) classes.push(className);

  const section = (
    <section className={classes.join(" ")}>
      {bare ? children : <Container paddingX={10}>{children}</Container>}
    </section>
  );

  // `||`, not `??`: clearing a band field in the CMS stores an empty string,
  // which would otherwise paint the band as `background: ""` (i.e. nothing) and
  // still pay for the divider wrappers around it.
  if (!background) return section;

  return (
    <SectionBand
      background={background}
      topDivider={topDivider}
      bottomDivider={bottomDivider}
    >
      {section}
    </SectionBand>
  );
}

export default LandingSection;
