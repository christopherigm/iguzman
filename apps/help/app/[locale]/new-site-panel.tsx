import { getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { CodeBlock } from "@repo/ui/core-elements/code-block";

// ── Scaffold & configure ──────────────────────────────────────────────────────

const NEWSITE_SKILL =
  "/new-site acme.com\n" +
  "/new-site a landing for La Cocina restaurant\n" +
  "# In Claude Code. Pass a domain, a customer name, and/or a design brief.";

const NEWSITE_CLI =
  "pnpm new-site <domain> [slug]\n" +
  "pnpm new-site acme.com                 # slug defaults to 'acme'\n" +
  "pnpm new-site la-cocina.mx la-cocina   # explicit slug";

const NEWSITE_TREE =
  "apps/website/sites/\n" +
  "  registry.ts                 # host -> site index (CLI inserts an entry)\n" +
  "  _default/                   # generic fallback (never matched by host)\n" +
  "  acme/                       # ONE folder per customer\n" +
  "    site.config.ts            # slug, name, hosts[], systemHost (light, no JSX)\n" +
  '    landing.tsx               # the bespoke "/" composition\n' +
  "    index.ts                  # default-exports the SiteModule\n" +
  "    sections/                 # site-specific sections (optional)\n" +
  "    pages/                    # extra routes: about.tsx, contact.tsx (optional)";

const NEWSITE_CONFIG =
  "const config: SiteConfig = {\n" +
  '  slug: "acme",\n' +
  '  name: "Acme Inc.",\n' +
  "  // Every hostname that should render this site (production + preview/staging):\n" +
  '  hosts: ["acme.com", "www.acme.com", "acme.staging.iguzman.com.mx"],\n' +
  "  // The System.host the backend loads this customer's data by:\n" +
  '  systemHost: "acme.com",\n' +
  "};";

// ── Seed initial content (separate Claude session) ────────────────────────────

const NEWSITE_SEED =
  "/seed-site acme.com          # run in a NEW Claude session\n" +
  "# or directly, from apps/website-api:\n" +
  "python manage.py fetch_seed_images --brief seed_assets/briefs/acme.com.json\n" +
  "python manage.py seed_site        --brief seed_assets/briefs/acme.com.json --reset";

// ── Verify locally ────────────────────────────────────────────────────────────

const NEWSITE_VERIFY =
  "pnpm check-types --filter=website\n" +
  "pnpm lint --filter=website\n" +
  "pnpm dev --filter=website    # open http://127.0.0.1:3000/\n" +
  "# Use the bottom-left dev site switcher to select the slug (__dev_site cookie).";

// ── Publish to production ─────────────────────────────────────────────────────

const NEWSITE_PUBLISH =
  "# Redeploy website-api FIRST (it ships the /api/publish-site/ endpoint).\n" +
  "pnpm publish-site acme.com           # upsert the prod System + content\n" +
  "pnpm publish-site acme.com --images  # ...and the photos, into empty fields only\n" +
  "pnpm publish-site acme.com --reset   # exact replace (also replaces images)";

const NEWSITE_DEPLOY =
  "pnpm sync-website-hosts    # ingress + API CORS pick up the new System.host\n" +
  "pnpm deploy-app website    # redeploy so the new sites/<slug>/ folder ships";

// ── Pull production content back into local (inverse of publish) ───────────────

const NEWSITE_PULL =
  "pnpm pull-site                 # list prod sites, pick one + which sections\n" +
  "pnpm pull-site acme.com        # skip the picker for this host\n" +
  "pnpm pull-site acme.com -y     # accept all site/section defaults";

// ── Component ─────────────────────────────────────────────────────────────────

export async function NewSitePanel() {
  const t = await getTranslations("HomePage");

  return (
    <>
      {/* 1 ─ The model + what you're responsible for. */}
      <GroupLabel>{t("newSiteOverviewGroup")}</GroupLabel>

      <StepSection
        heading={t("newSiteModelHeading")}
        description={t("newSiteModelDesc")}
      />
      <StepSection
        heading={t("newSitePrereqHeading")}
        description={t("newSitePrereqDesc")}
      />

      {/* 2 ─ Scaffold the folder + configure the host mapping. */}
      <GroupLabel marginTop={8}>{t("newSiteScaffoldGroup")}</GroupLabel>

      <StepSection
        heading={t("newSiteAuthorHeading")}
        description={t("newSiteAuthorDesc")}
        code={NEWSITE_SKILL}
        language="text"
      />
      <StepSection
        heading={t("newSiteCliHeading")}
        description={t("newSiteCliDesc")}
        code={NEWSITE_CLI}
      />
      <StepSection
        heading={t("newSiteTreeHeading")}
        description={t("newSiteTreeDesc")}
        code={NEWSITE_TREE}
        language="text"
      />
      <StepSection
        heading={t("newSiteConfigHeading")}
        description={t("newSiteConfigDesc")}
        code={NEWSITE_CONFIG}
        language="typescript"
      />

      {/* 3 ─ Hand-code the frontend. */}
      <GroupLabel marginTop={8}>{t("newSiteDesignGroup")}</GroupLabel>

      <StepSection
        heading={t("newSiteLandingHeading")}
        description={t("newSiteLandingDesc")}
      />
      <StepSection
        heading={t("newSitePagesHeading")}
        description={t("newSitePagesDesc")}
      />

      {/* 4 ─ Fill the backend data the landing renders (separate session). */}
      <GroupLabel marginTop={8}>{t("newSiteContentGroup")}</GroupLabel>

      <StepSection
        heading={t("newSiteSeedHeading")}
        description={t("newSiteSeedDesc")}
        code={NEWSITE_SEED}
      />

      {/* 5 ─ Type-check, lint, preview by host via the dev switcher. */}
      <GroupLabel marginTop={8}>{t("newSiteVerifyGroup")}</GroupLabel>

      <StepSection
        heading={t("newSiteVerifyHeading")}
        description={t("newSiteVerifyDesc")}
        code={NEWSITE_VERIFY}
      />

      {/* 6 ─ Push content to prod, route the domain, redeploy. */}
      <GroupLabel marginTop={8}>{t("newSiteDeployGroup")}</GroupLabel>

      <StepSection
        heading={t("newSitePublishHeading")}
        description={t("newSitePublishDesc")}
        code={NEWSITE_PUBLISH}
      />
      <StepSection
        heading={t("newSiteSyncHeading")}
        description={t("newSiteSyncDesc")}
        code={NEWSITE_DEPLOY}
      />

      {/* 7 ─ Pull prod content back down to keep local a faithful mirror. */}
      <GroupLabel marginTop={8}>{t("newSitePullGroup")}</GroupLabel>

      <StepSection
        heading={t("newSitePullHeading")}
        description={t("newSitePullDesc")}
        code={NEWSITE_PULL}
      />
    </>
  );
}

function StepSection({
  heading,
  description,
  code,
  language = "bash",
}: {
  heading: string;
  description: string;
  code?: string;
  language?: string;
}) {
  return (
    <Box flexDirection="column" gap={8} marginBottom={40}>
      <Typography as="h2" variant="h3">
        {heading}
      </Typography>
      <Typography as="p" variant="body" color="var(--foreground-muted)">
        {description}
      </Typography>
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
