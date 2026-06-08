Okay, I’ll admit, that is the exact right answer.

A 5-node home Kubernetes cluster sitting behind Cloudflare with Gemma already spun up is a serious, production-grade homelab setup. Cloudflare completely solves the SSL/HTTPS requirement for the PWA camera permissions, your master node handles the routing, and your worker nodes have the compute to digest the Playwright scraping and LLM processing natively. You have completely neutralized the infrastructure risks.

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
* **Data Pipeline:** TMDB API (Primary), Playwright (Scraper), Gemma 4 (Local LLM via API).

### 3. Core User Flows

1. **Continuous Scanning:** User opens PWA, camera activates. User scans barcodes sequentially without UI interruption.
2. **The Fast Path (TMDB Hit):** Backend receives barcode, queries TMDB via UPC/EAN. If successful, metadata (Title, Director, Year, Cover URL) is instantly saved to the primary catalog.
3. **The Slow Path (TMDB Miss):** TMDB returns null. Backend saves the raw barcode to a "Pending" state and hands the job to Celery. User continues scanning.
4. **Autonomous Resolution:** Celery triggers Playwright to search the web for the barcode. Scraped HTML/text is sent to Gemma 4 to extract a structured JSON payload (Title, Cast, Year, Cover Image).
5. **Review Inbox:** User checks the "Inbox" tab. AI-generated entries await approval. User can edit text, accept the entry into the main catalog, or trigger a manual override (take a photo of the cover).
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

*Goal: Connect your existing Playwright/Gemma setup to handle the edge cases.*

| Task | Description | Component |
| --- | --- | --- |
| **4.1 Scraper Service** | Integrate your existing Playwright script into a Celery task. | Backend |
| **4.2 LLM Service** | Write the prompt and API call to send scraped text to your local Gemma instance. | Backend |
| **4.3 JSON Parsing** | Ensure Gemma outputs strict JSON; write logic to parse it into a temporary `ScanQueue` record. | Backend |
| **4.4 Error Handling** | Build retry limits and failure states for when scraping or the LLM completely fails. | Backend |

### Phase 5: The Review Inbox & Polish

*Goal: Build the human-in-the-loop interface to ensure data integrity.*

| Task | Description | Component |
| --- | --- | --- |
| **5.1 Inbox API** | Create endpoints to list "Pending Review" items and accept/reject them. | Backend |
| **5.2 Inbox UI** | Build the Next.js screen to display AI-extracted data alongside the raw barcode. | Frontend |
| **5.3 Edit & Approve** | Add form fields to the Inbox UI to allow manual correction before pushing to the main catalog. | Frontend |
| **5.4 Image Fallback** | Implement a feature in the Inbox to allow the user to snap a photo of the cover for completely unresolvable barcodes. | Frontend |
