# Product Requirements Document: EdgeFolio

## 1. Executive Summary

EdgeFolio is a specialized, privacy-first career application platform built exclusively for software engineers and hardware designers. Unlike generic AI wrappers, it safely analyzes proprietary enterprise codebases to extract technical architecture and dependencies without violating Non-Disclosure Agreements (NDAs). By utilizing a hybrid computing architecture, Next.js Progressive Web App (PWA) capabilities, Client-Side Abstract Syntax Tree (AST) parsing, and an "Immutable Matrix" routing system, EdgeFolio generates hyper-targeted, ATS-friendly resumes with zero risk of AI hallucination.

---

## 2. Target Audience & Market Positioning

* **Primary Users:** Mid-to-Senior Software Engineers, Systems Architects, DevOps Engineers, and Full-Stack Developers.
* **The Pain Point:** Developers cannot feed proprietary Jira tickets or enterprise code into cloud LLMs to generate resume bullet points due to strict NDAs. Generic AI tools lack the context to generate senior-level technical bullet points and frequently hallucinate skills.
* **The Unfair Advantage:** Zero-trust, offline-first codebase structure extraction utilizing WebAssembly, coupled with mathematically guaranteed factual accuracy via the Immutable Matrix.

---

## 3. Technical Architecture

The system is built on a split-processing model to balance deep technical extraction with seamless, crash-free user experiences across all devices.

### 3.1 Tech Stack

* **Frontend:** Next.js configured as a Progressive Web App (PWA).
* **Edge Parsing:** `web-tree-sitter` running in the browser via WebAssembly (WASM) to perform client-side AST parsing without hitting JS heap memory limits.
* **Backend API:** Django REST Framework handling business logic, user state, and routing.
* **Data & Caching:** PostgreSQL for persistent relational data (The Immutable Matrix); Redis for task queuing and session management.
* **Infrastructure:** Deployed via a secure Kubernetes (K8s) cluster to ensure isolated service scaling and high availability.

### 3.2 Core Mechanisms

* **Client-Side AST Sanitization:** The browser parses local files into an Abstract Syntax Tree. It scans for structural metadata—such as framework usage, DevOps manifests, and package dependencies—and strips out all proprietary strings, variables, and business logic. It outputs a harmless "Skeleton JSON."
* **Hybrid Synthesis:** Public data (like PDFs and LinkedIn URLs) and the structural "Skeleton JSON" are safely routed to a standard cloud LLM via the Django backend to synthesize the final master bullet points.

---

## 4. Key Features

### 4.1 Dual-Ingestion Onboarding Flow

To seed initial data, users can input baseline profile metrics, upload an existing PDF resume for parsing, or provide a LinkedIn URL via a safe proxy API.

### 4.2 Zero-Trust Codebase Audits (AST Method)

Users point the web app to a local directory containing proprietary code or architecture documentation. The WebAssembly parser instantly maps the project's structure (e.g., identifying Next.js routing, Django models, Kubernetes manifests, or even Hardware-as-Code and KiCad project files). Only this sanitized, structural metadata is transmitted to the server.

### 4.3 The Immutable Matrix

EdgeFolio does not dynamically generate new resume text for each job application. During onboarding and codebase audits, the cloud LLM helps the user transform the AST skeleton into highly detailed, factual, and user-approved bullet points. These are securely stored in Postgres. Users can manually fill in any deep technical gaps that the structural parser missed.

### 4.4 Dynamic Application Assembly

When a user applies for a specific role, they input the target job description. The cloud-side LLM acts strictly as a routing and scoring engine. It filters and reorders the pre-approved bullet points from the Immutable Matrix to perfectly match the job requirements.

### 4.5 ATS & Document Export

* A centralized dashboard tracks sent applications, customized cover letters, and interview stages.
* Single-click export to clean, ATS-optimized PDF resumes and Markdown-based portfolios.

---

## 5. Critical User Flows

### Flow A: Dual Ingestion Onboarding & Matrix Seeding

1. User registers/signs in via the Next.js frontend.
2. User is prompted to seed their profile using optional tracks: uploading an existing PDF resume or pasting a LinkedIn URL.
3. The Django backend processes the PDF or calls the proxy API for the LinkedIn profile, passing the text to a server-side cloud LLM.
4. The cloud LLM normalizes the public history into clean bullet points, which are presented to the user for approval.
5. Approved items are committed to the Immutable Matrix in Postgres.
6. The application presents "The Readiness Handshake," unlocking the secure offline AST codebase audit features.

### Flow B: The Code Audit (AST Pipeline)

1. User navigates to "Extract Experience" and selects "Process Proprietary Repository."
2. The browser executes the `web-tree-sitter` WebAssembly module against the selected local directory.
3. The AST parser extracts structural metadata and dependencies, ignoring all proprietary logic, and packages it into a Skeleton JSON.
4. The Skeleton JSON is sent to the Django backend, where a cloud LLM drafts suggested achievement bullet points based on the identified architecture.
5. The user reviews, edits, and adds context to these facts before permanently saving them into the Immutable Matrix.

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
| **Phase 1** | **Infrastructure & Data Layer** | K8s cluster setup, Postgres/Redis provisioning, and Django + Next.js boilerplate. |
| **Phase 1.5** | **Onboarding & Ingestion** | Build baseline profile forms, Django PDF text extraction, LinkedIn proxy API integration, server-side parsing to seed the Immutable Matrix, and the readiness handshake. |
| **Phase 2** | **AST Extraction Engine** | Integrate WebAssembly AST bindings in the frontend to generate the structural Skeleton JSON, and connect it to cloud-side synthesis prompts. |
| **Phase 3** | **Tailoring Engine** | Implement backend logic and server-side LLM prompt engineering to rank, filter, and sort Matrix items against a target JD, alongside dynamic cover letter generation. |
| **Phase 4** | **Export & Launch** | Build PDF/Markdown formatting engine, containerize services using Docker, and execute the final deployment to the production Kubernetes cluster. |

---

## 7. Implementation Roadmap & Task Breakdown

### Phase 1: Infrastructure & Data Foundation

* **Task 1.1: Project Boilerplate & Core Setup.** Initialize the Django REST Framework API and the Next.js frontend application. Configure initial database connections to PostgreSQL, session structures in Redis, and base Kubernetes deployment manifests.
* **Task 1.2: Immutable Matrix Foundation.** Define the base Django database models (`UserProfile` and `VerifiedAchievement`) and build the foundational CRUD API endpoints.

### Phase 1.5: Onboarding & Ingestion Bridge

* **Task 1.5.1: Baseline Profile Ingestion.** Build a clean, multi-step React form to capture foundational, non-NDA data: current job title, total years of experience, and preferred tech stack.
* **Task 1.5.2a: Django PDF Extraction.** Implement a Python-based parser (like `pdfplumber` or `PyMuPDF`) within a background task to extract raw text from uploaded resumes.
* **Task 1.5.2b: LinkedIn API Integration.** Integrate a dedicated third-party API (like Proxycurl or PhantomBuster) to fetch profile JSON reliably, bypassing IP blocks.
* **Task 1.5.3: Seeding the Matrix.** Pass the raw text from Task 1.5.2a/b to the server-side LLM to structure and normalize the data. Present these facts to the user for approval and write them directly into the Postgres Immutable Matrix.
* **Task 1.5.4: The Readiness Handshake.** Build a UI state that smoothly transitions the user from "Reviewing Public Profile" to "Secure Environment Ready," officially unlocking the Local Codebase Audit dashboard.

### Phase 2: AST Extraction Engine (Hybrid Pipeline)

* **Task 2.1: WebAssembly Integration.** Integrate the `web-tree-sitter` package and its required `.wasm` grammar files into the Next.js application to enable client-side parsing.
* **Task 2.2: Local Directory Ingestion.** Build the browser UI component using the File System Access API that prompts the user to select a local directory.
* **Task 2.3: AST Structural Extraction Logic.** Configure the WebAssembly parser to map dependencies (e.g., Python `requirements.txt`, full-stack JS `package.json`, KiCad `.kicad_pro` files), deployment manifests, and component architectures, strictly filtering out strings and variables.
* **Task 2.4: Cloud Synthesis Prompts.** Format the resulting Skeleton JSON and POST it to the Django API. Write the server-side LLM prompts to translate this raw structure into human-readable draft bullet points, allowing the user to fill in the technical gaps before saving to the Matrix.

### Phase 3: Tailoring Engine (Cloud Routing)

* **Task 3.1: JD Ingestion UI.** Build a simple dashboard where the user pastes the target Job Description (JD).
* **Task 3.2: Cloud LLM Integration.** Connect the Django backend to a fast server-side LLM API (e.g., OpenAI or Anthropic).
* **Task 3.3: The Sorting Prompt.** Write the server-side prompt instructing the LLM to act *only* as a router. Ingest the JD and the user's Immutable Matrix, then score, filter, and reorder the verified bullet points to create the perfect match without hallucination.
* **Task 3.4: Dynamic Cover Letters.** Use the server-side LLM to generate a custom cover letter, forcing it to reference only the specific facts selected by the sorting prompt in Task 3.3.

### Phase 4: Export & Deployment

* **Task 4.1: Document Formatting.** Implement PDF and Markdown export functionalities so the user can download their tailored, ATS-friendly resume and cover letter.
* **Task 4.2: Containerization.** Write the Dockerfiles for the Next.js frontend, the Django API, and the Redis workers.
* **Task 4.3: Cluster Deployment.** Deploy the containers into the secure Kubernetes cluster, ensuring persistent volume claims are correctly set up for the Postgres database holding the Immutable Matrix.