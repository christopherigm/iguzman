# Project Memory: iguzman monorepo

## Architecture
- Turborepo monorepo: `apps/video-downloader` (most active), `packages/ui`, `packages/helpers`
- New app pair: `apps/edge-folio` (Next.js) + `apps/edge-folio-api` (Django) — see [[project-edge-folio]]
- All apps use Next.js standalone output, next-intl i18n, PWA enabled
- `@repo/ui` exports: `use-ffmpeg` and core-elements via `./src/*.tsx`

## video-downloader Components
- `PinnedVideoItem` — active downloads, embeds `useFFmpeg` directly, handles all processing
- `ReadOnlyVideoItem` — completed videos, embeds `useFFmpeg` for video reprocessing
- `VideoExtraActions` — extra actions panel (FPS, H264 convert, black bars)
- `video-item-shared.tsx` — shared sub-components (VideoActions, VideoExtraActions, VideoDetailsPanel, etc.)
- `video-grid.tsx` — renders pinned + completed lists, passes `onUpdate`/`onReprocess`/`onRemove` props

## FFmpeg Worker (packages/ui/src/ffmpeg-worker.ts)
Operations: `load`, `interpolateFps`, `convertToH264`, `removeBlackBars`, `burnSubtitles`
- All ops receive `{ videoData: Uint8Array, ...extraPayload }` via `sendVideoOp`
- Progress reported via frame-count log parsing (progress events unreliable for some filters)

## Whisper / Subtitle Feature
- Removed 2026-02-27 (was not working)
- `use-whisper.ts`, `whisper-worker.ts`, `subtitle-config-modal.tsx/.css` deleted
- `@huggingface/transformers` removed from `packages/ui/package.json`
- `pendingSubtitleConfig` removed from `StoredVideo` type
- `burnSubtitles`/`extractAudio` still in `use-ffmpeg.ts`/`ffmpeg-worker.ts` (unused, kept for reference)

## ws-broker / server-video-editor Agent
- [WS broker architecture](project_ws_broker.md) — routing FFmpeg jobs from video-downloader UI to server-video-editor deb

## EdgeFolio
- [EdgeFolio project context](project_edge_folio.md) — purpose, stack, API proxy pattern, planned Django apps

## Feedback
- [Use existing public assets](feedback_use_existing_assets.md) — reference files from `public/icons/` via Image src, never hardcode SVG paths inline
- [Props over CSS for @repo/ui components](feedback_props_over_css.md) — always use UIComponentProps on Box/Typography/etc; CSS classes must only contain pseudo-selectors, transitions, media queries

## Key Patterns
- Processing flow in components: `runProcessing()` in PinnedVideoItem (generic), custom handlers for ReadOnlyVideoItem
- Upload: `uploadProcessedVideo(file, blob, taskUpdate, setUploading)` from `video-item-shared.tsx`
- Translation files: `apps/video-downloader/messages/{en,es,de,fr,pt}.json`
- ESLint and i18n type-check have pre-existing failures (AJV config error, TS2742) unrelated to app code
