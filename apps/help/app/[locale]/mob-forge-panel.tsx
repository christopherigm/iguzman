import { getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { CodeBlock } from "@repo/ui/core-elements/code-block";

// ── Setup — Linux & macOS (the cross-platform setup script does the work) ─────

const MOBFORGE_SETUP =
  "pnpm setup-minecraft\n" +
  "# Installs Java 17 (Temurin) + Blockbench, then verifies the mod compiles.\n" +
  "#   Linux:  JDK via apt/snap, Blockbench via Flatpak / snap / AppImage\n" +
  "#   macOS:  brew install --cask temurin@17 blockbench";

const MOBFORGE_PLUGINS =
  '# In Blockbench: File > Plugins > install "GeckoLib Models & Animations".\n' +
  "# Then File > Plugins > Load Plugin from URL:\n" +
  "https://jasonjgardner.github.io/blockbench-mcp-plugin/mcp.js\n" +
  "# Enabling it serves the MCP server at http://localhost:3000/bb-mcp";

const MOBFORGE_MCP =
  "claude mcp add blockbench --transport http http://localhost:3000/bb-mcp\n" +
  "# Restart Claude Code so the Blockbench MCP tools load.";

const MOBFORGE_BUILD =
  "pnpm --filter=mob-forge build   # ./gradlew build\n" +
  "pnpm --filter=mob-forge dev     # ./gradlew runClient (launches the client)";

// ── Setup — Windows (manual; no Bash script) ──────────────────────────────────

const MOBFORGE_WIN_GIT = "winget install -e --id Git.Git";

const MOBFORGE_WIN_NODE =
  "winget install -e --id OpenJS.NodeJS.LTS\n" +
  "corepack enable pnpm            # pnpm ships with Node via Corepack\n" +
  "# or install pnpm on its own:\n" +
  "winget install -e --id pnpm.pnpm";

const MOBFORGE_WIN_JAVA =
  "winget install -e --id EclipseAdoptium.Temurin.17.JDK";

const MOBFORGE_WIN_BLOCKBENCH = "winget install -e --id JannisX11.Blockbench";

const MOBFORGE_WIN_CLAUDE =
  "winget install -e --id Anthropic.ClaudeCode\n" +
  "# or the native PowerShell installer:\n" +
  "irm https://claude.ai/install.ps1 | iex";

const MOBFORGE_WIN_PLUGINS =
  '# In Blockbench: File > Plugins > "GeckoLib Models & Animations",\n' +
  "# then Load Plugin from URL:\n" +
  "https://jasonjgardner.github.io/blockbench-mcp-plugin/mcp.js\n" +
  "# Register the server with Claude Code, then restart it:\n" +
  "claude mcp add blockbench --transport http http://localhost:3000/bb-mcp";

const MOBFORGE_WIN_BUILD =
  "pnpm --filter=mob-forge build   # cross-platform: runs gradlew.bat on Windows\n" +
  "pnpm --filter=mob-forge dev     # launches the dev client\n" +
  "# or call the Windows wrapper directly from apps\\mob-forge:\n" +
  "cd apps\\mob-forge\n" +
  ".\\gradlew.bat build\n" +
  ".\\gradlew.bat runClient";

// ── End-to-end workflow ───────────────────────────────────────────────────────

const MOBFORGE_PREFLIGHT =
  "# Open Blockbench (GeckoLib + MCP plugins loaded).\n" +
  "# The MCP server must be live at:\n" +
  "http://localhost:3000/bb-mcp";

const MOBFORGE_SKILL =
  "/mob-forge a hostile flying eyeball that shoots lasers\n" +
  "/mob-forge a living green cube that bounces up and down";

const MOBFORGE_EXAMPLE =
  "apps/mob-forge/\n" +
  "  src/main/java/com/iguzman/mobforge/entity/EyeballEntity.java\n" +
  "  src/main/java/com/iguzman/mobforge/client/EyeballRenderer.java\n" +
  "  src/main/resources/assets/mobforge/\n" +
  "    geo/eyeball.geo.json               # model\n" +
  "    animations/eyeball.animation.json  # animation.eyeball.fly, ...\n" +
  "    textures/entity/eyeball.png        # texture\n" +
  "  blockbench/eyeball.bbmodel           # editable source (committed)";

const MOBFORGE_INGAME =
  "pnpm --filter=mob-forge dev\n" +
  "# Launch the client, open the Spawn Eggs tab, use the Eyeball Spawn Egg.";

// ── Edit & hand-paint an existing mob (Blockbench, per-part) ───────────────────

const MOBFORGE_EDIT_SOURCE =
  "apps/mob-forge/\n" +
  "  blockbench/flyingseal.bbmodel                 # editable source (edit this)\n" +
  "  src/main/resources/assets/mobforge/\n" +
  "    geo/flyingseal.geo.json                     # build output (UV baked in)\n" +
  "    textures/entity/flyingseal.png              # build output (shipped texture)\n" +
  "    animations/flyingseal.animation.json        # build output";

const MOBFORGE_OPEN =
  "# Blockbench > File > Open Model...  (double-clicking the file works too)\n" +
  "apps/mob-forge/blockbench/flyingseal.bbmodel";

const MOBFORGE_SAVE =
  "# 1. Save the source model:      File > Save  (Ctrl+S)\n" +
  "# 2. Export the painted texture: Paint tab > right-click texture > Save As...\n" +
  "#    Overwrite it, keeping the SAME path and pixel dimensions:\n" +
  "apps/mob-forge/src/main/resources/assets/mobforge/textures/entity/flyingseal.png";

const MOBFORGE_REBUILD =
  "pnpm --filter=mob-forge build   # bakes the new texture into the mod jar\n" +
  "pnpm --filter=mob-forge dev     # spawn the mob to verify the paint in-game";

// ── Scripted face painting (mob_face.py — needs Python 3 + Pillow) ─────────────

const MOBFORGE_FACEPAINT =
  "# One-time: install Pillow, the image library the face-painter uses.\n" +
  "#   Linux/macOS (Python 3 usually ships already):\n" +
  "python3 -m pip install --user Pillow\n" +
  "#   Windows (install Python first, then Pillow):\n" +
  "winget install -e --id Python.Python.3.12\n" +
  "py -m pip install Pillow\n" +
  "\n" +
  "# Paint eyes/mouth/nose onto the atlas AND re-embed into the .bbmodel:\n" +
  "python3 tools/mob_face.py paint --spec tools/faces/<id>.face.json --root .\n" +
  "# (on Windows use `py` instead of `python3`; run from apps/mob-forge)";

// ── External documentation / download links ───────────────────────────────────

const DOC_TEMURIN = "https://adoptium.net/temurin/releases/?version=17";
const DOC_BLOCKBENCH = "https://www.blockbench.net/downloads";
const DOC_MCP_PLUGIN = "https://github.com/jasonjgardner/blockbench-mcp-plugin";
const DOC_GECKOLIB = "https://www.geckolib.com/";
const DOC_CLAUDE_MCP = "https://code.claude.com/docs/en/mcp";
const DOC_GIT = "https://git-scm.com/download/win";
const DOC_NODE = "https://nodejs.org/en/download";
const DOC_PNPM = "https://pnpm.io/installation";
const DOC_CLAUDE_SETUP = "https://code.claude.com/docs/en/setup";
const DOC_PYTHON = "https://www.python.org/downloads/";
const DOC_PILLOW = "https://pillow.readthedocs.io/en/stable/installation.html";

// ── Component ─────────────────────────────────────────────────────────────────

export async function MobForgePanel() {
  const t = await getTranslations("HomePage");

  return (
    <>
      {/* 1 ─ Linux & macOS: the setup script installs the toolchain. */}
      <GroupLabel>{t("mobForgeUnixGroup")}</GroupLabel>

      <StepSection
        heading={t("mobForgePrereqHeading")}
        description={t("mobForgePrereqDesc")}
      />
      <StepSection
        heading={t("mobForgeSetupHeading")}
        description={t("mobForgeSetupDesc")}
        code={MOBFORGE_SETUP}
        links={[
          { label: t("mobForgeTemurinLink"), href: DOC_TEMURIN },
          { label: t("mobForgeBlockbenchLink"), href: DOC_BLOCKBENCH },
        ]}
      />
      <StepSection
        heading={t("mobForgePluginsHeading")}
        description={t("mobForgePluginsDesc")}
        code={MOBFORGE_PLUGINS}
        links={[
          { label: t("mobForgeMcpPluginLink"), href: DOC_MCP_PLUGIN },
          { label: t("mobForgeGeckolibLink"), href: DOC_GECKOLIB },
        ]}
      />
      <StepSection
        heading={t("mobForgeMcpHeading")}
        description={t("mobForgeMcpDesc")}
        code={MOBFORGE_MCP}
        links={[{ label: t("mobForgeClaudeMcpLink"), href: DOC_CLAUDE_MCP }]}
      />
      <StepSection
        heading={t("mobForgeVerifyHeading")}
        description={t("mobForgeVerifyDesc")}
        code={MOBFORGE_BUILD}
      />

      {/* 2 ─ Windows: install each tool by hand (no Bash script). */}
      <GroupLabel marginTop={8}>{t("mobForgeWindowsGroup")}</GroupLabel>

      <StepSection
        heading={t("mobForgeWinIntroHeading")}
        description={t("mobForgeWinIntroDesc")}
      />
      <StepSection
        heading={t("mobForgeWinGitHeading")}
        description={t("mobForgeWinGitDesc")}
        code={MOBFORGE_WIN_GIT}
        language="powershell"
        links={[{ label: t("mobForgeGitLink"), href: DOC_GIT }]}
      />
      <StepSection
        heading={t("mobForgeWinNodeHeading")}
        description={t("mobForgeWinNodeDesc")}
        code={MOBFORGE_WIN_NODE}
        language="powershell"
        links={[
          { label: t("mobForgeNodeLink"), href: DOC_NODE },
          { label: t("mobForgePnpmLink"), href: DOC_PNPM },
        ]}
      />
      <StepSection
        heading={t("mobForgeWinJavaHeading")}
        description={t("mobForgeWinJavaDesc")}
        code={MOBFORGE_WIN_JAVA}
        language="powershell"
        links={[{ label: t("mobForgeTemurinLink"), href: DOC_TEMURIN }]}
      />
      <StepSection
        heading={t("mobForgeWinBlockbenchHeading")}
        description={t("mobForgeWinBlockbenchDesc")}
        code={MOBFORGE_WIN_BLOCKBENCH}
        language="powershell"
        links={[{ label: t("mobForgeBlockbenchLink"), href: DOC_BLOCKBENCH }]}
      />
      <StepSection
        heading={t("mobForgeWinClaudeHeading")}
        description={t("mobForgeWinClaudeDesc")}
        code={MOBFORGE_WIN_CLAUDE}
        language="powershell"
        links={[{ label: t("mobForgeClaudeLink"), href: DOC_CLAUDE_SETUP }]}
      />
      <StepSection
        heading={t("mobForgeWinPluginsHeading")}
        description={t("mobForgeWinPluginsDesc")}
        code={MOBFORGE_WIN_PLUGINS}
        links={[
          { label: t("mobForgeMcpPluginLink"), href: DOC_MCP_PLUGIN },
          { label: t("mobForgeClaudeMcpLink"), href: DOC_CLAUDE_MCP },
        ]}
      />
      <StepSection
        heading={t("mobForgeWinBuildHeading")}
        description={t("mobForgeWinBuildDesc")}
        code={MOBFORGE_WIN_BUILD}
        language="powershell"
      />

      {/* 3 ─ Prompt-to-play workflow (same on every OS). */}
      <GroupLabel marginTop={8}>{t("mobForgeWorkflowGroup")}</GroupLabel>

      <StepSection
        heading={t("mobForgePreflightHeading")}
        description={t("mobForgePreflightDesc")}
        code={MOBFORGE_PREFLIGHT}
        language="text"
      />
      <StepSection
        heading={t("mobForgeAuthorHeading")}
        description={t("mobForgeAuthorDesc")}
        code={MOBFORGE_SKILL}
        language="text"
      />
      <StepSection
        heading={t("mobForgeExampleHeading")}
        description={t("mobForgeExampleDesc")}
        code={MOBFORGE_EXAMPLE}
        language="text"
      />
      <StepSection
        heading={t("mobForgeIngameHeading")}
        description={t("mobForgeIngameDesc")}
        code={MOBFORGE_INGAME}
      />

      {/* 4 ─ Edit & hand-paint a mob after creation (Blockbench, per-part). */}
      <GroupLabel marginTop={8}>{t("mobForgeEditGroup")}</GroupLabel>

      <StepSection
        heading={t("mobForgeSourceHeading")}
        description={t("mobForgeSourceDesc")}
        code={MOBFORGE_EDIT_SOURCE}
        language="text"
      />
      <StepSection
        heading={t("mobForgeOpenHeading")}
        description={t("mobForgeOpenDesc")}
        code={MOBFORGE_OPEN}
        language="text"
      />
      <StepSection
        heading={t("mobForgePaintHeading")}
        description={t("mobForgePaintDesc")}
      />
      <StepSection
        heading={t("mobForgeFacePaintHeading")}
        description={t("mobForgeFacePaintDesc")}
        code={MOBFORGE_FACEPAINT}
        links={[
          { label: t("mobForgePythonLink"), href: DOC_PYTHON },
          { label: t("mobForgePillowLink"), href: DOC_PILLOW },
        ]}
      />
      <StepSection
        heading={t("mobForgeSaveHeading")}
        description={t("mobForgeSaveDesc")}
        code={MOBFORGE_SAVE}
        language="text"
      />
      <StepSection
        heading={t("mobForgeRebuildHeading")}
        description={t("mobForgeRebuildDesc")}
        code={MOBFORGE_REBUILD}
      />
    </>
  );
}

interface StepLink {
  label: string;
  href: string;
}

function StepSection({
  heading,
  description,
  code,
  language = "bash",
  links,
}: {
  heading: string;
  description: string;
  code?: string;
  language?: string;
  links?: StepLink[];
}) {
  return (
    <Box flexDirection="column" gap={8} marginBottom={40}>
      <Typography as="h2" variant="h3">
        {heading}
      </Typography>
      <Typography as="p" variant="body" color="var(--foreground-muted)">
        {description}
      </Typography>
      {links && links.length > 0 && (
        <Box flexDirection="column" gap={6} marginTop={4}>
          {links.map(({ label, href }) => (
            <a
              key={href}
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
          ))}
        </Box>
      )}
      {code && <CodeBlock language={language} code={code} />}
    </Box>
  );
}

function GroupLabel({
  children,
  marginTop,
}: {
  children: React.ReactNode;
  marginTop?: number;
}) {
  return (
    <Typography
      as="p"
      variant="none"
      color="var(--foreground-muted)"
      fontWeight={600}
      marginTop={marginTop}
      marginBottom={24}
      styles={{
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
      }}
    >
      {children}
    </Typography>
  );
}
