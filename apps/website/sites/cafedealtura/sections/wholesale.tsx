import { getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Container } from "@repo/ui/core-elements/container";
import { Grid } from "@repo/ui/core-elements/grid";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import { getSystem } from "@/lib/system";

/**
 * Wholesale (mayoreo) invitation for Café de Altura.
 *
 * The business already sells to buyers who resell its coffee, so the landing
 * owes them an entry point that is not the retail catalog. Rendered as a single
 * bordered panel on a plain band - a deliberately different shape from the card
 * grids around it, which is what keeps the page from reading as five stacked
 * grids. Its contrast comes from `--surface-2` + a real border, not a gradient.
 *
 * Copy here is fixed UI text (translated), never invented facts or figures: the
 * concrete terms live with the family, and the CTA hands the visitor over to
 * them.
 */
export async function Wholesale() {
  const [system, t] = await Promise.all([
    getSystem(),
    getTranslations("CafeAlturaSite"),
  ]);

  const primary = system?.primary_color ?? "#6f4e37";

  return (
    <Container paddingX={10}>
      <Box paddingY={64}>
        <Box
          padding={40}
          borderRadius={16}
          backgroundColor="var(--surface-2)"
          border="1px solid var(--border)"
        >
          <Grid container spacing={4} alignItems="center">
            <Grid size={{ xs: 12, md: 8 }}>
              <Box display="flex" flexDirection="column" gap="14px">
                <Typography
                  as="span"
                  variant="label"
                  color={primary}
                  fontWeight={700}
                  styles={{
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                  }}
                >
                  {t("wholesale.eyebrow")}
                </Typography>
                <Typography as="h2" variant="h2" fontWeight={800}>
                  {t("wholesale.heading")}
                </Typography>
                <Typography as="p" variant="body" styles={{ lineHeight: 1.7 }}>
                  {t("wholesale.body")}
                </Typography>
              </Box>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Box display="flex">
                <Button
                  text={t("wholesale.cta")}
                  href="/mayoreo"
                  kind="primary"
                  size="lg"
                />
              </Box>
            </Grid>
          </Grid>
        </Box>
      </Box>
    </Container>
  );
}
