import Image from "next/image";
import { getLocale } from "next-intl/server";
import {
  getHighlights,
  type CompanyHighlight,
  type CompanyHighlightItem,
} from "@/lib/highlights";
import { getSystem } from "@/lib/system";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { Grid } from "@repo/ui/core-elements/grid";
import type { GridSize } from "@repo/ui/core-elements/grid";
import { Badge } from "@repo/ui/core-elements/badge";
import "./company-highlights.css";

const HIGHLIGHT_GRID_SIZE: Record<string, GridSize> = {
  sm: { xs: 6, md: 3 },
  md: { xs: 6, md: 4 },
  lg: { xs: 6, md: 8 },
  xl: { xs: 12 },
};

function isIconPath(icon: string): boolean {
  return icon.startsWith("/") || icon.startsWith("http");
}

function HighlightItemCard({ item }: { item: CompanyHighlightItem }) {
  return (
    <Box
      width={80}
      height={80}
      borderRadius={10}
      backgroundColor="var(--surface-1)"
      alignItems="center"
      justifyContent="center"
      flex="0 0 auto"
      styles={{ position: "relative", overflow: "hidden" }}
    >
      {item.image ? (
        <Image
          fill
          src={item.image}
          alt={item.name ?? ""}
          style={{ objectFit: "cover" }}
        />
      ) : item.icon && isIconPath(item.icon) ? (
        <Image
          width={32}
          height={32}
          src={item.icon}
          alt={item.name ?? ""}
          style={{
            objectFit: "contain",
            filter: "brightness(0) invert(1)",
            opacity: 0.6,
          }}
        />
      ) : (
        <Typography as="span" variant="none" styles={{ fontSize: 24 }}>
          {item.icon ?? ""}
        </Typography>
      )}
    </Box>
  );
}

function HighlightCard({
  highlight,
  locale,
}: {
  highlight: CompanyHighlight;
  locale: string;
}) {
  const name =
    (locale === "en" ? highlight.en_name : highlight.name) ??
    highlight.name ??
    highlight.en_name ??
    "";
  const description =
    (locale === "en" ? highlight.en_description : highlight.description) ??
    highlight.description ??
    highlight.en_description ??
    "";
  const category =
    (locale === "en" ? highlight.en_category : highlight.category) ??
    highlight.category ??
    highlight.en_category ??
    "";

  const hasImage = Boolean(highlight.image);
  const hasItems = highlight.items.length > 0;
  // The size classes carry only the responsive min-heights (base + @media);
  // surface styling comes from Card props below.
  const cardClass = `highlight-card highlight-card--${highlight.size}${hasImage ? " highlight-card--has-image" : ""}`;

  const cardBody = (
    <>
      {hasImage && (
        <Image
          fill
          src={highlight.image!}
          alt={name}
          style={{ objectFit: "cover" }}
        />
      )}
      {hasImage && (
        <Box
          styles={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0.15) 100%)",
          }}
        />
      )}

      <Box
        className="card-content"
        gap={20}
        flex={1}
        styles={{ position: "relative", zIndex: 1 }}
      >
        <Box flexDirection="column" gap={10} flex={1}>
          {category && (
            <Badge
              variant="filled"
              color="transparent"
              textColor="rgba(255, 255, 255, 0.75)"
              style={{
                width: "fit-content",
                padding: "3px 10px",
                borderRadius: 4,
                border: "1px solid rgba(255, 255, 255, 0.35)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {category}
            </Badge>
          )}

          {highlight.icon && (
            <Box
              width={44}
              height={44}
              borderRadius={10}
              backgroundColor="rgba(255, 255, 255, 0.12)"
              alignItems="center"
              justifyContent="center"
              styles={{ fontSize: 22 }}
            >
              {isIconPath(highlight.icon) ? (
                <Image
                  width={26}
                  height={26}
                  src={highlight.icon}
                  alt=""
                  aria-hidden={true}
                  style={{
                    objectFit: "contain",
                    filter: "brightness(0) invert(1)",
                    opacity: 0.85,
                  }}
                />
              ) : (
                <Typography as="span" variant="none">
                  {highlight.icon}
                </Typography>
              )}
            </Box>
          )}

          {name && (
            <Typography as="h3" variant="h3" margin={0} color="#fff">
              {name}
            </Typography>
          )}

          {description && (
            <Typography
              variant="body"
              margin={0}
              color="rgba(255, 255, 255, 0.72)"
            >
              {description}
            </Typography>
          )}

          {hasItems && (highlight.size === "sm" || highlight.size === "md") && (
            <Box
              display="grid"
              gap={8}
              alignSelf="center"
              marginTop={12}
              styles={{ gridTemplateColumns: "repeat(2, 1fr)" }}
            >
              {highlight.items.map((item) => (
                <HighlightItemCard key={item.id} item={item} />
              ))}
            </Box>
          )}
        </Box>

        {hasItems && (highlight.size === "lg" || highlight.size === "xl") && (
          <Box
            display="grid"
            gap={8}
            alignSelf="center"
            styles={{ gridTemplateColumns: "repeat(3, 1fr)" }}
          >
            {highlight.items.map((item) => (
              <HighlightItemCard key={item.id} item={item} />
            ))}
          </Box>
        )}
      </Box>
    </>
  );

  const linkHref = highlight.slug
    ? `/highlights/${highlight.slug}`
    : (highlight.href ?? null);

  const surfaceProps = {
    padding: 0,
    border: "none",
    borderRadius: 16,
    elevation: 5,
    backgroundColor: "var(--surface-2)",
    className: cardClass,
  } as const;

  if (linkHref) {
    return (
      <Card
        href={linkHref}
        prefetch
        {...surfaceProps}
        styles={{ position: "relative", textDecoration: "none" }}
      >
        {cardBody}
      </Card>
    );
  }

  return (
    <Card {...surfaceProps} styles={{ position: "relative" }}>
      {cardBody}
    </Card>
  );
}

export async function CompanyHighlights() {
  const [highlights, system, locale] = await Promise.all([
    getHighlights(),
    getSystem(),
    getLocale(),
  ]);

  if (highlights.length === 0) return null;

  const title =
    (locale === "en"
      ? system?.en_highlights_title
      : system?.highlights_title) ??
    system?.highlights_title ??
    system?.en_highlights_title ??
    null;

  const subtitle =
    (locale === "en"
      ? system?.en_highlights_subtitle
      : system?.highlights_subtitle) ??
    system?.highlights_subtitle ??
    system?.en_highlights_subtitle ??
    null;

  return (
    <section className="highlights-section">
      {(title || subtitle) && (
        <Box className="highlights-header">
          {title && (
            <Typography as="h2" variant="h2" className="section-title">
              {title}
            </Typography>
          )}
          {subtitle && (
            <Typography variant="none" className="section-subtitle">
              {subtitle}
            </Typography>
          )}
        </Box>
      )}
      <Grid container spacing={2}>
        {highlights.map((highlight) => (
          <Grid
            key={highlight.id}
            size={HIGHLIGHT_GRID_SIZE[highlight.size] ?? { xs: 12 }}
          >
            <HighlightCard highlight={highlight} locale={locale} />
          </Grid>
        ))}
      </Grid>
    </section>
  );
}
