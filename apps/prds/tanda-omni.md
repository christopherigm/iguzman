# Product Requirements Document: TandaOmni

## 1. Project Overview

**Objective:** A zero-interest, community-funded financial ecosystem (ROSCA/Tanda model) supporting Real Estate (Appreciating), Vehicles/Equipment (Destructible), and Experiences (Unrecoverable).
**Tech Stack:** Next.js (Frontend), Django/DRF (Backend), PostgreSQL (DB), Redis/Celery (Async), Kubernetes (Infra).

## 2. Core Risk Verticals

The platform dynamically groups users into specific risk tiers based on the asset class they are funding:

- **Tier 1: Real Estate (Appreciating Asset)**
- **Term:** 60 to 120 Months
- **Price Delta ($\delta$):** +4% to +6%
- **Mitigation:** 15% Downpayment, Legal Deed Trust (_Reserva de Dominio_).

- **Tier 2: Vehicles & Commercial Equipment (Depreciating / Destructible)**
- **Term:** 12 to 36 Months
- **Price Delta ($\delta$):** Conditional on acquisition type:
  - **New Vehicle:** +3% to +6% (tracks MSRP inflation; manufacturer pricing rises each model year due to labor, materials, and microchip costs).
  - **Used Vehicle:** −5% to −10% (tracks depreciation; the specific target asset ages and loses value while the user waits in the payout queue).
- **Mitigation:** 20% Downpayment, Mandatory Platform-Held Insurance Policy.

  > **Risk Engine Note - Acquisition Cost vs. Collateral Value:** Do not conflate the two. A "New Vehicle" goal requires a _positive_ delta to correctly price future acquisition costs (the 2028 model will cost more than today's). However, the moment the car leaves the lot, it becomes a _depreciating_ collateral asset. Mandatory insurance is therefore non-negotiable regardless of delta direction - if the asset is destroyed in Month 2, the platform must recover capital from the insurer, not from the wreckage's resale value.

- **Tier 3: Travel & Experiences (Unrecoverable)**
- **Term:** 6 to 12 Months
- **Price Delta ($\delta$):** +2% to +4%
- **Mitigation:** Escrow Lock (Payout only releases after user contributes 60% of total goal), Credit Card Pre-authorization.

---

## 3. Mathematical Risk Models

**Universal Variables:**

- $G$: Target Asset Price (Base Value)
- $N$: Number of participants in the group
- $d$: Downpayment percentage (varies by vertical tier)
- $\delta$: Annual Price Delta (Positive for inflation, Negative for deflation/depreciation)
- $r$: Annual Treasury Yield (e.g., CETES at $0.065$)
- $T$: Total term in years
- $M$: Total term in months ($M = T \times 12$)
- $m$: Current month index

### A. Dynamic Price Adjustment (The Delta Curve)

Calculates the actual cost to purchase the asset at month $m$.

$$G_m = G \times (1 + \delta)^{\frac{m}{12}}$$

### B. Fixed Monthly Payment (Delta Adjusted)

Averages the changing asset price over the term to lock in a fixed monthly payment for the user.

$$P = \frac{G \times \left(1 + \left(\delta \times \frac{T}{2}\right)\right) - (G \times d)}{M}$$

### C. The Escrow Release Threshold

For Tier 3 unrecoverable assets, payout is locked until the user's total paid contributions ($\Sigma P$) plus downpayment reach a safety threshold $c$ (e.g., $0.60$).

$$\sum_{k=1}^{m} P_k + (G \times d) \ge G_m \times c$$

### D. Treasury Ledger & Monthly Balance

Calculates the total platform liquidity pool, accounting for monthly contributions, yield, asset payouts, and mandatory insurance premiums ($I_m$) for Tier 2 assets.

$$B_m = B_{m-1} + (N \times P) + \left(B_{m-1} \times \frac{r}{12}\right) - G_m - I_m$$

---

## 4. Agentic Task Breakdown

### Phase 1: Backend Infrastructure & Risk Engine (Django / DRF)

| Task ID   | Component                    | Directives for Agent                                                                                                                                                                                                                                                                                                                             |
| --------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **BE-01** | Core DB & Ledger             | Build `User`, `Group`, `AssetCategory`, and `LedgerEntry` models. `AssetCategory` fields: `max_term`, `delta_rate`, `requires_insurance`, `escrow_threshold`. `LedgerEntry` MUST be append-only. No updates/deletes.                                                                                                                             |
| **BE-02** | Multi-Vertical Simulator API | Build stateless endpoint `/api/v1/simulate/`. Inputs: $G, T, d, category\_id$, and for Tier 2 an additional `vehicle_condition` enum (`new` \| `used`). Logic: Apply Delta Curve formulas to return $N, P$ and mitigation string (e.g., "Requires Escrow"). Delta range is resolved server-side from `vehicle_condition` before any calculation. |
| **BE-03** | Group Matching Algo          | Build `/api/v1/groups/match/`. Group KYC-verified users by matching $P$ within a 5% variance. Create a `Group` instance when $N$ target is met. Set status to "AWAITING_DOWNPAYMENT".                                                                                                                                                            |
| **BE-04** | Treasury Yield Worker        | Celery task running nightly. Calculate yield for active groups: `(balance * (r / 365))`. Append `YIELD` ledger entry.                                                                                                                                                                                                                            |
| **BE-05** | Insurance & Fees Worker      | Celery task running monthly. Check `requires_insurance` flag on Group. If true, deduct premium and append `INSURANCE_FEE` ledger entry.                                                                                                                                                                                                          |
| **BE-06** | Smart Payout Queue           | Monthly Celery task. If $B_m \ge G_m$, check category escrow rules. If threshold passed, execute `PAYOUT` ledger entry to next user. Queue order determined by joined date and secure hash.                                                                                                                                                      |

### Phase 2: Frontend Implementation (Next.js)

| Task ID   | Component                | Directives for Agent                                                                                                                                                                                                                                                                                                                                                                |
| --------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FE-01** | Omni-Simulator UI        | Build `Simulator.tsx` client component. Use tabs for Asset Type (House, Car, Travel). Dynamically adjust slider limits for terms based on selected tier. **When Vehicle tier is selected, show a secondary New / Used toggle** that switches the delta slider range between positive (MSRP inflation) and negative (depreciation) step sets. Debounce calls to `/api/v1/simulate/`. |
| **FE-02** | Contract & Mitigation UI | Build dynamic warning rendering. Show mandatory insurance acknowledgment for Tier 2. Show visual 60% Escrow Unlock progress bar for Tier 3.                                                                                                                                                                                                                                         |
| **FE-03** | Auth & KYC Flow          | Implement NextAuth. Build onboarding wizard capturing ID. Integrate Stripe Elements to capture a pre-authorization hold if the user selects Tier 3.                                                                                                                                                                                                                                 |
| **FE-04** | User Dashboard UI        | Fetch user ledger data. Build modular Recharts components: `QueueTimeline.tsx` showing queue position, and `TreasuryChart.tsx` tracking group balance ($B_m$) and yield over time.                                                                                                                                                                                                  |

### Phase 3: Deployment & Infrastructure (Kubernetes)

| Task ID   | Component           | Directives for Agent                                                                                                                                                           |
| --------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **DO-01** | Dockerization       | Write multi-stage Dockerfiles for Next.js, Django, and Celery workers. Optimize for slim production images.                                                                    |
| **DO-02** | K8s Manifests       | Create `deployment.yaml` and `service.yaml`. Provision two distinct Celery deployments: `worker-general` and `worker-financial-critical`. Configure Liveness/Readiness probes. |
| **DO-03** | Ingress & TLS       | Configure Ingress controller with routing rules (`/api/*` to backend, `/` to frontend). Configure cert-manager for automated Let's Encrypt certificates.                       |
| **DO-04** | Immutable DB Config | Deploy PostgreSQL StatefulSet with PersistentVolumeClaims (PVCs). Define ConfigMaps and Secrets for environment variables.                                                     |
| **DO-05** | Disaster Recovery   | Configure a K8s CronJob to trigger `pg_dump` every 12 hours, piped directly to an encrypted object storage bucket.                                                             |
