# User Personas - Media 2 Go

User personas for **Media 2 Go**, the offline-first PWA video downloader. These describe who the
app is actually built for today, grounded in the shipped feature set: multi-platform downloads
(yt-dlp / gallery-dl), on-device OPFS storage, client-side FFmpeg processing, caption burn-in and
translation, comment scraping, and a credits-based monetization layer.

The three personas are ordered by how central they are to the current product. **Maya** is the
primary persona the core flows are optimized for; **Diego** and **Priya** are important secondary
personas whose needs the advanced and paid features serve.

---

## 1. Maya - The Offline Saver (Primary)

> _"I just want to keep the videos I like so I can watch them on the train with no signal."_

|                              |                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------- |
| **Age / role**               | 24, retail associate, commutes daily on transit with patchy coverage         |
| **Tech comfort**             | Medium. Lives on her phone; installs PWAs without thinking of them as "apps" |
| **Devices**                  | Android phone (primary), shared laptop occasionally                          |
| **Platforms she pulls from** | TikTok, Instagram, YouTube Shorts, Pinterest                                 |

### Goals

- Save videos for **offline playback** during commutes and dead zones.
- One-tap simplicity: paste a URL, hit download, done.
- Keep a personal gallery she can scroll back through later.

### How the app serves her

- **Paste-and-go download form** with autosave to gallery - the fastest possible path.
- **OPFS device storage** so videos play back from `blob:` URLs with no network.
- **Installable PWA** with a home-screen icon and offline gallery (`InfinitePage`).
- **"Just audio"** toggle when she only wants the sound (e.g. a song from a clip).

### Frustrations / watch-outs

- Confused by device-storage limits; needs the **storage usage meter** and **clear-storage**
  flow to stay legible.
- Doesn't read warnings - error states must be self-explanatory and recoverable.
- Will close the tab mid-download; **resume-on-next-visit** is essential, not a nice-to-have.

### Success metric

She reopens the app offline and her saved videos just play.

---

## 2. Diego - The Creator / Power Editor (Secondary)

> _"If I'm going to repost this, it needs to look smooth, be the right codec, and have no black bars."_

|                             |                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------- |
| **Age / role**              | 31, part-time content creator and video editor                                     |
| **Tech comfort**            | High. Knows what FPS, H.264, and aspect ratios mean                                |
| **Devices**                 | Desktop (primary), powerful enough for client-side FFmpeg; sometimes offloads jobs |
| **Platforms he pulls from** | YouTube, X, TikTok, Tidal (audio)                                                  |

### Goals

- Grab source clips and **process them into reusable assets**, not just save them.
- Control output quality: resolution, frame rate, codec, framing.
- Keep a working library he can **re-process** later without re-downloading.

### How the app serves him

- **Client-side FFmpeg (WASM)**: black-bar removal, **FPS interpolation (60/90/120)**,
  **H.264 / H.265 conversion** - all on-device, no upload.
- **Server offloading** to a connected `server-video-editor` agent over WebSockets for heavy
  jobs his browser shouldn't grind through (`WsClientPanel` "This Device vs. server" selector).
- **Re-processing of completed videos** (`ReadOnlyVideoItem`) so his gallery is a working set.
- **Video specs / metadata check** before committing to a download (max resolution, formats).

### Frustrations / watch-outs

- Long client-side jobs feel risky - he needs **clear progress** and the guarantee that
  processing **resumes** if the page reloads.
- Cares about codec/quality fidelity; silent re-encodes or quality loss erode trust.
- Wants to know **where the job is running** (device vs. server) and how long it'll take.

### Success metric

He turns a raw download into a smooth, correctly-encoded, properly-framed clip in one session.

---

## 3. Priya - The Localizer / Researcher (Secondary, paid)

> _"I need the captions in my language and the comments saved - that's the whole reason I'm here."_

|                              |                                                                          |
| ---------------------------- | ------------------------------------------------------------------------ |
| **Age / role**               | 38, community manager / educator working across languages                |
| **Tech comfort**             | Medium-high. Comfortable with subtitles, translation, and exporting data |
| **Devices**                  | Laptop (primary)                                                         |
| **Platforms she pulls from** | YouTube, TikTok, Instagram, Facebook                                     |

### Goals

- Get videos **with captions** - fetched, styled, and optionally **burned in**.
- **Translate subtitles** into her target language while preserving timing.
- **Capture post comments** for research, moderation, or archival.

### How the app serves her

- **Caption fetch + burn-in** with custom styling (font, color, alignment, border, animation)
  via `BurnCaptionsModal`.
- **Subtitle translation** through the Groq LLM proxy, preserving SRT format.
- **Comment scraping** (yt-dlp primary, ScrapeCreators fallback for TikTok/IG/Facebook),
  browsable inline (`VideoComments`) and saved as JSON, optionally to OPFS.
- **Credits + coupon system** - she's the persona most likely to spend, since comments and
  premium processing draw down credits she tops up via Stripe.
- **Multi-locale UI** (en, es, de, fr, pt) that matches the languages she works in.

### Frustrations / watch-outs

- Needs captions/comments to **gracefully degrade** when a platform doesn't expose them
  ("not available for this video") rather than failing opaquely.
- Credit consumption must be **transparent** - she needs to know what a comment fetch costs
  before committing.
- Translation must keep timing intact; a desynced SRT is worse than none.

### Success metric

She exports a video with accurate, well-styled translated subtitles plus a clean comments archive.

---

## Persona summary

|                      | Maya - Offline Saver        | Diego - Power Editor                    | Priya - Localizer                                   |
| -------------------- | --------------------------- | --------------------------------------- | --------------------------------------------------- |
| **Core need**        | Save & watch offline        | Process into quality assets             | Captions, translation, comments                     |
| **Key features**     | OPFS storage, PWA, autosave | FFmpeg (FPS/codec/bars), server offload | Caption burn-in, Groq translation, comment scraping |
| **Tech comfort**     | Medium                      | High                                    | Medium-high                                         |
| **Monetization fit** | Low (free core flow)        | Medium (heavy processing)               | High (credits for comments/premium)                 |
| **Primary device**   | Phone                       | Desktop                                 | Laptop                                              |

### Design implications

- **Keep the core download flow brutally simple** for Maya - advanced options stay collapsed
  behind a toggle and never block the happy path.
- **Make long-running work trustworthy** for Diego - visible progress, resume-on-reload, and a
  clear device-vs-server choice.
- **Make cost and availability transparent** for Priya - credit costs surfaced up front, and
  honest "not available" states when a platform withholds captions or comments.
