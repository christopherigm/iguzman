import Image from "next/image";
import { getTranslations, getLocale } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Container } from "@repo/ui/core-elements/container";
import { Grid } from "@repo/ui/core-elements/grid";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import { LinkButton } from "@repo/ui/core-elements/link-button";
import { getSystem } from "@/lib/system";
import { localized } from "../localized";

/**
 * "The origin" section for Café de Altura - the family-farm story that is the
 * whole reason a visitor buys from the producer instead of a middleman.
 *
 * Two-column split (story on the left, photo of the plot on the right at md+),
 * so on mobile the copy leads and the image follows below it. The story text
 * sits behind a thin accent rule, which is the single accent moment in the
 * section - the primary CTA carries the rest.
 *
 * All copy and imagery are DB-driven (`System.about` / `img_about`), so the
 * family self-edits them in the CMS; only the composition is ours.
 */
export async function Origin() {
  const [system, locale, t] = await Promise.all([
    getSystem(),
    getLocale(),
    getTranslations("CafeAlturaSite"),
  ]);

  const about = localized(locale, system?.about, system?.en_about);

  // Nothing meaningful to show without About copy or a slogan - skip the block.
  const body = about || system?.slogan || "";
  if (!body) return null;

  const primary = system?.primary_color ?? "#6f4e37";
  const hasProducts = (system?.product_count ?? 0) > 0;

  return (
    <Container paddingX={10}>
      <Box paddingY={64}>
        <Grid container spacing={4} alignItems="center">
          <Grid size={{ xs: 12, md: 6 }}>
            <Box display="flex" flexDirection="column" gap="20px">
              <Typography
                as="span"
                variant="label"
                color={primary}
                fontWeight={700}
                styles={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
              >
                {t("origin.eyebrow")}
              </Typography>

              <Typography as="h2" variant="h2" fontWeight={800}>
                {system?.site_name ?? "Café de Altura"}
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
                  {body}
                </Typography>
              </Box>

              <Box
                display="flex"
                gap="16px"
                flexWrap="wrap"
                alignItems="center"
                marginTop="8px"
              >
                {hasProducts && (
                  <Button
                    text={t("origin.viewCoffees")}
                    href="/categories/products"
                    kind="primary"
                    size="lg"
                  />
                )}
                <LinkButton label={t("origin.learnMore")} href="/about" />
              </Box>
            </Box>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Box
              width="100%"
              height={460}
              maxHeight="62vh"
              borderRadius={16}
              elevation={6}
              backgroundColor="var(--surface-2)"
              styles={{ position: "relative", overflow: "hidden" }}
            >
              {system?.img_about && (
                <Image
                  fill
                  src={system.img_about}
                  alt={system?.site_name ?? ""}
                  sizes="(max-width: 900px) 100vw, 50vw"
                  style={{ objectFit: "cover" }}
                />
              )}
            </Box>
          </Grid>
        </Grid>
      </Box>
    </Container>
  );
}
