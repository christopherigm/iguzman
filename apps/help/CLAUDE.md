# apps/help CLAUDE.md

`apps/help/` is the developer documentation hub for this monorepo. It has seven tabs. When anything in the inventory below changes - flags, defaults, new operations, removed features, renamed commands - update both the relevant source file **and** all five locale files (`messages/en.json`, `es.json`, `de.json`, `fr.json`, `pt.json`) in the same task.

## Inventory by Tab

### Getting Started - `app/[locale]/page.tsx`

| Constant               | Source                                          |
| ---------------------- | ----------------------------------------------- |
| `CLONE_COMMAND`        | Repo clone URL (hardcoded in the constant)      |
| `SETUP_SCRIPT_COMMAND` | `cli/setup-dev-env/setup-dev-env.sh`            |
| `SSH_KEY_COMMAND`      | SSH key display (manual step)                   |
| `VERIFY_COMMANDS`      | `kubectl`/`helm` CLI verification (manual step) |

### Commands - `app/[locale]/page.tsx`

| Constant                    | Source                                                                                                                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEW_APP_COMMAND`           | `cli/new-nextjs-app/new-nextjs-app.sh`                                                                                                                                                         |
| `NEW_API_COMMAND`           | `cli/new-django-app/new-django-app.sh`                                                                                                                                                         |
| `NEW_TV_APP_COMMAND`        | `cli/new-smarttv-app/new-smarttv-app.sh`                                                                                                                                                       |
| `NEW_RN_APP_COMMAND`        | `cli/new-rn-app/new-rn-app.sh`                                                                                                                                                                 |
| `NEW_SITE_COMMAND`          | `cli/new-site/new-site.sh`                                                                                                                                                                     |
| `SETUP_MINECRAFT_COMMAND`   | `cli/setup-minecraft/setup-minecraft.sh`                                                                                                                                                       |
| `GENERATE_ICONS_COMMANDS`   | `cli/generate-icons/generate-icons.sh`                                                                                                                                                         |
| `SECRETS_COMMAND`           | `cli/setup-k8s-secrets/setup-k8s-secrets.sh`                                                                                                                                                   |
| `DEPLOY_APP_COMMANDS`       | `cli/deploy-app/deploy-app.sh`                                                                                                                                                                 |
| `HELM_COMMANDS`             | `cli/helm/helm.sh`                                                                                                                                                                             |
| `DEPLOY_SERVICES_COMMANDS`  | `cli/deploy-postgres/deploy-postgres.sh`, `cli/deploy-mongodb/deploy-mongodb.sh`, `cli/deploy-mysql/deploy-mysql.sh`, `cli/deploy-redis/deploy-redis.sh`, `cli/deploy-garage/deploy-garage.sh` |
| `UPLOAD_S3_COMMAND`         | `cli/upload-s3/upload-s3.sh`                                                                                                                                                                   |
| `DEV_SERVICES_COMMANDS`     | `cli/dev-services/dev-services.sh`                                                                                                                                                             |
| `DJANGO_SUPERUSER_COMMANDS` | `cli/django-superuser/django-superuser.sh`                                                                                                                                                     |
| `LOGS_COMMAND`              | `cli/logs/logs.sh`                                                                                                                                                                             |
| `DEV_COMMANDS`              | `pnpm dev` (Turborepo)                                                                                                                                                                         |
| `BUILD_COMMANDS`            | `pnpm build` (Turborepo)                                                                                                                                                                       |
| `LINT_COMMANDS`             | `pnpm lint`, `pnpm check-types`, `pnpm format`                                                                                                                                                 |

### Services - `app/[locale]/scraper-panel.tsx`

Documents the `apps/scraper/` REST API. Update when endpoints, request/response shapes, or the base URL (`SCRAPER_BASE`) change.

| Endpoint        | Params documented                                                    |
| --------------- | -------------------------------------------------------------------- |
| `GET /health`   | -                                                                    |
| `POST /search`  | `query`, `engine` (duckduckgo / bing / google / brave), `maxResults` |
| `POST /extract` | `url`                                                                |

### Tools - `app/[locale]/edit-videos-panel.tsx`

| Script                                 | Sections documented                                                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cli/edit-videos/edit-videos.sh`       | Invocation, workflow, per-file selection checklist, filters (black bars, FPS, stabilization, denoise, sharpen, upscale, downsize, color correction, compress, MPG/MKV, Smart TV profile), audio/subtitle stream curation, OCR of DVD/VobSub image subtitles, AI filters (RIFE, video2x, Deep3D, TikTok) |
| `cli/docker-cleanup/docker-cleanup.sh` | Invocation, workflow, operations (dangling images, old images, all unused, stopped containers, build cache, system prune)                                                            |
| `cli/play-videos/play-videos.sh`       | Invocation, interactive menu, in-playback key controls, examples, flag groups (media, playback, display, audio, advanced), fix audio/video issues                                     |
| `cli/play-videos/fix-video.sh`         | DRM/KMS troubleshooting: console VT, atomic modesetting, DRM master; the AMD `radeon`→`amdgpu` + `amdgpu.dc=1` GRUB repair (documented in the `PV_FIX` constant)                     |
| `cli/play-videos/fix-audio.sh`         | ALSA mixer repair (muted / 0% controls, IEC958 switch) plus `--force`, which `play-videos.sh` runs before every playback to max the hardware mixer; also the "Fix audio / video issues" menu entry |
| `cli/server-audit/server-audit.sh`     | Invocation, all 12 audit checks                                                                                                                                                      |
| `cli/setup-wifi/setup-wifi.sh`         | Invocation, backends (nmcli vs. netplan + wpa_supplicant) & flow (detect interface, fix card, scan/connect/verify, switch/disconnect)                                                |

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

## Adding a New Tool or Section

1. Add the command/flag constant(s) to the appropriate panel file.
2. Add a `<EvSection>` (tools tab) or `<Section>` (commands tab) referencing those constants.
3. Add translation keys to all five locale files under `messages/`.
4. Add a row to the inventory table above.

## i18n

All heading and description text must be translation keys - never hardcode user-visible strings in JSX. Server components use `getTranslations('HomePage')`; client components use `useTranslations('HomePage')`.
