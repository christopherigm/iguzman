#!/usr/bin/env bash
# new-site.sh - scaffold a bespoke per-customer site in apps/website.
#
# Creates apps/website/sites/<slug>/ (site.config.ts, landing.tsx, index.ts)
# mirroring sites/_default, and registers it in sites/registry.ts by inserting
# an eager config import and a lazy-loaded SITES entry above the CLI markers
# (keeping _default last). One customer = one folder = one (or more) domain(s),
# resolved by request host at runtime. See apps/website/sites/CLAUDE.md.
#
# Usage:
#   pnpm new-site <domain> [slug]
#   pnpm new-site acme.com
#   pnpm new-site la-cocina.mx la-cocina

set -euo pipefail

RESET='\033[0m'; BOLD='\033[1m'; DIM='\033[2m'
GREEN='\033[32m'; RED='\033[31m'; CYAN='\033[36m'; YELLOW='\033[33m'
info()  { printf "${CYAN}%s${RESET}\n" "$*"; }
ok()    { printf "${GREEN}%s${RESET}\n" "$*"; }
warn()  { printf "${YELLOW}%s${RESET}\n" "$*"; }
err()   { printf "${RED}%s${RESET}\n" "$*" >&2; }

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
sites_dir="${repo_root}/apps/website/sites"
registry="${sites_dir}/registry.ts"

# ── Resolve domain + slug ─────────────────────────────────────────────────────

domain="${1:-}"
if [[ -z "${domain}" ]]; then
  read -r -p "$(printf "${BOLD}Primary domain${RESET} (e.g. acme.com): ")" domain
fi
domain="$(printf '%s' "${domain}" | tr '[:upper:]' '[:lower:]' | sed -E 's#^https?://##; s#/.*$##; s/^www\.//')"
if [[ -z "${domain}" ]]; then err "A domain is required."; exit 1; fi

# Default slug = first label of the domain, kebab-cased.
default_slug="$(printf '%s' "${domain%%.*}" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"
slug="${2:-${default_slug}}"
slug="$(printf '%s' "${slug}" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"
if [[ -z "${slug}" ]]; then err "Could not derive a valid slug from '${domain}'."; exit 1; fi
if [[ "${slug}" == "default" || "${slug}" == _* ]]; then
  err "Slug '${slug}' is reserved. Pass an explicit slug: pnpm new-site ${domain} <slug>"
  exit 1
fi

site_dir="${sites_dir}/${slug}"
if [[ -e "${site_dir}" ]]; then err "sites/${slug}/ already exists. Choose another slug."; exit 1; fi
if [[ ! -f "${registry}" ]]; then err "registry.ts not found at ${registry}."; exit 1; fi
if grep -q "load: () => import(\"./${slug}\")" "${registry}"; then
  err "A registry entry for './${slug}' already exists."; exit 1
fi

# A readable default name from the slug (title-cased words).
name="$(printf '%s' "${slug}" | sed -E 's/-/ /g' | awk '{for(i=1;i<=NF;i++){$i=toupper(substr($i,1,1)) substr($i,2)}}1')"

info "\n  Scaffolding site '${slug}' for ${domain}\n"

# ── Create the site folder ────────────────────────────────────────────────────

mkdir -p "${site_dir}"

cat > "${site_dir}/site.config.ts" <<EOF
import type { SiteConfig } from "../types";

// Every hostname that should render this site (production + preview/staging).
// \`systemHost\` is the System.host the backend uses to load this customer's data.
const config: SiteConfig = {
  slug: "${slug}",
  name: "${name}",
  hosts: ["${domain}"],
  systemHost: "${domain}",
};

export default config;
EOF

cat > "${site_dir}/landing.tsx" <<EOF
import { Box } from "@repo/ui/core-elements/box";
import { Container } from "@repo/ui/core-elements/container";
import { getSystem } from "@/lib/system";
import { Hero } from "@/components/hero";
import { SuccessStories } from "@/components/success-stories";
import { CompanyHighlights } from "@/components/company-highlights";
import { CatalogCategories } from "@/components/catalog-categories";
import { CatalogItems } from "@/components/catalog-items";

// Bespoke landing for ${name} (${domain}). Starts from the default composition -
// rework the section order, hero, and design into something unique for this
// customer. Compose the block library (@/components/*) + cached lib/ helpers,
// props-first on every @repo/ui component. See apps/website/sites/CLAUDE.md.
export async function Landing() {
  const system = await getSystem();

  const highlightsBg =
    system?.highlights_bg ??
    \`linear-gradient(135deg, \${system?.primary_color ?? "#2196f3"}1a 0%, \${system?.secondary_color ?? "#e040fb"}0d 100%)\`;

  return (
    <>
      <Hero system={system} />
      <Container paddingX={10}>
        <SuccessStories />
      </Container>
      <Box styles={{ width: "100%", background: highlightsBg }}>
        <Container paddingX={10}>
          <CompanyHighlights />
        </Container>
      </Box>
      <Container paddingX={10}>
        <CatalogCategories />
      </Container>
      <Container paddingX={10}>
        <CatalogItems />
      </Container>
    </>
  );
}
EOF

cat > "${site_dir}/index.ts" <<EOF
import type { SiteModule } from "../types";
import config from "./site.config";
import { Landing } from "./landing";

const site: SiteModule = {
  config,
  Landing,
  // pages: { "/about": About },  // optional extra top-level routes
  // NOTE: Landing + any pages/ are Server Components — never import from
  // @repo/ui/core-elements/navbar (NavbarSpacer/PageBottomSpacer). To clear the
  // fixed navbar / add bottom spacing, use props-first padding with the shared
  // CSS vars: paddingTop="var(--ui-navbar-height, 57px)" /
  // paddingBottom="var(--ui-page-bottom-spacing, 64px)". See sites/CLAUDE.md.
};

export default site;
EOF

ok "  created sites/${slug}/{site.config.ts,landing.tsx,index.ts}"

# ── Register in registry.ts (insert above the CLI markers) ────────────────────

import_line="import ${slug//-/_}Config from \"./${slug}/site.config\";"
entry_line="  { config: ${slug//-/_}Config, load: () => import(\"./${slug}\") },"

tmp="$(mktemp)"
awk -v imp="${import_line}" -v ent="${entry_line}" '
  /<new-site:import>/ { print imp }
  /<new-site:entry>/  { print ent }
  { print }
' "${registry}" > "${tmp}" && mv "${tmp}" "${registry}"

ok "  registered './${slug}' in sites/registry.ts (above _default)"

# ── Next steps ────────────────────────────────────────────────────────────────

printf "\n${BOLD}Next steps${RESET}\n"
printf "  ${DIM}1.${RESET} Design ${CYAN}sites/${slug}/landing.tsx${RESET} (unique composition, props-first).\n"
printf "  ${DIM}2.${RESET} Add preview hosts to ${CYAN}sites/${slug}/site.config.ts${RESET} \`hosts\` if needed.\n"
printf "  ${DIM}3.${RESET} ${BOLD}Populate the landing's content${RESET} — the page is blank until the\n"
printf "        backend has data. In a ${BOLD}new Claude session${RESET} run ${CYAN}/seed-site ${domain}${RESET}: a\n"
printf "        strategy interview that seeds the System + stories/highlights/catalog\n"
printf "        (placeholder images/links from ${CYAN}apps/website-api/seed_assets/${RESET}). Or directly:\n"
printf "        ${CYAN}cd apps/website-api && python manage.py seed_site --brief seed_assets/briefs/${domain}.json --reset${RESET}\n"
printf "  ${DIM}4.${RESET} ${CYAN}pnpm check-types --filter=website${RESET} && ${CYAN}pnpm lint --filter=website${RESET}\n"
printf "  ${DIM}5.${RESET} ${BOLD}Publish content to production${RESET} once tested: redeploy website-api, then\n"
printf "        ${CYAN}pnpm publish-site ${domain}${RESET} (creates the prod System + content; images\n"
printf "        skipped), then ${CYAN}pnpm sync-website-hosts${RESET} so the domain routes in ingress + CORS.\n"
printf "  ${DIM}·${RESET} Recipe: ${CYAN}apps/website/sites/CLAUDE.md${RESET}  ·  or run ${CYAN}/new-site ${domain}${RESET} in Claude Code.\n\n"
ok "Done."
