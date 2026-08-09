# apps/help CLAUDE.md

`apps/help/` is the developer documentation hub for this monorepo. It has nine tabs. When anything in the inventory below changes - flags, defaults, new operations, removed features, renamed commands - update both the relevant source file **and** both locale files (`messages/en.json`, `es.json`) in the same task.

## Locales - this app is en + es only

**This app does not use `@repo/i18n/routing`.** It has its own `i18n/routing.ts` declaring `["en", "es"]` with `en` as the default, and the German, French and Portuguese catalogues were deleted: this is internal developer documentation, maintained in English, and three machine-translated catalogues nobody proofread were worse than not offering them. Anything that is not Spanish resolves to English, including a `fr`/`de`/`pt` browser hitting `/`.

Use the **local** `routing` (`@/i18n/routing`) anywhere the locale _set_ matters - `proxy.ts`, `generateStaticParams`, the `hasLocale` guard in `app/[locale]/layout.tsx`, and the footer's `LocaleSwitcher`. Importing the shared five-locale one in any of those re-opens `/de`, `/fr` and `/pt`, which now have no messages behind them and would render as raw key names.

`@repo/i18n/navigation`'s `Link`/`useRouter` stay shared and remain the right import for every internal link - they only prefix the locale being rendered, and the middleware can no longer produce anything but `en` or `es`.

## Inventory by Tab

### Getting Started - `app/[locale]/page.tsx`

| Constant               | Source                                          |
| ---------------------- | ----------------------------------------------- |
| `CLONE_COMMAND`        | Repo clone URL (hardcoded in the constant)      |
| `SETUP_SCRIPT_COMMAND` | `cli/setup-dev-env/setup-dev-env.sh`            |
| `SSH_KEY_COMMAND`      | SSH key display (manual step)                   |
| `VERIFY_COMMANDS`      | `kubectl`/`helm` CLI verification (manual step) |

### Commands - `app/[locale]/page.tsx`

| Constant                     | Source                                                                                                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEW_APP_COMMAND`            | `cli/new-nextjs-app/new-nextjs-app.sh`                                                                                                                                                         |
| `NEW_API_COMMAND`            | `cli/new-django-app/new-django-app.sh`                                                                                                                                                         |
| `NEW_TV_APP_COMMAND`         | `cli/new-smarttv-app/new-smarttv-app.sh`                                                                                                                                                       |
| `NEW_RN_APP_COMMAND`         | `cli/new-rn-app/new-rn-app.sh`                                                                                                                                                                 |
| `NEW_SITE_COMMAND`           | `cli/new-site/new-site.sh`                                                                                                                                                                     |
| `PUBLISH_SITE_COMMAND`       | `cli/website/website.sh publish` (+ `apps/website-api` `export_site` / `POST /api/publish-site/`)                                                                                              |
| `SYNC_WEBSITE_HOSTS_COMMAND` | `cli/website/website.sh sync` (rewrites ingress + CORS/CSRF/ALLOWED_HOSTS in the two `helm/values.yaml`)                                                                                       |
| `PULL_SITE_COMMAND`          | `cli/website/website.sh pull` (+ `apps/website-api` `import_site`, reuses the public read endpoints; pulls content + images into the local DB)                                                 |
| `SETUP_MINECRAFT_COMMAND`    | `cli/setup-minecraft/setup-minecraft.sh`                                                                                                                                                       |
| `GENERATE_ICONS_COMMANDS`    | `cli/generate-icons/generate-icons.sh`                                                                                                                                                         |
| `SECRETS_COMMAND`            | `cli/setup-k8s-secrets/setup-k8s-secrets.sh`                                                                                                                                                   |
| `DEPLOY_APP_COMMANDS`        | `cli/deploy-app/deploy-app.sh`                                                                                                                                                                 |
| `HELM_COMMANDS`              | `cli/helm/helm.sh`                                                                                                                                                                             |
| `DEPLOY_SERVICES_COMMANDS`   | `cli/deploy-postgres/deploy-postgres.sh`, `cli/deploy-mongodb/deploy-mongodb.sh`, `cli/deploy-mysql/deploy-mysql.sh`, `cli/deploy-redis/deploy-redis.sh`, `cli/deploy-garage/deploy-garage.sh` |
| `PIHOLE_COMMANDS`            | `cli/pihole/pihole.sh` (operations menu for `packages/charts/pihole`)                                                                                                                          |
| `UPLOAD_S3_COMMAND`          | `cli/upload-s3/upload-s3.sh`                                                                                                                                                                   |
| `DEV_SERVICES_COMMANDS`      | `cli/dev-services/dev-services.sh`                                                                                                                                                             |
| `DJANGO_SUPERUSER_COMMANDS`  | `cli/django-superuser/django-superuser.sh`                                                                                                                                                     |
| `LOGS_COMMAND`               | `cli/logs/logs.sh`                                                                                                                                                                             |
| `DEV_COMMANDS`               | `pnpm dev` (Turborepo)                                                                                                                                                                         |
| `BUILD_COMMANDS`             | `pnpm build` (Turborepo)                                                                                                                                                                       |
| `LINT_COMMANDS`              | `pnpm lint`, `pnpm check-types`, `pnpm format`                                                                                                                                                 |

### Services - `app/[locale]/scraper-panel.tsx`

Documents the `apps/scraper/` REST API. Update when endpoints, request/response shapes, or the base URL (`SCRAPER_BASE`) change.

| Endpoint        | Params documented                                                    |
| --------------- | -------------------------------------------------------------------- |
| `GET /health`   | -                                                                    |
| `POST /search`  | `query`, `engine` (duckduckgo / bing / google / brave), `maxResults` |
| `POST /extract` | `url`                                                                |

### Tools - `app/[locale]/edit-videos-panel.tsx`

| Script                                 | Sections documented                                                                                                                                                                                                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli/edit-videos/edit-videos.sh`       | Invocation, workflow, per-file selection checklist, filters (black bars, FPS, stabilization, denoise, sharpen, upscale, downsize, color correction, compress, MPG/MKV, Smart TV profile), audio/subtitle stream curation, OCR of DVD/VobSub image subtitles, AI filters (RIFE, video2x, Deep3D, TikTok) |
| `cli/docker-cleanup/docker-cleanup.sh` | Invocation, workflow, operations (dangling images, old images, all unused, stopped containers, build cache, system prune)                                                                                                                                                                               |
| `cli/play-videos/play-videos.sh`       | Invocation, interactive menu, in-playback key controls, examples, flag groups (media, playback, display, audio, advanced), fix audio/video issues                                                                                                                                                       |
| `cli/play-videos/fix-video.sh`         | DRM/KMS troubleshooting: console VT, atomic modesetting, DRM master; the AMD `radeon`→`amdgpu` + `amdgpu.dc=1` GRUB repair (documented in the `PV_FIX` constant)                                                                                                                                        |
| `cli/play-videos/fix-audio.sh`         | ALSA mixer repair (muted / 0% controls, IEC958 switch) plus `--force`, which `play-videos.sh` runs before every playback to max the hardware mixer; also the "Fix audio / video issues" menu entry                                                                                                      |
| `cli/server-audit/server-audit.sh`     | Invocation, all 12 audit checks                                                                                                                                                                                                                                                                         |
| `cli/setup-wifi/setup-wifi.sh`         | Invocation, backends (nmcli vs. netplan + wpa_supplicant) & flow (detect interface, fix card, scan/connect/verify, switch/disconnect)                                                                                                                                                                   |

### Smart TV - `app/[locale]/smarttv-panel.tsx`

End-to-end Samsung Tizen TV workflow, ordered **setup-first**: stand up the testing toolchain (IDE, certs, emulator, real TV) before scaffolding the app, then link the built bundle into Tizen Studio, build the signed `.wgt`, and test. Build/test steps lead with the **Tizen Studio GUI** (Import, Build Signed Package, Run As ▸ Tizen Web Application) and keep the `tizen` CLI as the "or, from a terminal" alternative. Screenshots are self-hosted under `public/smarttv/` (downloaded from developer.samsung.com); update them and the `IMG` map together if Samsung redesigns the tooling. Step descriptions track the official Samsung Developer docs linked per section (`DOC_*` constants).

Build/test steps also wrap the `tizen`/`sdb` CLI in two interactive helper scripts (`TV_CERT`, `TV_EMULATOR_RUN`/`TV_DEVICE_RUN` code constants): `cli/tv-cert` (`pnpm tv-cert`) and `cli/tv-deploy` (`pnpm tv-deploy`). `tv-cert` is emulator-only (physical TVs still need the GUI distributor cert/DUID); `tv-deploy` builds, signs, packages, installs and runs the app in one step (it absorbed the former `cli/tv-build`/`pnpm tv-build` helper). Both resolve `tizen`/`sdb` under `~/tizen-studio` (override with `TIZEN_HOME`) and bail if the toolchain is missing.

| Group (in order)         | Sections documented                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Tizen Studio Setup       | Install Tizen Studio, add TV Extensions + Certificate Extension, create a certificate profile (CLI: `cli/tv-cert`), VS Code alternative  |
| Prepare the Test Targets | Create/launch the TV emulator; enable Developer Mode + register the TV in Device Manager (`sdb connect`)                                 |
| Scaffold & Develop       | `cli/new-smarttv-app/new-smarttv-app.sh` (`pnpm new-tv-app`), browser preview (`pnpm dev`)                                               |
| Build & Package          | Link the built `dist/` into Tizen Studio (`File ▸ Import ▸ Tizen Project`), Build Signed Package (CLI: `cli/tv-deploy`, `tizen package`) |
| Test in Emulator         | Run As ▸ Tizen Web Application on the emulator (CLI: `cli/tv-deploy`, `tizen install`/`run` on `emulator-26101`)                         |
| Test on a Real TV        | Run As ▸ Tizen Web Application on the TV target (CLI: `cli/tv-deploy`, `tizen install`/`run`)                                            |

### Mob Forge - `app/[locale]/mob-forge-panel.tsx`

The `apps/mob-forge` pipeline, ordered **setup-first, workflow-last** and split into four groups (setup, workflow, then post-creation editing/hand-painting). Source of truth is `cli/setup-minecraft/setup-minecraft.sh`, `apps/mob-forge/CLAUDE.md`, and the PRD `apps/prds/minecraft.md` - keep this panel in sync when any of them change (tool versions, MCP endpoint, plugin URLs, the `/mob-forge` skill flow).

| Group (in order)        | Sections documented                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup - Linux & macOS   | Prerequisites, `pnpm setup-minecraft` (Java 17 + Blockbench), Blockbench plugins (GeckoLib + MCP), register MCP with Claude Code, verify the build                                                                                                                                                                                                                                                |
| Setup - Windows         | Manual install of Git, Node.js + pnpm, Java 17 (Temurin), Blockbench, Claude Code (official-installer + winget links), plugins/MCP, build via `.\gradlew.bat`                                                                                                                                                                                                                                     |
| End-to-End Workflow     | Attended pre-flight (open Blockbench, live MCP endpoint), author with `/mob-forge`, worked "flying eyeball" example (generated file tree), attended in-game spawn-egg check                                                                                                                                                                                                                       |
| Edit & Hand-Paint a Mob | Source (`blockbench/<id>.bbmodel`) vs. build outputs, open the source in Blockbench, per-part paint in the Paint tab, scripted face-painting via `apps/mob-forge/tools/mob_face.py` (needs Python 3 + Pillow), save `.bbmodel` + export texture PNG, rebuild & test                                                                                                                               |
| Author an Item          | The `/item-forge` skill for flat inventory items (gems, food, tools/weapons — not blocks/mobs), deterministic sprite generation via `apps/mob-forge/tools/item_sprite.py` (Python 3 + Pillow, no Blockbench), generated file tree (`ModItems`/`ModCreativeTabs`, `textures/item/`, `models/item/`, `blockbench/items/<id>.bbmodel`), attended in-game check in the "Mob Forge Items" creative tab |

Windows has no bootstrap step because the NeoForge MDK Gradle scaffold (incl. `gradlew.bat` and the GeckoLib injection) is committed to `apps/mob-forge`. The `build`/`dev`/`clean` pnpm scripts run through `apps/mob-forge/tools/gradlew.mjs` (a cross-platform Node launcher), so `pnpm --filter=mob-forge build` works on Windows too — the Windows build step shows it alongside the direct `.\gradlew.bat` call. The scripted face-painter (`tools/mob_face.py`) additionally needs Python 3 + Pillow; `setup-minecraft.sh` (Bash-only) installs neither, so the panel documents the per-OS install. All external download/doc URLs live in the `DOC_*` constants at the top of the panel.

### New Site - `app/[locale]/new-site-panel.tsx`

The end-to-end workflow for building a bespoke per-customer site in `apps/website`, ordered as a pipeline: overview → scaffold/configure → design the frontend → seed content → verify locally → publish to production. Source of truth is the `/new-site` skill (`.claude/skills/new-site/SKILL.md`), `cli/new-site/new-site.sh`, and `apps/website/sites/CLAUDE.md`, with the seed/publish steps drawn from the `/seed-site` skill and `cli/website/website.sh` (the `publish` and `sync` subcommands) - keep this panel in sync when any of them change (the skill flow, the `new-site` CLI args, the `SiteConfig`/`registry.ts` contract, the `publish-site`/`sync-website-hosts`/`pull-site`/`seed_site` commands, or the dev site-switcher mechanism).

| Group (in order)      | Sections documented                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview              | The one-app-many-sites model (host-resolved `sites/<slug>/`, `_default` fallback, we-code-the-frontend / customer-self-edits-content), frontend-only preconditions                                      |
| Scaffold & Configure  | Author with the `/new-site` skill, the `pnpm new-site <domain> [slug]` CLI, the generated file tree (`site.config.ts`/`landing.tsx`/`index.ts` + `registry.ts` entry), configuring `hosts`/`systemHost` |
| Design the Frontend   | Rework `landing.tsx` from the block library (props-first, tenant colors), optional extra `pages/` + the Server-Component navbar caveat (`--ui-navbar-height` padding vars)                              |
| Seed Initial Content  | `/seed-site` in a separate Claude session → strategy interview → `seed_site` command (System copy + stories/highlights/catalog, placeholder assets)                                                     |
| Verify Locally        | `check-types` + `lint --filter=website`, then `pnpm dev` + the dev-only site switcher (`__dev_site` cookie) so `127.0.0.1` resolves to the slug                                                         |
| Publish to Production | Redeploy `website-api` first, `pnpm publish-site <host>` (upsert content, images skipped), `pnpm sync-website-hosts` (ingress + CORS), redeploy `website`                                               |
| Pull Content Back     | `pnpm pull-site [host]` (`cli/website/website.sh pull` + `import_site`) — inverse of publish: pulls prod content + images DOWN into the local DB, resetting each selected section                       |

The panel has no external `DOC_*` links (the whole workflow is in-repo) and no per-OS split (it is a Claude Code + pnpm workflow). It reuses the same local `StepSection`/`GroupLabel` helpers as the Smart TV and Mob Forge panels.

### Hardware - `app/[locale]/hardware-panel.tsx` + `app/[locale]/hardware/[project]/`

> **The rule: every hardware project is documented here.** Schematics, wiring
> tables, toolchain and flashing instructions, pin maps, tuning knobs and
> troubleshooting for anything in `hardware/` **must** live in this app's
> Hardware section, with **its own menu item on the tab's grid and its own
> detail page** at `/hardware/<project-name>`. A project folder in `hardware/`
> holds firmware (`src/`) and nothing else - no `README.md`, no
> `schematic.html`. See `hardware/README.md` for why that reversed.

The tab is a `Grid` of icon + text cards - the same data-driven shape as
`apps/website`'s `ADMIN_NAV_ITEMS`, because the list is expected to grow.

**There is deliberately no database and no API.** The registry is
`lib/hardware-projects.json`, edited in the same commit as the project it
describes. It carries only listing metadata plus the detail page's spec chips;
the body of a build sheet is authored JSX, because prose, SVG figures and value
tables are documents, not rows.

| Piece                                                  | Holds                                                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `lib/hardware-projects.json`                           | The registry: `slug`, `icon`, `nameKey`, `descKey`, `board`, `language`, `revision`, `sourcePath`, `specs[]`       |
| `lib/hardware-projects.ts`                             | Types + `getHardwareProject(slug)`                                                                                 |
| `app/[locale]/hardware-panel.tsx`                      | The tab: a `Grid` of project cards                                                                                 |
| `app/[locale]/hardware/[project]/page.tsx`             | The detail route: title block, spec grid, and the `PROJECT_DOCS` slug → component map                              |
| `app/[locale]/hardware/[project]/<slug>.tsx`           | One project's build sheet                                                                                          |
| `app/[locale]/hardware/[project]/<slug>-figures.tsx`   | That project's **schematic** figures - hand-placed SVG symbols                                                     |
| `app/[locale]/hardware/[project]/<slug>-pictorial.tsx` | That project's **breadboard** figures, built from `@repo/ui/hardware`                                              |
| `app/[locale]/hardware/[project]/doc-primitives.tsx`   | `P`, `DocSection`, `DocH3`, `DocNote`, `DocFigure`, `DocTable` - shared by every build sheet                       |
| `app/[locale]/hardware/[project]/doc-dual-figure.tsx`  | `DocDualFigure` - a figure carrying both views and the switch between them. **The only client component here.**    |
| `app/[locale]/hardware/[project]/hardware-doc.css`     | The build-sheet token set (mono display face, semantic SVG stroke classes), theme-flipped on `[data-theme="dark"]` |

**To add a project:**

1. Add an entry to `lib/hardware-projects.json`.
2. Write `<slug>.tsx`, beside `page.tsx`, from the primitives in `doc-primitives.tsx`.
3. Put its drawings in `<slug>-figures.tsx` (schematics) and `<slug>-pictorial.tsx` (breadboard views), and pair them up with `DocDualFigure`.
4. Register it in `PROJECT_DOCS` in `app/[locale]/hardware/[project]/page.tsx` - a JSON entry with no component (or the reverse) 404s on purpose.
5. Add the `nameKey` / `descKey` strings to `messages/en.json` **and** `es.json`.

**i18n scope is narrower here than on the other tabs, deliberately.** The
navigation chrome (tab label, tab title/subtitle, each project's name and
one-line description) is translated; the build sheet body is authored English
prose. Electronics documentation is written once, by the person holding the
board, and machine-translating several thousand words of it into locales nobody
proofreads would make it less trustworthy, not more accessible. Keep new
projects to the same split.

**Every wiring figure carries two drawings, and a switch between them.**

A schematic and a breadboard view are not draft and final - they answer
different questions, and which one is useful depends entirely on who is
reading. A schematic states the topology and nothing else: it is the faster
read once you can read one, and the only view that survives being redrawn on
paper. A breadboard view states the **build** - which hole the leg goes in,
which way round the banded end faces, what the part looks like in your hand.
Someone who has never wired a transistor cannot get that from a symbol, and
someone who has does not want to count holes.

So a wiring figure uses `DocDualFigure` rather than `DocFigure`, passing both,
and the reader flips between them:

```tsx
<DocDualFigure
  captionLabel="Fig 1"
  caption="…the schematic's caption…"
  pictorialCaption="…what the breadboard view is showing…"
  schematic={<PowerPathFigure />}
  pictorial={<PowerPathPictorial />}
/>
```

- **The switch is per figure, not per page**, because the choice is per
  _question_ rather than per reader: the power path is worth seeing as a
  breadboard even if you read schematics fluently (it is where the diode's
  polarity bites), while two driver stages are far quicker to check as symbols.
  One sticky setting would force a single answer onto three different questions.
- **It opens on the schematic.** `defaultPictorial` flips a figure, but the
  default stays the drawing the document has always shown - a build sheet that
  silently redrew itself is a worse surprise than one extra click.
- **Keep `"use client"` in `doc-dual-figure.tsx` and nowhere else.** Every part
  in `@repo/ui/hardware` is static SVG with CSS animations and renders on the
  server; only the switch needs state. Don't push the boundary up into
  `doc-primitives`, which the whole document is built from.
- **`DocFigure` is still right for a single-view figure** - a reference drawing
  with no second reading, like the Pico pinout card in the reference tail.
- The breadboard figures are positioned by **hole**, not pixel, and
  `packages/ui/CLAUDE.md` → "Hardware drawings" carries the part inventory and
  the three physical rules the geometry enforces. Read it before drawing a new
  one; the layouts look arbitrary until you know that a column is a node and
  that the Pico's body covers four rows.

**Three conventions inside a build sheet.**

- **Write it as a tutorial**, in the order the work happens: what you're
  building, the parts to buy, the software to install, the numbered build
  steps, then a reference tail (pin map, component values, tuning,
  troubleshooting). Engineering rationale belongs in a `DocNote` attached to the
  step it affects, not in a section of its own - `pumpkin-house.tsx` was
  originally ~60 % standalone argument and read as a paper rather than
  something you could follow at the bench.
- **Only one numbered sequence per document**, because the prose
  cross-references itself by number. `DocSection`'s `num` is optional: the build
  steps carry `01`-`NN` and everything around them is titled but unnumbered, so
  a bare "step 03" is unambiguous.
- **Headings and prose go through `<Typography variant="none">`**, the
  documented escape hatch for when a CSS class must fully own typography; the
  semantic wrappers (`section`, `figure`, `table`) are raw elements, since `Box`
  renders only a `div` or an anchor.

Prose in `hardware-doc.css` is deliberately **not** capped to a reading measure

- the tables and figures are full-bleed, and a narrow text column beside them
  left the page looking half-empty. The page's `Container size="lg"` bounds the
  line length.

## Adding a New Tool or Section

1. Add the command/flag constant(s) to the appropriate panel file.
2. Add a `<EvSection>` (tools tab) or `<Section>` (commands tab) referencing those constants.
3. Add translation keys to both locale files under `messages/` (`en.json`, `es.json`).
4. Add a row to the inventory table above.

## i18n

All heading and description text must be translation keys - never hardcode user-visible strings in JSX. Server components use `getTranslations('HomePage')`; client components use `useTranslations('HomePage')`.
