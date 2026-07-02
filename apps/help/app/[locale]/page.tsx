import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { NavbarSpacer } from "@repo/ui/core-elements/navbar";
import { CodeBlock } from "@repo/ui/core-elements/code-block";
import { TabMenu } from "./tab-menu";
import { ServicesPanel } from "./services-panel";
import { ToolsPanel } from "./edit-videos-panel";
import { SmartTvPanel } from "./smarttv-panel";
import "./page.css";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

const VALID_TABS = [
  "getting-started",
  "commands",
  "services",
  "tools",
  "smart-tv",
  "dev-cycle",
] as const;
type Tab = (typeof VALID_TABS)[number];

// ── Getting Started tab ───────────────────────────────────────────────────────

const CLONE_COMMAND =
  "git clone https://github.com/christopherigm/iguzman\ncd iguzman";

const SETUP_SCRIPT_COMMAND = "bash cli/setup-dev-env/setup-dev-env.sh";

const SSH_KEY_COMMAND =
  "cat ~/.ssh/id_ed25519.pub\n" +
  "# or, if you chose RSA:\n" +
  "cat ~/.ssh/id_rsa.pub";

const VERIFY_COMMANDS =
  "kubectl version --client\n" + "helm version\n" + "kubectl get nodes";

// ── Development Cycle tab ─────────────────────────────────────────────────────

const GIT_SAVE_COMMAND = 'git add .\ngit commit -m "your commit message"';
const GIT_PUSH_COMMAND = "git push origin main";
const GIT_PULL_COMMAND = "git pull origin main";
const GIT_UNDO_COMMAND = "git checkout .";
const GIT_NEW_BRANCH_COMMAND = "git checkout -b feature/my-feature";
const GIT_SWITCH_MAIN_COMMAND = "git checkout main";

// ── Commands tab ─────────────────────────────────────────────────────────────

const NEW_APP_COMMAND = "pnpm new-app";
const NEW_API_COMMAND = "pnpm new-api";
const NEW_TV_APP_COMMAND = "pnpm new-tv-app";
const SETUP_MINECRAFT_COMMAND = "pnpm setup-minecraft";
const GENERATE_ICONS_COMMANDS =
  "pnpm generate-icons              # pick app interactively\n" +
  "pnpm generate-icons my-app       # target a specific app";
const SECRETS_COMMAND = "pnpm secrets";
const DEPLOY_APP_COMMANDS =
  "pnpm deploy-app                  # pick app interactively\n" +
  "pnpm deploy-app my-app           # target a specific app\n" +
  "pnpm deploy-app my-app -y        # skip all confirmations (CI)";
const HELM_COMMANDS =
  "pnpm helm                        # pick app and operation\n" +
  "pnpm helm my-app                 # skip app selection";
const DEPLOY_SERVICES_COMMANDS =
  "pnpm deploy-postgres\n" +
  "pnpm deploy-mongodb\n" +
  "pnpm deploy-mysql\n" +
  "pnpm deploy-redis";
const DEV_SERVICES_COMMANDS =
  "pnpm dev-services                # pick app, then an action\n" +
  "pnpm dev-services my-api         # skip app selection\n" +
  "pnpm dev-services my-api -y      # skip confirmations";
const DJANGO_SUPERUSER_COMMANDS =
  "pnpm django-superuser            # pick app interactively\n" +
  "pnpm django-superuser my-api     # target a specific app";
const LOGS_COMMAND = "pnpm logs";
const DEV_COMMANDS =
  "pnpm dev                              # Start all apps in dev mode\n" +
  "pnpm dev --filter=video-downloader    # Start a single app";
const BUILD_COMMANDS =
  "pnpm build                            # Build all packages and apps\n" +
  "pnpm build --filter=web               # Build a single app";
const LINT_COMMANDS =
  "pnpm lint                             # ESLint across all packages (max-warnings 0)\n" +
  "pnpm check-types                      # TypeScript type checking across all packages\n" +
  "pnpm format                           # Prettier format all .ts/.tsx/.md files";

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function Home({ params, searchParams }: Props) {
  const { locale } = await params;
  const { tab: rawTab } = await searchParams;
  const tab: Tab = VALID_TABS.includes(rawTab as Tab)
    ? (rawTab as Tab)
    : "getting-started";

  setRequestLocale(locale);
  const t = await getTranslations("HomePage");

  const heading =
    tab === "getting-started"
      ? t("gettingStartedTitle")
      : tab === "services"
        ? t("servicesTitle")
        : tab === "tools"
          ? t("toolsTitle")
          : tab === "smart-tv"
            ? t("smartTvTitle")
            : tab === "dev-cycle"
              ? t("devCycleTitle")
              : t("title");

  const subheading =
    tab === "getting-started"
      ? t("gettingStartedSubtitle")
      : tab === "services"
        ? t("servicesSubtitle")
        : tab === "tools"
          ? t("toolsSubtitle")
          : tab === "smart-tv"
            ? t("smartTvSubtitle")
            : tab === "dev-cycle"
              ? t("devCycleSubtitle")
              : t("subtitle");

  const menuLabels = {
    "getting-started": t("menuGettingStarted"),
    commands: t("menuCommands"),
    services: t("menuServices"),
    tools: t("menuTools"),
    "smart-tv": t("menuSmartTv"),
    "dev-cycle": t("menuDevCycle"),
  };

  return (
    <>
      <NavbarSpacer />
      <Container
        size="lg"
        paddingX={24}
        styles={{ paddingTop: 40, paddingBottom: 80 }}
      >
        <Typography as="h1" variant="h2" marginBottom={8}>
          {heading}
        </Typography>
        <Typography
          as="p"
          variant="body"
          color="var(--foreground-muted)"
          marginBottom={40}
        >
          {subheading}
        </Typography>

        <Box
          display="flex"
          gap={40}
          alignItems="flex-start"
          className="help-layout"
        >
          <Box className="help-sidebar">
            <Suspense fallback={null}>
              <TabMenu labels={menuLabels} />
            </Suspense>
          </Box>

          <Box flexDirection="column" flexGrow={1}>
            {tab === "getting-started" && (
              <>
                <PrereqSection
                  heading={t("prereqSection")}
                  description={t("prereqDescription")}
                  items={[
                    { label: t("prereqLinux") },
                    {
                      label: t("prereqDocker"),
                      href: "https://hub.docker.com/signup",
                    },
                    { label: t("prereqGithub"), href: "https://github.com" },
                    {
                      label: t("prereqGit"),
                      href: "https://git-scm.com/downloads",
                      note: t("prereqGitNote"),
                    },
                    { label: t("prereqClaude"), href: "https://claude.ai" },
                  ]}
                />
                <Section
                  heading={t("cloneRepoSection")}
                  description={t("cloneRepoDescription")}
                  code={CLONE_COMMAND}
                />
                <Section
                  heading={t("setupScriptSection")}
                  description={t("setupScriptDescription")}
                  code={SETUP_SCRIPT_COMMAND}
                />
                <Section
                  heading={t("sshKeySection")}
                  description={t("sshKeyDescription")}
                  code={SSH_KEY_COMMAND}
                />
                <Section
                  heading={t("verifySection")}
                  description={t("verifyDescription")}
                  code={VERIFY_COMMANDS}
                />
              </>
            )}

            {tab === "commands" && (
              <>
                <Typography
                  as="p"
                  variant="none"
                  color="var(--foreground-muted)"
                  fontWeight={600}
                  marginBottom={24}
                  styles={{
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {t("projectGroup")}
                </Typography>

                <Section
                  heading={t("newAppSection")}
                  description={t("newAppDescription")}
                  code={NEW_APP_COMMAND}
                />
                <Section
                  heading={t("newApiSection")}
                  description={t("newApiDescription")}
                  code={NEW_API_COMMAND}
                />
                <Section
                  heading={t("newTvAppSection")}
                  description={t("newTvAppDescription")}
                  code={NEW_TV_APP_COMMAND}
                />
                <Section
                  heading={t("setupMinecraftSection")}
                  description={t("setupMinecraftDescription")}
                  code={SETUP_MINECRAFT_COMMAND}
                />
                <Section
                  heading={t("generateIconsSection")}
                  description={t("generateIconsDescription")}
                  code={GENERATE_ICONS_COMMANDS}
                />
                <Section
                  heading={t("secretsSection")}
                  description={t("secretsDescription")}
                  code={SECRETS_COMMAND}
                />
                <Section
                  heading={t("deployAppSection")}
                  description={t("deployAppDescription")}
                  code={DEPLOY_APP_COMMANDS}
                />
                <Section
                  heading={t("helmSection")}
                  description={t("helmDescription")}
                  code={HELM_COMMANDS}
                />
                <Section
                  heading={t("deployServicesSection")}
                  description={t("deployServicesDescription")}
                  code={DEPLOY_SERVICES_COMMANDS}
                />
                <Section
                  heading={t("devServicesSection")}
                  description={t("devServicesDescription")}
                  code={DEV_SERVICES_COMMANDS}
                />
                <Section
                  heading={t("djangoSuperuserSection")}
                  description={t("djangoSuperuserDescription")}
                  code={DJANGO_SUPERUSER_COMMANDS}
                />
                <Section
                  heading={t("logsSection")}
                  description={t("logsDescription")}
                  code={LOGS_COMMAND}
                />

                <Typography
                  as="p"
                  variant="none"
                  color="var(--foreground-muted)"
                  fontWeight={600}
                  marginTop={8}
                  marginBottom={24}
                  styles={{
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {t("devGroup")}
                </Typography>

                <Section
                  heading={t("devSection")}
                  description={t("devDescription")}
                  code={DEV_COMMANDS}
                />
                <Section
                  heading={t("buildSection")}
                  description={t("buildDescription")}
                  code={BUILD_COMMANDS}
                />
                <Section
                  heading={t("lintSection")}
                  description={t("lintDescription")}
                  code={LINT_COMMANDS}
                />
              </>
            )}

            {tab === "services" && <ServicesPanel />}

            {tab === "tools" && <ToolsPanel />}

            {tab === "smart-tv" && <SmartTvPanel />}

            {tab === "dev-cycle" && (
              <>
                <Typography
                  as="p"
                  variant="none"
                  color="var(--foreground-muted)"
                  fontWeight={600}
                  marginBottom={24}
                  styles={{
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {t("devCycleGitGroup")}
                </Typography>

                <Section
                  heading={t("devCycleSaveSection")}
                  description={t("devCycleSaveDescription")}
                  code={GIT_SAVE_COMMAND}
                />
                <Section
                  heading={t("devCyclePushSection")}
                  description={t("devCyclePushDescription")}
                  code={GIT_PUSH_COMMAND}
                />
                <Section
                  heading={t("devCyclePullSection")}
                  description={t("devCyclePullDescription")}
                  code={GIT_PULL_COMMAND}
                />
                <Section
                  heading={t("devCycleUndoSection")}
                  description={t("devCycleUndoDescription")}
                  code={GIT_UNDO_COMMAND}
                />

                <Typography
                  as="p"
                  variant="none"
                  color="var(--foreground-muted)"
                  fontWeight={600}
                  marginTop={8}
                  marginBottom={24}
                  styles={{
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {t("devCycleBranchGroup")}
                </Typography>

                <Section
                  heading={t("devCycleNewBranchSection")}
                  description={t("devCycleNewBranchDescription")}
                  code={GIT_NEW_BRANCH_COMMAND}
                />
                <Section
                  heading={t("devCycleSwitchMainSection")}
                  description={t("devCycleSwitchMainDescription")}
                  code={GIT_SWITCH_MAIN_COMMAND}
                />

                <Typography
                  as="p"
                  variant="none"
                  color="var(--foreground-muted)"
                  fontWeight={600}
                  marginTop={8}
                  marginBottom={24}
                  styles={{
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {t("devCycleDeployGroup")}
                </Typography>

                <Section
                  heading={t("devCycleSecretsSection")}
                  description={t("devCycleSecretsDescription")}
                  code={SECRETS_COMMAND}
                />
                <Section
                  heading={t("devCycleLogsSection")}
                  description={t("devCycleLogsDescription")}
                  code={LOGS_COMMAND}
                />
                <Section
                  heading={t("devCycleRevealSecretsSection")}
                  description={t("devCycleRevealSecretsDescription")}
                  code={HELM_COMMANDS}
                />
                <Section
                  heading={t("devCycleDeploySection")}
                  description={t("devCycleDeployDescription")}
                  code={DEPLOY_APP_COMMANDS}
                />
              </>
            )}
          </Box>
        </Box>
      </Container>
    </>
  );
}

function Section({
  heading,
  description,
  code,
}: {
  heading: string;
  description: string;
  code: string;
}) {
  return (
    <Box flexDirection="column" gap={8} marginBottom={40}>
      <Typography as="h2" variant="h3">
        {heading}
      </Typography>
      <Typography as="p" variant="body" color="var(--foreground-muted)">
        {description}
      </Typography>
      <CodeBlock language="bash" code={code} />
    </Box>
  );
}

function PrereqSection({
  heading,
  description,
  items,
}: {
  heading: string;
  description: string;
  items: { label: string; href?: string; note?: string }[];
}) {
  return (
    <Box flexDirection="column" gap={8} marginBottom={40}>
      <Typography as="h2" variant="h3">
        {heading}
      </Typography>
      <Typography as="p" variant="body" color="var(--foreground-muted)">
        {description}
      </Typography>
      <Box flexDirection="column" gap={6} marginTop={8}>
        {items.map(({ label, href, note }) => (
          <Box key={label} alignItems="center" gap={8}>
            <Typography
              as="span"
              variant="body"
              color="var(--foreground-muted)"
            >
              •
            </Typography>
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "var(--accent)",
                  textDecoration: "underline",
                  fontSize: 14,
                }}
              >
                {label}
              </a>
            ) : (
              <Typography as="span" variant="body">
                {label}
              </Typography>
            )}
            {note && (
              <Typography
                as="span"
                variant="body"
                color="var(--foreground-muted)"
              >
                - {note}
              </Typography>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
