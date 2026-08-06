import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import { NavbarSpacer, PageBottomSpacer } from "@repo/ui/core-elements/navbar";
import { HARDWARE_PROJECTS, getHardwareProject } from "@/lib/hardware-projects";
import { PumpkinHouseDoc } from "./_projects/pumpkin-house";
import "./hardware-doc.css";

type Props = {
  params: Promise<{ locale: string; project: string }>;
};

/**
 * Slug → the project's documentation component.
 *
 * The registry in `lib/hardware-projects.json` carries the listing metadata;
 * the body of each build sheet is authored JSX, so it is registered here. A new
 * project is a JSON entry, a `_projects/<slug>.tsx`, and one line in this map.
 */
const PROJECT_DOCS: Record<string, () => ReactNode> = {
  "pumpkin-house": PumpkinHouseDoc,
};

/** Every project is known at build time, so pre-render the whole set. */
export function generateStaticParams() {
  return HARDWARE_PROJECTS.map((project) => ({ project: project.slug }));
}

export default async function HardwareProjectPage({ params }: Props) {
  const { locale, project: slug } = await params;
  setRequestLocale(locale);

  const project = getHardwareProject(slug);
  const Doc = PROJECT_DOCS[slug];
  // A JSON entry with no component (or the reverse) is a half-added project -
  // 404 rather than render a title block with nothing underneath it.
  if (!project || !Doc) notFound();

  const t = await getTranslations("HomePage");
  type MessageKey = Parameters<typeof t>[0];
  const name = t(project.nameKey as MessageKey);

  return (
    <>
      <NavbarSpacer />
      <Container
        size="lg"
        paddingX={24}
        marginTop={16}
        styles={{ paddingBottom: 40 }}
      >
        <Breadcrumbs
          items={[
            { label: t("hardwareBackToList"), href: "/?tab=hardware" },
            { label: name },
          ]}
        />

        <Box className="hw-doc" flexDirection="column">
          {/* ── Title block ─────────────────────────────────────────────── */}
          <Box
            className="hw-titleblock"
            flexDirection="column"
            marginBottom={56}
          >
            <Box className="hw-titleblock__main" flexDirection="column">
              <Typography
                as="p"
                variant="none"
                className="hw-eyebrow"
                marginBottom={18}
              >
                {project.revision}
              </Typography>
              <Typography
                as="h1"
                variant="none"
                className="hw-title"
                marginBottom={16}
              >
                {name}
              </Typography>
              <Typography as="p" variant="none" className="hw-standfirst">
                {t(project.descKey as MessageKey)}
              </Typography>

              <Box gap={8} flexWrap="wrap" marginTop={20}>
                <Badge variant="subtle" size="sm">
                  {project.board}
                </Badge>
                <Badge variant="outlined" size="sm">
                  {project.language}
                </Badge>
                <Badge variant="outlined" size="sm">
                  {t("hardwareSourceLabel")}: {project.sourcePath}
                </Badge>
              </Box>
            </Box>

            <dl className="hw-specgrid">
              {project.specs.map((spec) => (
                <div className="hw-spec" key={spec.label}>
                  <dt>{spec.label}</dt>
                  <dd>{spec.value}</dd>
                </div>
              ))}
            </dl>
          </Box>

          {/* ── The build sheet ─────────────────────────────────────────── */}
          <Doc />
        </Box>
      </Container>
      <PageBottomSpacer />
    </>
  );
}
