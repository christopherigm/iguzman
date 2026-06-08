## **Product Requirements Document (PRD)**

**Project:** Social Mortgage Platform & Simulator ("TandaCasa")
**Objective:** Replace predatory, high-interest mortgages with a zero-interest, community-funded ROSCA (Tanda) model, utilizing a fixed inflation-adjusted payment structure and an invested treasury.

### **1. Core Architecture & Tech Stack**

* **Frontend:** Next.js (React, Tailwind CSS for UI)
* **Backend:** Django (Python, Django REST Framework)
* **Database:** PostgreSQL (Relational data, transactions)
* **Caching/Queues:** Redis & Celery (For async treasury calculations and monthly ledger updates)
* **Infrastructure:** Kubernetes (Containerized microservices, scalable pod deployment)

### **2. Core Features & User Flows**

#### **A. The Interactive Simulator (Lead Magnet)**

* **Function:** An interactive slider tool where users input their target house price and desired monthly payment.
* **Output:** The system calculates the required group size, the upfront 15-20% downpayment, the fixed monthly payment (with average 10-year inflation baked in), and the estimated wait-time distribution.

#### **B. Social Matching & Group Formation**

* **Function:** Users are grouped into cohorts based on target budget and verified income.
* **Mechanic:** Users must pass KYC (Know Your Customer) and income verification. Once a cohort reaches critical mass (e.g., 125 users), the smart contract/legal trust is formed.

#### **C. Treasury & Ledger Engine**

* **Function:** The core financial backend. It manages the pool, calculates the CETES yield on the downpayment reserve, and triggers the monthly payout to the next user in line.
* **Mechanic:** Automatically flags missed payments, triggers reserve funds to cover the liquidity gap, and initiates the default protocol if a grace period expires.

#### **D. Legal & Trust Dashboard**

* **Function:** Interface for users to view their digital contract, ownership status (Reserva de Dominio), and their place in the queue.

---

## **Project Roadmap**

| Phase | Milestone | Focus Area | Estimated Timeline |
| --- | --- | --- | --- |
| **Phase 1** | The Simulator MVP | Next.js interactive financial models, Django API logic. | Weeks 1-4 |
| **Phase 2** | User Auth & KYC | Auth integration, user profiles, document uploading. | Weeks 5-7 |
| **Phase 3** | Group Matching Engine | Logic to pool users, queue algorithms, dashboard UI. | Weeks 8-10 |
| **Phase 4** | Ledger & Treasury | Payment gateway, internal ledger, automated payout system. | Weeks 11-14 |
| **Phase 5** | K8s Deployment & Beta | Containerization, load testing, initial closed beta. | Weeks 15-16 |

---

## **Detailed Task Breakdown**

### **Part 1: The Mathematical Models (The Simulator Logic)**

You must feed these exact formulas into your agent when building the `Simulator` component and the `Ledger Engine`.

**Variables Definition:**

* $G$: Target house price (Base Value)
* $N$: Number of participants in the group
* $d$: Downpayment percentage (e.g., $0.15$ for 15%)
* $i$: Projected annual inflation rate (e.g., $0.05$ for 5%)
* $r$: Annual yield rate of the Treasury (e.g., $0.11$ for 11% CETES)
* $T$: Total term in years
* $M$: Total term in months ($M = T \times 12$)
* $m$: Current month index ($1 \le m \le M$)

**1. Downpayment Calculation**
The upfront capital required from a single user.


$$D = G \times d$$

**2. Inflation-Adjusted House Cost**
The actual cost of purchasing the house at month $m$.


$$G_m = G \times (1 + i)^{\frac{m}{12}}$$

**3. Fixed Monthly Payment Calculation**
To keep payments fixed while covering the escalating cost of houses, we calculate the average inflated cost of the house over the term and subtract the downpayment.


$$P = \frac{G \times \left(1 + \left(i \times \frac{T}{2}\right)\right) - D}{M}$$


*(Note: Using the midpoint $T/2$ provides a balanced, fixed linear approximation of the inflation burden over the life of the group).*

**4. Monthly Treasury Balance & Yield Calculation**
The recursive formula for the platform's liquidity pool. This must be calculated dynamically by the backend worker.


$$B_m = B_{m-1} + (N \times P) + \left(B_{m-1} \times \frac{r}{12}\right) - G_m$$


*Where $B_0$ (Initial Treasury) = $N \times D$*

---

### **Part 2: Agentic Task Breakdown (Prompt Blueprints)**

Feed these exact blocks to your coding agent sequentially. They are designed to isolate context and force strict architectural patterns.

#### **Phase 1: Backend Infrastructure & Immutable Ledger (Django/PostgreSQL)**

**Task BE-01: Database Schema & Immutable Financial Matrix**

> **Role:** Backend Architect
> **Stack:** Django, PostgreSQL
> **Objective:** Create the core database models using an append-only, immutable ledger pattern for all financial transactions to prevent state hallucinations or data corruption.
> **Requirements:**
> 1. Create `User`, `Group`, `Property`, and `LedgerEntry` models.
> 2. The `LedgerEntry` model MUST be strictly append-only. Do not allow `UPDATE` or `DELETE` operations on this table at the database level or via Django signals.
> 3. Fields for `LedgerEntry`: `transaction_id` (UUID), `user_id`, `group_id`, `amount`, `transaction_type` (CREDIT, DEBIT, YIELD, PAYOUT), `timestamp`.
> 4. Create a class method `get_current_balance(group_id)` that dynamically calculates the current treasury balance by summing the `LedgerEntry` rows. Do NOT store the balance as a static mutable field.
> **Output:** `models.py` and initial Django migration files.
> 
> 

**Task BE-02: The Simulator API Endpoint**

> **Role:** API Developer
> **Stack:** Django REST Framework
> **Objective:** Build a stateless, Zero-Trust API endpoint to calculate the TandaCasa simulation.
> **Inputs:** JSON payload containing `target_house_price` ($G$), `inflation_rate` ($i$), `downpayment_percent` ($d$), and `term_years` ($T$).
> **Logic:** Implement the exact mathematical formulas provided in the project spec to calculate the required `group_size` ($N$), `downpayment_amount` ($D$), and `monthly_payment` ($P$).
> **Validation:** Ensure strict input sanitization. Return HTTP 400 for negative numbers or impossible variables.
> **Output:** `views.py`, `serializers.py`, and `urls.py` containing the `/api/v1/simulate/` endpoint.

**Task BE-03: Asynchronous Treasury Yield Calculation**

> **Role:** Backend Worker Developer
> **Stack:** Django, Celery, Redis
> **Objective:** Create a background worker that runs nightly to calculate and append treasury yield (CETES) to active groups.
> **Logic:** > 1. Query all active `Group` instances.
> 2. Call `get_current_balance()` for each group.
> 3. Calculate daily yield: `(balance * (0.11 / 365))`.
> 4. Append a new `LedgerEntry` with `transaction_type="YIELD"` for that group.
> **Output:** `tasks.py` and Celery configuration in `settings.py`.

#### **Phase 2: Frontend Implementation (Next.js)**

**Task FE-01: Interactive Simulator UI Component**

> **Role:** Frontend Developer
> **Stack:** Next.js (App Router), React, Tailwind CSS
> **Objective:** Build the client-side Simulator component that interacts with the Django API.
> **Requirements:**
> 1. Create a responsive client component `Simulator.tsx`.
> 2. Implement sliding inputs for: House Goal (1M - 5M MXN), Term (5 - 15 Years).
> 3. Implement debounced API calls to `/api/v1/simulate/` to prevent rate-limiting while the user drags the sliders.
> 4. Display the resulting `monthly_payment`, `downpayment`, and `group_size` prominently.
> 5. Handle loading and error states cleanly.
> **Output:** Complete code for `Simulator.tsx` and any necessary TypeScript interfaces.
> 
> 

**Task FE-02: User Dashboard & Treasury Data Visualization**

> **Role:** Frontend Developer
> **Stack:** Next.js, Tailwind CSS, Recharts (or similar charting library)
> **Objective:** Create the authenticated user dashboard displaying their Tanda progress.
> **Requirements:**
> 1. Fetch user ledger data from `/api/v1/user/ledger/`.
> 2. Render a visual queue (timeline) showing their position for receiving the house payout.
> 3. Render a chart showing the overall Group Treasury Balance ($B_m$) over time, highlighting the accrued CETES yield.
> 4. Ensure all components are modular and strictly typed.
> **Output:** `Dashboard.tsx`, `TreasuryChart.tsx`, and `QueueTimeline.tsx`.
> 
> 

#### **Phase 3: Deployment (Kubernetes)**

**Task DO-01: Containerization & K8s Manifests**

> **Role:** DevOps Engineer
> **Stack:** Docker, Kubernetes
> **Objective:** Containerize the Django backend, Next.js frontend, and Celery workers, and write the K8s deployment manifests.
> **Requirements:**
> 1. Write optimized, multi-stage `Dockerfiles` for Next.js and Django.
> 2. Create `deployment.yaml` and `service.yaml` for: `frontend-app`, `backend-api`, `celery-worker`, `redis-cache`.
> 3. Implement Readiness and Liveness probes for the Django API and Next.js server.
> 4. Define `ConfigMap` and `Secret` schemas for database credentials and API keys.
> **Output:** Complete Dockerfiles and the `.yaml` files for the Kubernetes cluster.
> 
>