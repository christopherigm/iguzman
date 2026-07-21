import Image from "next/image";
import type { ReactNode } from "react";
import { Box } from "@repo/ui/core-elements/box";
import { Container } from "@repo/ui/core-elements/container";
import { Grid } from "@repo/ui/core-elements/grid";
import { Typography } from "@repo/ui/core-elements/typography";
import "./about-intro.css";

/**
 * Shared "story + photo" intro block used by the customer sites' landing pages
 * (Café de Altura's "origin", Pan Orgánico's / Bdrone's "intro"). A two-column
 * split: the tenant's About copy behind a thin accent rule + a CTA row on one
 * side, the About image on the other. At md+ (>=900px) the columns sit side by
 * side and the photo keeps a fixed height; below that the copy leads and the
 * photo follows as a wide 5:4 landscape crop (see about-intro.css).
 *
 * Everything visible is DB-driven and passed in already resolved, so this stays
 * tenant-agnostic: each site's thin wrapper resolves `System` + its own
 * translations, and drops its own `Button`/`LinkButton` primitives in as
 * `children` (the CTAs differ per site - labels, hrefs, and which catalog
 * families exist). The brand color flows in automatically via `--accent`, so
 * the eyebrow and the accent rule never take a color prop.
 */
export interface AboutIntroProps {
  /** Small uppercase kicker above the title. */
  eyebrow: string;
  /** Section heading (usually the site name). */
  title: string;
  /** Raw About copy - trimmed to the first paragraph / 150 words here. */
  body: string;
  /** About image URL (optional - the box is a neutral surface without it). */
  imageSrc?: string | null;
  /** Alt text for the About image. */
  imageAlt?: string;
  /** CTA row - the site's own `Button`/`LinkButton` primitives. */
  children?: ReactNode;
}

/**
 * Trim About copy to a lead-in: the first paragraph, capped at 150 words.
 * Keeps the intro block short and even across sites regardless of how much the
 * customer wrote in the CMS; the full text still lives on the /about page.
 */
function trimAbout(text: string): string {
  const firstParagraph = text.split(/\n\s*\n/)[0]?.trim() || text.trim();
  const words = firstParagraph.split(/\s+/);
  if (words.length <= 150) return firstParagraph;
  return `${words.slice(0, 150).join(" ")}…`;
}

export function AboutIntro({
  eyebrow,
  title,
  body,
  imageSrc,
  imageAlt,
  children,
}: AboutIntroProps) {
  return (
    <Container paddingX={10}>
      <Box paddingY={64}>
        <Grid container spacing={4} alignItems="center">
          <Grid size={{ xs: 12, md: 6 }}>
            <Box display="flex" flexDirection="column" gap="20px">
              <Typography
                as="span"
                variant="label"
                color="var(--accent)"
                fontWeight={700}
                styles={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
              >
                {eyebrow}
              </Typography>

              <Typography as="h2" variant="h2" fontWeight={800}>
                {title}
              </Typography>

              <Box
                paddingLeft={20}
                styles={{ borderLeft: "3px solid var(--accent)" }}
              >
                <Typography
                  as="p"
                  variant="body"
                  styles={{ whiteSpace: "pre-line", lineHeight: 1.75 }}
                >
                  {trimAbout(body)}
                </Typography>
              </Box>

              {children && (
                <Box
                  display="flex"
                  gap="16px"
                  flexWrap="wrap"
                  alignItems="center"
                  marginTop="8px"
                >
                  {children}
                </Box>
              )}
            </Box>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            {/* Plain div (not a @repo/ui Box) so the responsive height/aspect
                ratio can live entirely in CSS - an inline `styles` value would
                out-specificity the md media-query override. */}
            <div className="about-intro__media elevation-6">
              {imageSrc && (
                <Image
                  fill
                  src={imageSrc}
                  alt={imageAlt ?? ""}
                  sizes="(max-width: 900px) 100vw, 50vw"
                  style={{ objectFit: "cover" }}
                />
              )}
            </div>
          </Grid>
        </Grid>
      </Box>
    </Container>
  );
}
