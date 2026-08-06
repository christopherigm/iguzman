import { getTranslations } from "next-intl/server";
import { Grid } from "@repo/ui/core-elements/grid";
import { Card } from "@repo/ui/core-elements/card";
import { Box } from "@repo/ui/core-elements/box";
import { Badge } from "@repo/ui/core-elements/badge";
import { Typography } from "@repo/ui/core-elements/typography";
import { HARDWARE_PROJECTS } from "@/lib/hardware-projects";
import "./hardware-panel.css";

export async function HardwarePanel() {
  const t = await getTranslations("HomePage");

  // The registry is JSON, so its key fields are typed `string` rather than the
  // literal union `t()` wants. The keys are real - every one has an entry in
  // messages/en.json and es.json - so this narrows at the single boundary where
  // JSON meets the typed catalogue rather than sprinkling casts through the JSX.
  type MessageKey = Parameters<typeof t>[0];

  return (
    <>
      <Typography
        as="p"
        variant="body"
        color="var(--foreground-muted)"
        marginBottom={24}
      >
        {t("hardwareIntro")}
      </Typography>

      <Grid container spacing={2}>
        {HARDWARE_PROJECTS.map((project) => (
          <Grid key={project.slug} size={{ xs: 12, sm: 6 }}>
            <Card
              href={`/hardware/${project.slug}`}
              className="hardware-card"
              height="100%"
              gap={10}
              padding={18}
            >
              <Box alignItems="center" gap={12}>
                {/* The emoji is decoration - the project name beside it is the
                    accessible label, so don't let a screen reader read it out. */}
                <Typography
                  as="span"
                  variant="none"
                  aria-hidden
                  styles={{ fontSize: 30, lineHeight: 1 }}
                >
                  {project.icon}
                </Typography>
                <Typography as="h3" variant="h4" fontWeight={600}>
                  {t(project.nameKey as MessageKey)}
                </Typography>
              </Box>

              <Typography as="p" variant="body" color="var(--foreground-muted)">
                {t(project.descKey as MessageKey)}
              </Typography>

              <Box gap={8} flexWrap="wrap" marginTop="auto" paddingTop={6}>
                <Badge variant="subtle" size="sm">
                  {project.board}
                </Badge>
                <Badge variant="outlined" size="sm">
                  {project.language}
                </Badge>
              </Box>
            </Card>
          </Grid>
        ))}
      </Grid>
    </>
  );
}
