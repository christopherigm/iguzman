## Product Requirements Document (PRD)

> **Revision note (Phase 0 outcome):** The original design authored 3D assets in **Blender** via a custom Python `bpy` MCP bridge. Phase 0 research (see §7) found that Blender is *not* GeckoLib's supported tool — **Blockbench** is the official and only documented authoring tool, and it exports GeckoLib `.geo.json` / `.animation.json` natively with no format conversion. A mature, ready-made **Blockbench MCP plugin** already exposes the create/rig/animate/export/screenshot tools this project needed to build from scratch. This document has been rewritten around Blockbench.

### 1. Product Vision

An automated, AI-driven development environment for creating Minecraft mods. Claude Code acts as the central orchestrator: it generates the Java game logic **and** drives 3D model creation, rigging, and keyframe animation inside **Blockbench** over the Model Context Protocol. Because Blockbench's native format *is* Bedrock geometry, assets export directly into the mod repository as GeckoLib-ready `.geo.json` and `.animation.json` — no lossy mesh conversion — creating a seamless prompt-to-play pipeline with a built-in visual verification step.

### 2. Tech Stack & Version Locking

To ensure compatibility across the AI, the 3D software, and the game engine, we are locking the following versions:

- **Minecraft Version:** 1.20.1 (currently the most stable and widely supported version for complex modding frameworks).
- **Mod Loader:** NeoForge or Fabric (NeoForge recommended for 1.20+ entity modding).
- **3D Authoring Tool:** **Blockbench** (latest stable desktop/Electron build) with the **"GeckoLib Models & Animations"** plugin. This is GeckoLib's official authoring tool; it emits `.geo.json` and `.animation.json` natively.
- **AI ↔ 3D Bridge:** **Blockbench MCP plugin** ([`jasonjgardner/blockbench-mcp-plugin`](https://github.com/jasonjgardner/blockbench-mcp-plugin)) — runs an HTTP MCP server inside Blockbench (default `http://localhost:3000/bb-mcp`) exposing modeling, rigging, animation, texture, export, and camera/screenshot tools to Claude Code.
- **AI Model:** Claude Opus 4.8 (native engine for Claude Code; best in class for complex Java scripting and multi-tool orchestration).
- **Animation Framework:** GeckoLib for Minecraft 1.20.1.
- **Bridge Protocol:** Model Context Protocol (MCP).
- **Language:** Java 17 (required for Minecraft 1.20.1).
- **Runtime Display:** A GPU or virtual framebuffer (**Xvfb**) — required both to run the Blockbench Electron app (no headless CLI mode exists) and to launch the Minecraft client for verification.

### 3. Core Architecture & Data Flow

1. **Prompt:** The user issues a single natural-language command to Claude Code in the terminal (e.g., _"Create a hostile flying eyeball mob that shoots lasers"_).
2. **Logic & Schema Generation:** Claude Code generates the Java entity classes and rendering registries, and defines the explicit naming conventions for the required assets **first** (e.g., `eyeball.geo.json`, `animation.eyeball.fly`, bone/group names).
3. **MCP Handoff:** Claude Code calls the Blockbench MCP tools, passing the exact names it just committed to in the Java layer.
4. **Asset Generation:** The plugin drives a running Blockbench instance to create the geometry (cubes/groups/mesh), build the bone rig (armature), and author keyframe animations matching Claude's schema — all in the native GeckoLib format.
5. **Visual Verification:** Claude captures a Blockbench viewport screenshot (camera tool) to confirm the model and animation look correct, and iterates if not.
6. **Automated Export:** Claude calls the plugin's export tool to write `.geo.json` and `.animation.json` (plus any texture) directly into `src/main/resources/assets/<mod_id>/...`.
7. **Compilation & In-Game Test:** Claude finalizes the Java code and runs `./gradlew runClient` (on the Xvfb display) to launch Minecraft, spawn the entity, and capture an in-game screenshot for final verification.

### 4. Out of Scope (Phase 1)

- **Complex Texturing:** Blockbench's paint/UV MCP tools can apply solid colors, simple palettes, and basic procedural fills. Highly detailed, hand-painted UV maps remain out of scope for AI generation and will require manual polish.
- **Multiplayer Server Synchronization:** Phase 1 focuses strictly on single-player client testing.
- **True Headless Authoring:** Blockbench has no official CLI/headless mode; the pipeline runs a live Blockbench instance on a virtual display rather than a background process. Building a headless Blockbench harness is out of scope.

### 5. Key Risks & Mitigations

| #  | Risk | Likelihood | Impact | Mitigation |
| -- | ---- | ---------- | ------ | ---------- |
| R1 | ~~Blender is not GeckoLib's standard authoring tool.~~ **Resolved in Phase 0** by adopting Blockbench, the official GeckoLib tool. | — | — | Closed. See §7. |
| R2 | **Blockbench cannot run headless.** It is an Electron GUI app; the MCP server registers in the app UI, so a live instance must stay running. | High | Medium | Run Blockbench on an **Xvfb** virtual display inside the pipeline environment; treat it as a managed long-lived service, not a per-call spawn. Proven in Task 0.3. |
| R3a | **Model export (`.geo.json`) depends on a plugin chain.** The MCP `export.ts` tool is codec-agnostic — it dispatches to whatever codec Blockbench has registered; GeckoLib's `.geo.json` codec is provided by the *separate* "GeckoLib Models & Animations" plugin. Export works only if that plugin is installed and its codec id is passed / is the active project format. | Medium | High | Task 0.1-V: confirm the GeckoLib codec appears in `list_export_formats` and that MCP export emits schema-valid `.geo.json`. Pin both plugins + Blockbench. |
| R3b | **Animation export (`.animation.json`) is the real unknown.** The MCP `animation.ts` tool only *creates/manipulates* animations in-memory (`Animator.loadFile`, Bedrock `format_version 1.8.0`) — it has **no file-export method**, and `.animation.json` is a separate Blockbench export path from the model. It is unproven that the generic `export.ts` tool can reach the animation file. | **High** | **High** | Task 0.1-V explicitly exports and validates the `.animation.json`, not just the model. If unreachable via MCP, options: (a) a small custom MCP export tool/PR, (b) a Blockbench headless-ish codec script, or (c) generate `.animation.json` from Java-side schema and skip round-tripping animations through Blockbench. |
| R4 | **Visual verification may be unreliable** — a screenshot may not reveal subtle rig/animation errors. | Medium | Medium | Use both a Blockbench viewport screenshot *and* an in-game screenshot; capture multiple animation frames. This is now a first-class step (data flow #5, #7), not an afterthought. |
| R5 | **Runtime needs a display for two processes** (Blockbench + Minecraft client). | Medium | High | Provision GPU or Xvfb early (Task 0.3); budget for two concurrent display-bound processes. |
| R6 | **Naming collisions between Java registry names and asset filenames/bones** crash the client at load. | Medium | High | Phase 3 guardrails: Java registry + bone names authored first, reused verbatim in every MCP call (data flow #2 → #3). |
| R7 | **Model hallucinates older Forge syntax** (1.12 / 1.16) instead of 1.20.1 NeoForge/GeckoLib. | Medium | Medium | Provide verified 1.20.1 syntax examples in `CLAUDE.md` (Task 3.1). |
| R8 | **Plugin/tool API drift** — the third-party Blockbench MCP plugin changes its tool surface. | Low | Medium | Pin the plugin version; wrap its tool names behind the project `CLAUDE.md` so a rename is a one-file fix. |

### 6. Success Criteria (Phase 1 PoC)

The end-to-end pipeline is considered proven when, from a single natural-language prompt, the system autonomously:

1. Generates compiling Java entity + renderer classes with no manual edits.
2. Drives Blockbench over MCP to produce a rigged, animated model.
3. Exports a **schema-valid** GeckoLib `.geo.json` and `.animation.json` into the correct `src/main/resources/` paths.
4. Launches the client and spawns the entity via spawn egg without a load-time crash.
5. Renders the model and plays the animation loop recognizably (verified by both a Blockbench and an in-game screenshot).

A run that requires manual intervention at any step is a partial pass and must be logged as a gap.

### 7. Phase 0 Research Outcome (Completed)

| Question | Finding | Consequence |
| -------- | ------- | ----------- |
| Is Blender the right GeckoLib tool? | **No.** The official GeckoLib wiki documents Blockbench exclusively and never mentions Blender. Blockbench's format *is* Bedrock geometry; it exports `.geo.json` / `.animation.json` directly. | Tech stack pivoted Blender → Blockbench. Format-conversion risk eliminated. |
| Can an AI drive the tool over MCP? | **Yes.** [`jasonjgardner/blockbench-mcp-plugin`](https://github.com/jasonjgardner/blockbench-mcp-plugin) runs an MCP server inside Blockbench with tool modules: `cubes`, `mesh`, `element`, `armature`, `animation`, `texture`, `paint`, `uv`, `material-instances`, `export`, `camera`, `import`, `project`, `ui`, `history`. | Phase 2 shrinks from "build a `bpy` bridge" to "integrate + pin an existing plugin." |
| Is there a verification path? | **Yes.** The plugin's `camera` tools include screenshot capture. | Visual feedback loop is now built-in (data flow #5). |
| Can it run headless/automated? | **Partial.** Blender MCP can spawn headless but is the wrong format. Blockbench (Electron) has **no headless mode** — needs a live instance, runnable on Xvfb. | New R2/R5; addressed by an Xvfb-hosted long-lived Blockbench service. |

---

## Development Roadmap & Task Breakdown

### Phase 0: Feasibility Spike — ✅ Complete

**Outcome:** Recorded in §7. Decision: **author assets in Blockbench via the Blockbench MCP plugin**, not Blender. Remaining Phase 0 verification folded into Task 1.4 and Task 0.1-V below.

- **Task 0.1-V: Validate GeckoLib Export Fidelity** *(carry-over, do first in Phase 1 — highest-risk check)*
- On a running Blockbench with **both** plugins installed, verify the GeckoLib codec appears in the MCP tool's `list_export_formats`.
- Create a single animated cube via MCP and export **both files separately**: the model (`.geo.json`, via `export.ts` targeting the GeckoLib codec) **and** the animation (`.animation.json`). Confirm each **validates against the GeckoLib schema** and loads in a 1.20.1 test mod — not merely that files appear.
- **The `.animation.json` path is the make-or-break check** (R3b): the animation MCP tool has no file-export method, so confirm whether the generic export tool reaches it. If it does not, decide the fallback (custom export tool, codec script, or Java-side animation-JSON generation) **before** building Phases 2–4 on it.
- **Exit criterion:** a hand-triggered, fully MCP-driven animated cube renders **and animates** in the client. (Closes R3a; resolves or reroutes R3b.)

### Phase 1: Environment & Tooling Baseline

**Objective:** Set up the folder structure, the modding sandbox, and the Blockbench-based authoring service so Claude Code has a reliable pipeline.

- **Task 1.1: Initialize Modding Workspace**
- Download the Minecraft 1.20.1 MDK (Mod Development Kit) for the chosen loader (NeoForge).
- Unpack and initialize the Git repository.
- Run `./gradlew genIntellijRuns` (or VSCode equivalent) to verify the base vanilla environment compiles.

- **Task 1.2: Install GeckoLib Dependencies**
- Update `build.gradle` to include GeckoLib as a dependency (pin the 1.20.1-compatible version).
- Create the required directory structures: `src/main/resources/assets/<mod_id>/geo/` and `.../animations/`.

- **Task 1.3: Configure Blockbench + Plugins**
- Install the Blockbench desktop app and pin its version.
- Install the **"GeckoLib Models & Animations"** plugin (File → Plugins).
- Install the **Blockbench MCP plugin** ([`jasonjgardner/blockbench-mcp-plugin`](https://github.com/jasonjgardner/blockbench-mcp-plugin)) and pin its version; configure the MCP server endpoint.

- **Task 1.4: Stand Up the Display + Blockbench Service**
- Provision a GPU or **Xvfb** virtual display in the pipeline environment.
- Launch Blockbench as a long-lived instance on that display and confirm the MCP endpoint is reachable from Claude Code.
- Confirm `./gradlew runClient` reaches the main menu on the same display. **(Closes R2, R5.)**

### Phase 2: MCP Integration & Tool Contract

**Objective:** Wire Claude Code to the Blockbench MCP plugin and lock down the tool contract the pipeline depends on — no bridge to build, just integrate, verify, and pin.

- **Task 2.1: Connect Claude Code to the Blockbench MCP Server**
- Register the Blockbench MCP endpoint in Claude Code's MCP config.
- Smoke-test the round-trip: prompt Claude to `place_cube`, read back the node list, and capture a screenshot.

- **Task 2.2: Establish the Authoring → Export Recipe**
- Document the canonical tool sequence for one entity: create geometry (`cubes`/`mesh`) → rig (`armature`) → animate (`animation`) → verify (`camera` screenshot) → export (`export`).
- Wrap the export target so `.geo.json` / `.animation.json` land in `src/main/resources/assets/<mod_id>/...` (mirrors Task 0.1-V). Validate schema on every export.

### Phase 3: AI Orchestration & Guardrails

**Objective:** Give Claude Code the strict rules it needs to prevent naming collisions, crashes, and tool-name drift.

- **Task 3.1: Create Project Knowledge Base**
- Write the root `CLAUDE.md` for the mod repo.
- Define strict rules: _Author Java registry names **and** bone/group names first; reuse those exact names verbatim in every Blockbench MCP call._ (Closes R6.)
- Provide verified Minecraft 1.20.1 GeckoLib entity-registration syntax examples, since models sometimes hallucinate 1.12/1.16 Forge syntax. (Closes R7.)
- Record the pinned Blockbench MCP tool names behind a short reference so a plugin rename is a one-file fix. (Closes R8.)

### Phase 4: Proof of Concept (The "Hello World" Mob)

**Objective:** Run the pipeline end-to-end with a simple entity.

- **Task 4.1: The Bouncing Cube Test**
- Prompt Claude Code: _"Create a living green cube entity that bounces up and down."_
- Monitor Claude as it writes `CubeEntity.java` and `CubeRenderer.java`.
- Monitor the MCP calls as Claude drives Blockbench to create a cube, rig it with a single bone, animate a 30-frame bounce loop, and screenshot-verify it before export.

- **Task 4.2: Compilation & Verification**
- Verify the `.geo.json` / `.animation.json` appeared in the correct directories and pass schema validation.
- Launch the Minecraft client (Xvfb display).
- Use a spawn egg to test that the custom model renders and animates correctly in-game, and capture the confirming screenshot (Success Criteria #5).
