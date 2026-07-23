import Image from "next/image";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";

/** The shape every buyable's sibling-variant payload shares. Products, services
 *  and menu items each nest a shallow list of these on their detail response. */
export interface VariantRef {
  id: number;
  slug: string;
  name: string | null;
  en_name: string | null;
  image: string | null;
}

/**
 * A single variant thumbnail: image (or initial-letter placeholder) above the
 * variant's name. The item currently being viewed renders highlighted and is
 * not a link; every sibling links to its own detail page, so the card reads as
 * a selector across the family of alternative versions.
 */
function VariantThumb({
  href,
  name,
  image,
  current,
}: {
  href: string;
  name: string;
  image: string | null;
  current: boolean;
}) {
  const inner = (
    <Box flexDirection="column" alignItems="center" gap={8} width={64}>
      <Box
        width={64}
        height={64}
        borderRadius={8}
        border={
          current
            ? "2px solid var(--primary, #16a34a)"
            : "1px solid var(--surface-3, #e5e7eb)"
        }
        backgroundColor="var(--surface-3, #e5e7eb)"
        alignItems="center"
        justifyContent="center"
        styles={{ position: "relative", overflow: "hidden", flex: "0 0 auto" }}
      >
        {image ? (
          <Image
            fill
            src={image}
            alt={name}
            sizes="64px"
            style={{ objectFit: "cover" }}
          />
        ) : (
          <Typography as="span" variant="h5" color="var(--foreground)">
            {name.charAt(0).toUpperCase()}
          </Typography>
        )}
      </Box>
      <Typography
        variant="caption"
        color={current ? "var(--primary, #16a34a)" : "var(--foreground)"}
        styles={{ textAlign: "center", lineHeight: 1.2 }}
      >
        {name}
      </Typography>
    </Box>
  );

  if (current) {
    // The active item: no link, and marked current for assistive tech.
    return (
      <Box aria-current="true" styles={{ textDecoration: "none" }}>
        {inner}
      </Box>
    );
  }

  return (
    <Card
      href={href}
      prefetch
      padding={0}
      border="none"
      elevation={0}
      backgroundColor="transparent"
      styles={{ textDecoration: "none" }}
    >
      {inner}
    </Card>
  );
}

/**
 * The row of sibling variants on a detail page: the item being viewed first
 * (highlighted, non-clickable), then each alternative version linking to its
 * own page. Shared by the product, service and menu-item detail panels, which
 * all model variants the same way - each sibling is a standalone buyable of the
 * same kind, linked by a symmetrical `variants` relation.
 *
 * `basePath` is the detail route for that kind ("/products", "/services",
 * "/food"); the caller renders nothing when `variants` is empty.
 */
export function VariantThumbs({
  basePath,
  current,
  variants,
  locale,
}: {
  basePath: string;
  current: { slug: string; name: string; image: string | null };
  variants: VariantRef[];
  locale: string;
}) {
  const variantName = (v: VariantRef) =>
    (locale === "en" ? v.en_name : v.name) ?? v.name ?? v.en_name ?? "";

  return (
    <Box flexWrap="wrap" gap={12}>
      <VariantThumb
        href={`${basePath}/${current.slug}`}
        name={current.name}
        image={current.image}
        current
      />
      {variants.map((v) => (
        <VariantThumb
          key={v.id}
          href={`${basePath}/${v.slug}`}
          name={variantName(v)}
          image={v.image}
          current={false}
        />
      ))}
    </Box>
  );
}
