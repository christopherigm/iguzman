# apps/help CLAUDE.md

`apps/help/` is the developer documentation hub for this monorepo. It has four tabs. When anything in the inventory below changes - flags, defaults, new operations, removed features, renamed commands - update both the relevant source file **and** all five locale files (`messages/en.json`, `es.json`, `de.json`, `fr.json`, `pt.json`) in the same task.

## Inventory by Tab

### Getting Started - `app/[locale]/page.tsx`

| Constant               | Source                                          |
| ---------------------- | ----------------------------------------------- |
| `CLONE_COMMAND`        | Repo clone URL (hardcoded in the constant)      |
| `SETUP_SCRIPT_COMMAND` | `cli/setup-dev-env/setup-dev-env.sh`            |
| `SSH_KEY_COMMAND`      | SSH key display (manual step)                   |
| `VERIFY_COMMANDS`      | `kubectl`/`helm` CLI verification (manual step) |

### Commands - `app/[locale]/page.tsx`

| Constant                    | Source                                                                                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEW_APP_COMMAND`           | `cli/new-nextjs-app/new-nextjs-app.sh`                                                                                                                   |
| `NEW_API_COMMAND`           | `cli/new-django-app/new-django-app.sh`                                                                                                                   |
| `GENERATE_ICONS_COMMANDS`   | `cli/generate-icons/generate-icons.sh`                                                                                                                   |
| `SECRETS_COMMAND`           | `cli/setup-k8s-secrets/setup-k8s-secrets.sh`                                                                                                             |
| `DEPLOY_APP_COMMANDS`       | `cli/deploy-app/deploy-app.sh`                                                                                                                           |
| `HELM_COMMANDS`             | `cli/helm/helm.sh`                                                                                                                                       |
| `DEPLOY_SERVICES_COMMANDS`  | `cli/deploy-postgres/deploy-postgres.sh`, `cli/deploy-mongodb/deploy-mongodb.sh`, `cli/deploy-mysql/deploy-mysql.sh`, `cli/deploy-redis/deploy-redis.sh` |
| `DEV_SERVICES_COMMANDS`     | `cli/dev-services/dev-services.sh`                                                                                                                       |
| `DJANGO_SUPERUSER_COMMANDS` | `cli/django-superuser/django-superuser.sh`                                                                                                               |
| `LOGS_COMMAND`              | `cli/logs/logs.sh`                                                                                                                                       |
| `DEV_COMMANDS`              | `pnpm dev` (Turborepo)                                                                                                                                   |
| `BUILD_COMMANDS`            | `pnpm build` (Turborepo)                                                                                                                                 |
| `LINT_COMMANDS`             | `pnpm lint`, `pnpm check-types`, `pnpm format`                                                                                                           |

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
| `cli/edit-videos/edit-videos.sh`       | Invocation, workflow, filters (black bars, FPS, stabilization, denoise, sharpen, upscale, downsize, color correction, compress, MPG/MKV), AI filters (RIFE, video2x, Deep3D, TikTok) |
| `cli/docker-cleanup/docker-cleanup.sh` | Invocation, workflow, operations (dangling images, old images, all unused, stopped containers, build cache, system prune)                                                            |
| `cli/play-videos/play-videos.sh`       | Invocation, examples, flag groups (media, playback, display, audio, advanced)                                                                                                        |
| `cli/server-audit/server-audit.sh`     | Invocation, all 12 audit checks                                                                                                                                                      |

## Adding a New Tool or Section

1. Add the command/flag constant(s) to the appropriate panel file.
2. Add a `<EvSection>` (tools tab) or `<Section>` (commands tab) referencing those constants.
3. Add translation keys to all five locale files under `messages/`.
4. Add a row to the inventory table above.

## i18n

All heading and description text must be translation keys - never hardcode user-visible strings in JSX. Server components use `getTranslations('HomePage')`; client components use `useTranslations('HomePage')`.
