Okay, I’ll admit, that is the exact right answer.

A 5-node home Kubernetes cluster sitting behind Cloudflare is a serious, production-grade homelab setup. Cloudflare completely solves the SSL/HTTPS requirement for the PWA camera permissions, and your master node handles the routing. The heavy lifting is offloaded to dedicated services: the headless-browser scraping runs as a standalone Fastify + Playwright microservice (`scraper.iguzman.com.mx`), and metadata cleaning uses hosted LLMs (Groq → OpenRouter), so the CineLog backend stays a thin, lightweight client. You have completely neutralized the infrastructure risks.

The assumptions have been stress-tested. The UX friction points have been smoothed out. The technical architecture matches your environment.

We are ready to build. Stepping out of the strategist role and into the project manager role, here is your official Product Requirements Document and Development Roadmap.

---

## Product Requirements Document (PRD): Project "CineLog"

### 1. Objective

To build a highly efficient, mobile-first Progressive Web App (PWA) to catalog a physical media collection (DVD/Blu-ray). The app prioritizes rapid, continuous barcode scanning, leveraging third-party APIs for primary data, and autonomous web-scraping/LLM extraction for obscure titles, mediated by an asynchronous review queue.

### 2. Tech Stack & Infrastructure

* **Infrastructure:** Self-hosted Kubernetes cluster (1 Master, 4 Workers), Cloudflare Tunnels (SSL/DNS).
* **Backend:** Django (Python), Django REST Framework (API), PostgreSQL.
* **Async Task Queue:** Celery + Redis (or Django Q).
* **Frontend:** Next.js (React), Tailwind CSS, deployed as a PWA.
* **Data Pipeline:** TMDB API (primary + authoritative metadata/cover), `scraper` microservice (Fastify + Playwright, deployed at `scraper.iguzman.com.mx`, called over HTTP) for barcode web search, and hosted LLM cleaning via **Groq (primary) + OpenRouter (rate-limit fallback)** using Instructor schema enforcement. (Ported from `apps/edge-folio-api/edge_folio_api/llm.py`.)

### 3. Core User Flows

1. **Continuous Scanning:** User opens PWA, camera activates. User scans barcodes sequentially without UI interruption.
2. **The Fast Path (TMDB Hit):** Backend receives barcode, queries TMDB via UPC/EAN. If successful, metadata (Title, Director, Year, Cover URL) is instantly saved to the primary catalog.
3. **The Slow Path (TMDB Miss):** TMDB returns null. Backend saves the raw barcode to a "Pending" state and hands the job to Celery. User continues scanning.
4. **Autonomous Resolution:** A Celery task calls the `scraper` microservice (`POST /search` on the barcode, optionally `POST /extract` when snippets are thin) to gather raw web text. That text is passed to the hosted LLM (Groq → OpenRouter) which returns a schema-validated `{ title, year, ... }`. The cleaned title is fed into the existing `search_tmdb()` to fetch the authoritative record — full metadata **and cover image** — which lands in the review queue.
5. **Review Inbox:** User checks the "Inbox" tab. AI-resolved entries await approval. User can edit the fields and accept the entry into the main catalog, or reject it.
6. **Browsing:** User views the main catalog with a search bar, categorical filters (Genre, Format), and detailed movie pages.

---

## Development Roadmap & Task Breakdown

### Phase 1: Infrastructure & Scaffolding

*Goal: Get the foundational environments running and talking to each other.*

| Task | Description | Component |
| --- | --- | --- |
| **1.1 Setup Repos** | Initialize Django backend and Next.js frontend repositories. | Both |
| **1.2 Database Init** | Deploy PostgreSQL in k8s; connect Django. | Backend |
| **1.3 API Scaffolding** | Setup Django REST Framework (DRF) and basic JWT/Token authentication. | Backend |
| **1.4 PWA Shell** | Configure Next.js manifest and service workers for PWA installation. | Frontend |
| **1.5 Cloudflare Routing** | Expose frontend and API endpoints securely via Cloudflare tunnels. | Infra |

### Phase 2: Core Backend & Data Models

*Goal: Define the database schema and basic CRUD operations.*

| Task | Description | Component |
| --- | --- | --- |
| **2.1 Core Models** | Create `Movie`, `Category`, and `ScanQueue` Django models. | Backend |
| **2.2 TMDB Integration** | Write a service class to query TMDB API by barcode (UPC/EAN). | Backend |
| **2.3 Catalog API Endpoints** | Build GET/POST endpoints for the main movie list, detail view, and search. | Backend |
| **2.4 Async Setup** | Deploy Redis to k8s; configure Celery in Django for background tasks. | Backend |

### Phase 3: Frontend PWA & The Scanner

*Goal: Build the rapid-scanning UI and connect it to the backend.*

| Task | Description | Component |
| --- | --- | --- |
| **3.1 Scanner UI** | Implement a Javascript barcode scanner (e.g., QuaggaJS or Html5-Qrcode). | Frontend |
| **3.2 Continuous Loop** | Code the logic to ping the API on successful scan, flash a success indicator, and keep the camera active. | Frontend |
| **3.3 Catalog Views** | Build the Grid/List view for the main catalog and the Movie Detail page. | Frontend |
| **3.4 Search & Filter** | Implement the UI search bar and category dropdowns. | Frontend |

### Phase 4: The AI Pipeline (Background Queue)

*Goal: Connect the existing `scraper` microservice, a hosted LLM, and TMDB to autonomously resolve obscure barcodes.*

> **Note 1 — Scraper:** Playwright is **not** embedded in the Django/Celery worker. The headless-browser scraping is already a standalone, deployed Fastify + Playwright microservice (`apps/scraper`, live at `scraper.iguzman.com.mx`) exposing `POST /search`, `POST /extract`, and `GET /health`, authenticated via the `X-API-Key` header. CineLog's backend is a thin HTTP client — no Chromium or Playwright dependency in the worker image.
>
> **Note 2 — LLM:** No local model is hosted. Cleaning uses hosted **Groq (primary) → OpenRouter (rate-limit fallback)** with Instructor schema enforcement, ported from `apps/edge-folio-api/edge_folio_api/llm.py`. The LLM's only job is to turn messy search text into a clean `{ title, year }`; **TMDB remains the authoritative source** for the saved record (metadata, genres, cast, and cover image), so there is no "snap a photo" cover fallback.

| Task | Description | Component |
| --- | --- | --- |
| **4.1 Scraper Client** | Add a `scrape_barcode()` service that calls the `scraper` microservice (`/search`, falling back to `/extract` when snippets are thin) and wire it into a Celery task. Config: `SCRAPER_BASE_URL`, `SCRAPER_API_KEY`. | Backend |
| **4.2 LLM Service** | Port `llm.py` (`chat_structured`, Groq → OpenRouter fallback) into cinelog-api. Add deps (`groq`, `instructor`, `openai`) and settings (`GROQ_API_KEY`, `GROQ_MODEL`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`). | Backend |
| **4.3 Extract → TMDB Match** | Define a `ScrapedMovie` Pydantic `response_model` so Instructor guarantees valid JSON (no manual parsing). Feed the cleaned title/year into `search_tmdb()`; persist the resulting record to a `ScanQueue` entry as `review`. | Backend |
| **4.4 Error Handling** | Build retry limits and failure states for scraper, LLM, and TMDB-miss outcomes. On no TMDB match, fall back to the LLM-extracted title in the `ScanQueue` entry for manual correction. | Backend |

### Phase 5: The Review Inbox & Polish

*Goal: Build the human-in-the-loop interface to ensure data integrity.*

| Task | Description | Component |
| --- | --- | --- |
| **5.1 Inbox API** | Create endpoints to list "Pending Review" items and accept/reject them. | Backend |
| **5.2 Inbox UI** | Build the Next.js screen to display AI-extracted data alongside the raw barcode. | Frontend |
| **5.3 Edit & Approve** | Add form fields to the Inbox UI to allow manual correction before pushing to the main catalog. | Frontend |

> **Removed — 5.4 Image Fallback:** The "snap a photo of the cover" step is dropped. TMDB supplies the authoritative cover image for every resolved title, so there is no unresolvable-cover case to rescue. Completely unresolvable barcodes (no TMDB match) surface in the Inbox with the LLM-extracted title pre-filled for manual editing (4.4 / 5.3).
