# Product Requirements Document: EdgeFolio

## 1. Executive Summary

EdgeFolio is a specialized, privacy-first career application platform built exclusively for software engineers. Unlike generic AI wrappers, it safely analyzes proprietary enterprise codebases to extract hard technical achievements without violating Non-Disclosure Agreements (NDAs). By utilizing a hybrid edge-computing architecture, Next.js Progressive Web App (PWA) capabilities, and an "Immutable Matrix" routing system, EdgeFolio generates hyper-targeted, ATS-friendly resumes and cover letters with zero risk of AI hallucination.

---

## 2. Target Audience & Market Positioning

* **Primary Users:** Mid-to-Senior Software Engineers, Systems Architects, and Full-Stack Developers.
* **The Pain Point:** Developers cannot feed proprietary Jira tickets or enterprise code into cloud LLMs to generate resume bullet points due to strict NDAs. Generic AI tools lack the context to generate senior-level technical bullet points and frequently hallucinate skills.
* **The Unfair Advantage:** Zero-trust, offline-first codebase extraction coupled with mathematically guaranteed factual accuracy.

---

## 3. Technical Architecture

The system is built on a split-processing model to balance deep technical extraction with seamless user experience.

### 3.1 Tech Stack

* **Frontend:** Next.js configured as a Progressive Web App (PWA).
* **Edge AI & Storage:** A lightweight quantized model (e.g., Gemma 4b) cached locally in the browser utilizing the Origin Private File System (OPFS) and WebGPU for client-side inference.
* **Backend API:** Django REST Framework handling business logic, user state, and routing.
* **Data & Caching:** PostgreSQL for persistent relational data (The Immutable Matrix); Redis for task queuing and session management.
* **Infrastructure:** Deployed via a secure Kubernetes (K8s) cluster to ensure isolated service scaling and high availability.

### 3.2 Core Mechanisms

* **The PWA Illusion:** To eliminate the friction of downloading a multi-gigabyte local model, the Next.js service worker silently fetches and caches the model weights into the OPFS in the background while the user completes standard onboarding.
* **Hybrid Processing:** Public data is routed to a standard cloud LLM via the Django backend for speed. NDA and proprietary data is strictly routed to the OPFS-cached local model.

---

## 4. Key Features

### 4.1 Dual-Ingestion Onboarding Flow

To seed initial data while the edge model downloads in the background, users can input baseline profile metrics, upload an existing PDF resume for parsing, or provide a LinkedIn URL via a safe proxy API.

### 4.2 Zero-Trust Codebase Extraction

Users point the web app to a local directory containing proprietary code or architecture documentation. The local edge model scrubs the code, extracting the technical stack, architectural patterns, and performance metrics, while stripping all proprietary variables, logic, and names. Only the sanitized metadata is transmitted to the server.

### 4.3 The Immutable Matrix

EdgeFolio does not dynamically generate new resume text for each job application. Instead, during onboarding and codebase audits, the system helps the user generate a master database of 50-100 highly detailed, factual, and user-approved bullet points stored securely in Postgres.

### 4.4 Dynamic Application Assembly

When a user applies for a specific role, they input the target job description. The cloud-side LLM acts strictly as a routing and scoring engine. It filters and reorders the pre-approved bullet points from the Immutable Matrix to perfectly match the job requirements, ensuring 100% factual accuracy and zero hallucination.

### 4.5 ATS & Document Export

* A centralized dashboard tracks sent applications, customized cover letters, and interview stages.
* Single-click export to clean, ATS-optimized PDF resumes and Markdown-based portfolios.

---

## 5. Critical User Flows

### Flow A: Dual Ingestion Onboarding & Matrix Seeding

1. User registers/signs in via the Next.js PWA. Background sync begins pulling the edge model to OPFS.
2. User is prompted to seed their profile using optional tracks: uploading an existing PDF resume or pasting a LinkedIn URL.
3. The Django backend processes the PDF or calls the proxy API for the LinkedIn profile, passing the text to a server-side cloud LLM.
4. The cloud LLM normalizes the public history into clean bullet points, which are presented to the user for approval.
5. Approved items are committed to the Immutable Matrix in Postgres, completing onboarding while the local model finishes downloading.
6. The application presents "The Readiness Handshake," unlocking the secure offline features.

### Flow B: The Code Audit

1. User navigates to "Extract Experience" and selects "Process Proprietary Repository."
2. Browser verifies local model readiness within OPFS and executes inference on the selected local directory using WebGPU acceleration.
3. Sanitized, NDA-compliant metadata is presented to the user for approval.
4. Approved facts are permanently saved into the user's Immutable Matrix in Postgres.

### Flow C: Tailored Job Application

1. User pastes a target Job Description (JD) into the dashboard.
2. The Django backend passes the JD and the user's Immutable Matrix to the server LLM.
3. The LLM scores and selects the top 15 most relevant bullet points for this specific role.
4. The LLM drafts a custom cover letter referencing those specific, verified facts.
5. User reviews the final, tailored resume and cover letter, exporting them directly to PDF.

---

## 6. Milestones for MVP

| Phase | Milestone | Description |
| --- | --- | --- |
| **Phase 1** | **Infrastructure & Storage** | K8s cluster setup, Postgres/Redis provisioning, Django + Next.js boilerplate, and configuring Next.js service worker + OPFS for background model downloading. |
| **Phase 1.5** | **Onboarding & Ingestion** | Build baseline profile forms, Django PDF text extraction, LinkedIn proxy API integration, server-side parsing to seed the Immutable Matrix, and the readiness handshake. |
| **Phase 2** | **Edge Extraction** | Integrate WebGPU bindings in the frontend and build client-side prompt logic to sanitize local codebase metrics into STAR-format metadata. |
| **Phase 3** | **Tailoring Engine** | Implement backend logic and server-side LLM prompt engineering to rank, filter, and sort Matrix items against a target JD, alongside dynamic cover letter generation. |
| **Phase 4** | **Export & Launch** | Build PDF/Markdown formatting engine, containerize services using Docker, and execute the final deployment to the production Kubernetes cluster. |

---

## 7. Implementation Roadmap & Task Breakdown

### Phase 1: Infrastructure, Storage & PWA Illusion

* **Task 1.1: Project Boilerplate & Core Setup.** Initialize the Django REST Framework API and the Next.js frontend application. Configure initial database connections to PostgreSQL, session structures in Redis, and base Kubernetes infrastructure.
* **Task 1.2: PWA Service Worker Configuration.** Configure the Next.js application to run as a Progressive Web App. Implement background sync service workers capable of handling long-running asset downloads.
* **Task 1.3: Model Selection & OPFS Caching Layer.** Integrate a web-ready inference engine (e.g., Transformers.js or WebLLM). Write the logic to fetch the quantized model weights and route them directly into the browser's Origin Private File System (OPFS).
* **Task 1.4: Immutable Matrix Foundation & Offline Test.** Define the base Django database models (`UserProfile` and `VerifiedAchievement`) and build the foundational CRUD API endpoints. Disconnect the network locally to verify the Next.js app can load the model from OPFS without external requests.

### Phase 1.5: Onboarding & Ingestion Bridge

* **Task 1.5.1: Baseline Profile Ingestion.** Build a clean, multi-step React form to capture foundational, non-NDA data: current job title, total years of experience, and preferred tech stack.
* **Task 1.5.2a: Django PDF Extraction.** Implement a Python-based parser (like `pdfplumber` or `PyMuPDF`) within a background task to extract raw text from uploaded resumes.
* **Task 1.5.2b: LinkedIn API Integration.** Integrate a dedicated third-party API (like Proxycurl or PhantomBuster) to fetch profile JSON reliably, bypassing IP blocks.
* **Task 1.5.3: Seeding the Matrix.** Pass the raw text from Task 1.5.2a/b to the server-side LLM to structure and normalize the data. Present these facts to the user for approval and write them directly into the Postgres Immutable Matrix.
* **Task 1.5.4: The Readiness Handshake.** Build a UI state that smoothly transitions the user from "Reviewing Public Profile" to "Secure Local Environment Ready" once the service worker completes the OPFS download, officially unlocking the Zero-Trust Codebase Extraction button.

### Phase 2: Edge Extraction (Zero-Trust Pipeline)

* **Task 2.1: WebGPU Execution Bindings.** Configure the frontend inference engine to utilize native WebGPU bindings, offloading processing to the user's local graphics hardware.
* **Task 2.2: Local Directory Ingestion.** Build the UI component that prompts the user to select a local directory containing their proprietary code or architecture documentation.
* **Task 2.3: Edge Prompt Engineering.** Write the strict prompt chain for the local model. It must be instructed to extract the technical stack, architecture patterns, and performance metrics while completely stripping all proprietary logic, variable names, and company credentials.
* **Task 2.4: API Handshake.** Format the sanitized, NDA-compliant metadata into a structured JSON payload and POST it to the Django API endpoints to update the master database.

### Phase 3: Tailoring Engine (Cloud Routing)

* **Task 3.1: JD Ingestion UI.** Build a simple dashboard where the user pastes the target Job Description (JD).
* **Task 3.2: Cloud LLM Integration.** Connect the Django backend to a fast server-side LLM API (e.g., OpenAI or Anthropic).
* **Task 3.3: The Sorting Prompt.** Write the server-side prompt instructing the LLM to act *only* as a router. Ingest the JD and the user's Immutable Matrix, then score, filter, and reorder the verified bullet points to create the perfect match without hallucination.
* **Task 3.4: Dynamic Cover Letters.** Use the server-side LLM to generate a custom cover letter, forcing it to reference only the specific facts selected by the sorting prompt in Task 3.3.

### Phase 4: Export & Deployment

* **Task 4.1: Document Formatting.** Implement PDF and Markdown export functionalities so the user can download their tailored, ATS-friendly resume and cover letter.
* **Task 4.2: Containerization.** Write the Dockerfiles for the Next.js frontend, the Django API, and the Redis workers.
* **Task 4.3: Cluster Deployment.** Deploy the containers into the secure Kubernetes cluster, ensuring persistent volume claims are correctly set up for the Postgres database holding the Immutable Matrix.