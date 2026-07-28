import { Box } from '@repo/ui/core-elements/box';
import { Card } from '@repo/ui/core-elements/card';
import { Typography } from '@repo/ui/core-elements/typography';
import './facts-card.css';

/**
 * The label/value aside beside a detail page's prose: a category's kind and
 * counts, a species' taxonomy, a sighting's field conditions.
 *
 * It was one component copied into each detail page until a third one needed it;
 * `apps/CLAUDE.md` puts a component shared by two or more routes in
 * `components/<domain>/`, and keeping one copy is what stops the three pages'
 * asides from drifting apart.
 *
 * `null` entries are accepted and dropped, so a caller can list every fact it
 * *might* have inline - a record with no scientific name should show no
 * scientific-name row rather than an empty one.
 */

export interface Fact {
  label: string;
  value: string;
  /**
   * Makes the value an internal link, for a fact that names something with a
   * page of its own (a sighting's species, its category). Internal only - an
   * outbound reference belongs in `href` below, which gets the external rel.
   */
  href?: string | null;
}

interface Props {
  facts: (Fact | null)[];
  /** An outbound reference for the record - a field guide, a taxonomy database. */
  href: string | null;
  hrefLabel: string;
}

export function FactsCard({ facts, href, hrefLabel }: Props) {
  const present = facts.filter((fact): fact is Fact => fact !== null);
  if (present.length === 0 && !href) return null;

  return (
    <Card gap={12} padding={18}>
      {present.map((fact) => (
        <Box key={fact.label} gap={8} alignItems="baseline" flexWrap="wrap">
          <Typography
            variant="label"
            fontWeight={700}
            color="var(--foreground-muted, #6b7280)"
            styles={{ letterSpacing: '0.06em', textTransform: 'uppercase', minWidth: 110 }}
          >
            {fact.label}
          </Typography>

          {fact.href ? (
            <Box
              href={fact.href}
              prefetch
              className="facts-card__link"
              color="inherit"
              styles={{ textDecoration: 'none' }}
            >
              <Typography variant="body" fontWeight={600} color="var(--accent)">
                {fact.value}
              </Typography>
            </Box>
          ) : (
            <Typography variant="body">{fact.value}</Typography>
          )}
        </Box>
      ))}

      {href && (
        <Box marginTop={4}>
          {/* An outbound reference - a field guide, a taxonomy database - so a
              plain anchor with the external-link rel, not a `next/link`. */}
          <a href={href} target="_blank" rel="noopener noreferrer">
            <Typography variant="body" fontWeight={600} color="var(--accent)">
              {hrefLabel}
            </Typography>
          </a>
        </Box>
      )}
    </Card>
  );
}
