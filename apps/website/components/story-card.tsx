import Image from "next/image";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import { Button } from "@repo/ui/core-elements/button";
import type { SuccessStory } from "@/lib/success-stories";

export function StoryCard({
  story,
  locale,
  readMore,
}: {
  story: SuccessStory;
  locale: string;
  readMore: string;
}) {
  const name =
    (locale === "en" ? story.en_name : story.name) ??
    story.name ??
    story.en_name ??
    "";
  const description =
    (locale === "en" ? story.en_short_description : story.short_description) ??
    story.short_description ??
    story.en_short_description ??
    "";
  const date = new Date(story.created).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const hasImage = Boolean(story.image);

  const cardBody = (
    <>
      {hasImage && (
        <Image
          fill
          src={story.image!}
          alt={name}
          style={{ objectFit: "cover" }}
        />
      )}

      <Box
        styles={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          background: hasImage
            ? "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.7) 35%, rgba(0,0,0,0) 55%)"
            : "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0.35) 100%)",
        }}
      />

      <Badge
        variant="filled"
        color="rgba(0, 0, 0, 0.42)"
        textColor="#fff"
        uppercase
        translucent
        style={{
          position: "absolute",
          top: 14,
          right: 14,
          zIndex: 2,
        }}
      >
        {date}
      </Badge>

      <Box
        className="card-content"
        flexDirection="column"
        gap={6}
        styles={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 2,
        }}
      >
        {name && (
          <Typography
            as="h3"
            variant="h3"
            color="#fff"
            margin={0}
            styles={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              textShadow: "0 1px 4px rgba(0, 0, 0, 0.6)",
            }}
          >
            {name}
          </Typography>
        )}

        {description && (
          <Typography
            variant="body"
            color="#fff"
            margin={0}
            styles={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              textShadow: "0 1px 3px rgba(0, 0, 0, 0.5)",
            }}
          >
            {description}
          </Typography>
        )}

        {(story.slug || story.href) && (
          <Box
            marginTop={10}
            justifyContent="flex-end"
            styles={{
              zIndex: 2,
            }}
          >
            <Button kind="primary" icon="/icons/next.svg" iconPosition="end">
              {readMore}
            </Button>
          </Box>
        )}
      </Box>
    </>
  );

  // Merge the outer link/article wrapper and the inner surface into a single
  // polymorphic Card: `href` makes it a next/link anchor (internal slug or
  // external href), otherwise it renders a plain surface.
  const surfaceProps = {
    elevation: 5,
    borderRadius: 8,
    padding: 10,
    height: 400,
    backgroundColor: story.background_color ?? "#111827",
    className: "zoom-on-hover",
  } as const;

  if (story.slug) {
    return (
      <Card
        href={`/blog/${story.slug}`}
        prefetch
        {...surfaceProps}
        styles={{ position: "relative", textDecoration: "none" }}
      >
        {cardBody}
      </Card>
    );
  }

  if (story.href) {
    return (
      <Card
        href={story.href}
        target="_blank"
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
