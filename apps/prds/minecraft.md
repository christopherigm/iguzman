## Product Requirements Document (PRD)

> **Revision note (Phase 0 outcome):** The original design authored 3D assets in **Blender** via a custom Python `bpy` MCP bridge. Phase 0 research (see §7) found that Blender is *not* GeckoLib's supported tool — **Blockbench** is the official and only documented authoring tool, and it exports GeckoLib `.geo.json` / `.animation.json` natively with no format conversion. A mature, ready-made **Blockbench MCP plugin** already exposes the create/rig/animate/export/screenshot tools this project needed to build from scratch. This document has been rewritten around Blockbench.

> **Revision note (attended, human-observable mode):** Phase 1 runs Blockbench (and, during verification, the Minecraft client) as **user-launched, visible desktop apps on the operator's own display** — *not* as background/headless services. The user opens the tools **before** issuing the prompt, then watches the model get created, rigged, and animated in real time as Claude Code drives Blockbench over MCP. This makes asset generation a live, observable process with a human in the loop, and turns the screenshot-based verification steps into a confirmation of what the operator is already watching. Unattended/headless operation on a virtual framebuffer (**Xvfb**) is retained only as a future CI path (see §4, R2/R5) and is out of scope for Phase 1.

> **Revision note (loader tooling, 1.20.1 → 1.20.2):** Bootstrapping Phase 1 revealed that **Minecraft 1.20.1 has no maintained NeoForge toolchain.** NeoForge's own NeoGradle MDKs — the `net.neoforged.*` API this project targets — begin at **1.20.2**; the only 1.20.1 MDK is a ModDevGradle-*legacyforge* scaffold that builds against MinecraftForge (`net.minecraftforge.*`) with a no-arg mod constructor. To keep *genuine* NeoForge without rewriting the mod against legacy Forge, the version lock moves to **Minecraft 1.20.2 / NeoForge 20.2.x / GeckoLib 4.3.x** (Java 17 unchanged; the mod entry now takes an injected `IEventBus`). The Blockbench asset pipeline is version-agnostic and unaffected. Version references below have been updated to 1.20.2.

### 1. Product Vision

An automated, AI-driven development environment for creating Minecraft mods. Claude Code acts as the central orchestrator: it generates the Java game logic **and** drives 3D model creation, rigging, and keyframe animation inside **Blockbench** over the Model Context Protocol. Because Blockbench's native format *is* Bedrock geometry, assets export directly into the mod repository as GeckoLib-ready `.geo.json` and `.animation.json` — no lossy mesh conversion — creating a seamless prompt-to-play pipeline with a built-in visual verification step.

### 2. Tech Stack & Version Locking

To ensure compatibility across the AI, the 3D software, and the game engine, we are locking the following versions:

- **Minecraft Version:** 1.20.2 (currently the most stable and widely supported version for complex modding frameworks).
- **Mod Loader:** NeoForge or Fabric (NeoForge recommended for 1.20+ entity modding).
- **3D Authoring Tool:** **Blockbench** (latest stable desktop/Electron build) with the **"GeckoLib Models & Animations"** plugin. This is GeckoLib's official authoring tool; it emits `.geo.json` and `.animation.json` natively.
- **AI ↔ 3D Bridge:** **Blockbench MCP plugin** ([`jasonjgardner/blockbench-mcp-plugin`](https://github.com/jasonjgardner/blockbench-mcp-plugin)) — runs an HTTP MCP server inside Blockbench (default `http://localhost:3000/bb-mcp`) exposing modeling, rigging, animation, texture, export, and camera/screenshot tools to Claude Code.
- **AI Model:** Claude Opus 4.8 (native engine for Claude Code; best in class for complex Java scripting and multi-tool orchestration).
- **Animation Framework:** GeckoLib for Minecraft 1.20.2.
- **Bridge Protocol:** Model Context Protocol (MCP).
- **Language:** Java 17 (required for Minecraft 1.20.2).
- **Runtime Display:** The **operator's own desktop display**. The user launches the Blockbench Electron app (no headless CLI mode exists) and, during verification, the Minecraft client, so they can watch model changes happen live as Claude Code drives the tools over MCP. A GPU or virtual framebuffer (**Xvfb**) is only needed for a future unattended/CI mode where no operator is watching (out of scope for Phase 1).

### 3. Core Architecture & Data Flow

0. **Pre-flight (user setup):** Before issuing the prompt, the user **opens Blockbench** (with the GeckoLib and MCP plugins loaded) on their desktop and confirms the MCP endpoint is live. Optionally the user also opens the Minecraft client. These apps stay visible on the operator's screen for the whole run so the model is authored **in front of them** — Claude connects to the already-running instances rather than spawning them.
1. **Prompt:** The user issues a single natural-language command to Claude Code in the terminal (e.g., _"Create a hostile flying eyeball mob that shoots lasers"_).
2. **Logic & Schema Generation:** Claude Code generates the Java entity classes and rendering registries, and defines the explicit naming conventions for the required assets **first** (e.g., `eyeball.geo.json`, `animation.eyeball.fly`, bone/group names).
3. **MCP Handoff:** Claude Code calls the Blockbench MCP tools, passing the exact names it just committed to in the Java layer.
4. **Asset Generation (watched live):** The plugin drives the **user's open Blockbench window** to create the geometry (cubes/groups/mesh), build the bone rig (armature), and author keyframe animations matching Claude's schema — all in the native GeckoLib format. The operator sees each step appear on screen in real time.
5. **Visual Verification:** Claude captures a Blockbench viewport screenshot (camera tool) to confirm the model and animation look correct, and iterates if not. Because the window is visible, the operator can independently confirm — or flag — what Claude reports.
6. **Automated Export:** Claude calls the plugin's export tool to write `.geo.json` and `.animation.json` (plus any texture) directly into `src/main/resources/assets/<mod_id>/...`.
7. **Compilation & In-Game Test:** Claude finalizes the Java code and runs `./gradlew runClient` (on the operator's display) to launch Minecraft — or attach to the client the user already opened — spawn the entity, and capture an in-game screenshot for final verification while the user watches.

### 4. Out of Scope (Phase 1)

- **Complex Texturing:** Blockbench's paint/UV MCP tools can apply solid colors, simple palettes, and basic procedural fills. Highly detailed, hand-painted UV maps remain out of scope for AI generation and will require manual polish.
- **Multiplayer Server Synchronization:** Phase 1 focuses strictly on single-player client testing.
- **Unattended / Headless Authoring:** Phase 1 is deliberately **attended** — the user opens Blockbench (and the client) on their own display and observes the run. Blockbench has no official CLI/headless mode, so a fully unattended pipeline would run a live instance on a virtual display (Xvfb) with no operator watching. Building that headless/CI harness is out of scope for Phase 1 and deferred to a later phase.

### 5. Key Risks & Mitigations

| #  | Risk | Likelihood | Impact | Mitigation |
| -- | ---- | ---------- | ------ | ---------- |
| R1 | ~~Blender is not GeckoLib's standard authoring tool.~~ **Resolved in Phase 0** by adopting Blockbench, the official GeckoLib tool. | — | — | Closed. See §7. |
| R2 | **Blockbench cannot run headless.** It is an Electron GUI app; the MCP server registers in the app UI, so a live instance must stay running. | High | Low | In attended mode this is a **feature, not a bug**: the **user launches Blockbench on their own desktop before the run** and keeps it visible so they watch authoring live. Claude connects to that running instance, never spawns it. (Xvfb-hosted long-lived service is only needed for the deferred unattended/CI mode.) |
| R3a | **Model export (`.geo.json`) depends on a plugin chain.** The MCP `export.ts` tool is codec-agnostic — it dispatches to whatever codec Blockbench has registered; GeckoLib's `.geo.json` codec is provided by the *separate* "GeckoLib Models & Animations" plugin. Export works only if that plugin is installed and its codec id is passed / is the active project format. | Medium | High | Task 0.1-V: confirm the GeckoLib codec appears in `list_export_formats` and that MCP export emits schema-valid `.geo.json`. Pin both plugins + Blockbench. |
| R3b | **Animation export (`.animation.json`) is the real unknown.** The MCP `animation.ts` tool only *creates/manipulates* animations in-memory (`Animator.loadFile`, Bedrock `format_version 1.8.0`) — it has **no file-export method**, and `.animation.json` is a separate Blockbench export path from the model. It is unproven that the generic `export.ts` tool can reach the animation file. | **High** | **High** | Task 0.1-V explicitly exports and validates the `.animation.json`, not just the model. If unreachable via MCP, options: (a) a small custom MCP export tool/PR, (b) a Blockbench headless-ish codec script, or (c) generate `.animation.json` from Java-side schema and skip round-tripping animations through Blockbench. |
| R4 | **Visual verification may be unreliable** — a screenshot may not reveal subtle rig/animation errors. | Medium | Medium | Use both a Blockbench viewport screenshot *and* an in-game screenshot; capture multiple animation frames. This is now a first-class step (data flow #5, #7), not an afterthought. |
| R5 | **Runtime needs a display for two processes** (Blockbench + Minecraft client). | Low | Medium | In attended mode both run on the **operator's own desktop**, which they open themselves — no separate provisioning. Budget for two concurrent display-bound windows on that machine. (GPU/Xvfb provisioning applies only to the deferred unattended mode.) |
| R6 | **Naming collisions between Java registry names and asset filenames/bones** crash the client at load. | Medium | High | Phase 3 guardrails: Java registry + bone names authored first, reused verbatim in every MCP call (data flow #2 → #3). |
| R7 | **Model hallucinates older Forge syntax** (1.12 / 1.16) instead of 1.20.2 NeoForge/GeckoLib. | Medium | Medium | Provide verified 1.20.2 syntax examples in `CLAUDE.md` (Task 3.1). |
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
| Can it run headless/automated? | **Partial.** Blender MCP can spawn headless but is the wrong format. Blockbench (Electron) has **no headless mode** — needs a live instance. | Phase 1 embraces this as **attended mode**: the user opens Blockbench on their own display and watches the run (R2/R5). An Xvfb-hosted long-lived service is only required for the deferred unattended/CI mode. |

---

## Development Roadmap & Task Breakdown

### Phase 0: Feasibility Spike — ✅ Complete

**Outcome:** Recorded in §7. Decision: **author assets in Blockbench via the Blockbench MCP plugin**, not Blender. Remaining Phase 0 verification folded into Task 1.4 and Task 0.1-V below.

- **Task 0.1-V: Validate GeckoLib Export Fidelity** — ✅ **Complete (full pass).** A fully MCP-driven animated `testcube` was authored in Blockbench, exported to schema-valid `geo/testcube.geo.json` + `animations/testcube.animation.json`, and **rendered and spun in the 1.20.2 client** via a GeckoLib entity + spawn egg. **R3a closed; R3b resolved** (not merely rerouted). Recipe + gotchas captured in `apps/mob-forge/CLAUDE.md`.
  - **Key reroute — there is no "GeckoLib codec."** `list_export_formats` never shows one; the `geckolib_model` format reuses the `.bbmodel` (`project`) codec. Export is done by the plugin's *menu actions* (`export_geckolib_model`, `export_geckolib_animations`), not the MCP codec-based `export_model` tool. So the original "`export.ts` targeting the GeckoLib codec" plan does not apply.
  - **R3b make-or-break, resolved:** `export_geckolib_animations` delegates to Blockbench's built-in Bedrock `export_animation_file` (which opens a blocking dialog). The dialog-free path that works over MCP: intercept `Blockbench.export` for the model, and call `AnimationCodec.getCodec().compileFile([anim])` for the animation, writing both to disk via `risky_eval` + Node `fs`. No custom export tool or Java-side generation was needed.
  - **Exit criterion met:** hand-triggered, fully MCP-driven animated cube renders **and animates** in the client.
  - Bugs found & fixed en route (all in `apps/mob-forge/CLAUDE.md`): GeckoLib Blockbench plugin was not installed (installed `geckolib` v4.2.5 over MCP); `create_animation` double-prefixes `animation.`; `mods.toml` needs 20.2's `mandatory=true` not `type="required"`; spawn eggs need an item model.

### Phase 1: Environment & Tooling Baseline

**Objective:** Set up the folder structure, the modding sandbox, and the Blockbench-based authoring service so Claude Code has a reliable pipeline.

> **Revision note (monorepo integration):** Rather than a standalone Git repo, the mod lives **inside this Turborepo monorepo** as `apps/mob-forge` (mod_id `mobforge`, loader **NeoForge**). It is a workspace member via a thin `package.json` that maps Turbo tasks onto `./gradlew`. Regenerable heavyweight artifacts — the Minecraft game, the NeoForge MDK caches, and Gradle build output — are **downloaded on demand and gitignored**, never committed. A cross-platform CLI, `cli/setup-minecraft` (`pnpm setup-minecraft`), automates the toolchain (Java 17, Blockbench + plugins, MDK bootstrap + GeckoLib injection), mirroring the repo's other `cli/*` setup scripts.

- **Task 1.1: Initialize Modding Workspace (as `apps/mob-forge`)**
- Scaffold `apps/mob-forge` in the monorepo: committed source skeleton (`MobForge.java`, `META-INF/mods.toml`, `pack.mcmeta`, `assets/mobforge/{geo,animations}/`), `gradle.properties` (version lock), thin `package.json`, `.gitignore`, `CLAUDE.md`, `README.md`. ✅ Done.
- Run `pnpm setup-minecraft` to install Java 17 and fetch the pinned **NeoForge 1.20.2 MDK** Gradle scaffold into `apps/mob-forge` (the MDK's example src and gradle.properties are intentionally **not** copied — our committed ones stay authoritative). No separate `git init` — the monorepo already versions it.
- Verify the base environment compiles via `pnpm --filter=mob-forge build` (wraps `./gradlew build`); `./gradlew genIntellijRuns` remains available for IDE run configs.

- **Task 1.2: Install GeckoLib Dependencies**
- GeckoLib pins live in `apps/mob-forge/gradle.properties` (`geckolib_version`); `cli/setup-minecraft` injects the Cloudsmith maven repo + `software.bernie.geckolib:geckolib-neoforge-1.20.2:<version>` dependency into the MDK's `build.gradle` on bootstrap (idempotent, marker-guarded).
- The required asset directories (`src/main/resources/assets/mobforge/geo/` and `.../animations/`) are committed with the scaffold. ✅ Done.

- **Task 1.3: Configure Blockbench + Plugins**
- `cli/setup-minecraft` installs the Blockbench desktop app cross-platform (macOS Homebrew cask; Linux Flatpak/snap/AppImage).
- Plugin install is a **guided** step (Blockbench is a GUI/Electron app, attended mode): the script prints the exact in-app steps to add the **"GeckoLib Models & Animations"** plugin and the **Blockbench MCP plugin** ([`jasonjgardner/blockbench-mcp-plugin`](https://github.com/jasonjgardner/blockbench-mcp-plugin)), then configure the MCP server endpoint (`http://localhost:3000/bb-mcp`). Pin plugin versions via the app.

- **Task 1.4: User Opens the Tools (Attended Pre-flight)**
- Document the operator pre-flight checklist: **open Blockbench** (with GeckoLib + MCP plugins) on the desktop and confirm the MCP endpoint is reachable from Claude Code.
- Position the Blockbench window so model changes are visible during the run; optionally open the Minecraft client too.
- Confirm `./gradlew runClient` reaches the main menu on the operator's display. **(Closes R2, R5 for attended mode.)**
- *(Deferred: the equivalent unattended setup on an Xvfb virtual display is a later-phase task, not Phase 1.)*

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
- Provide verified Minecraft 1.20.2 GeckoLib entity-registration syntax examples, since models sometimes hallucinate 1.12/1.16 Forge syntax. (Closes R7.)
- Record the pinned Blockbench MCP tool names behind a short reference so a plugin rename is a one-file fix. (Closes R8.)

### Phase 4: Proof of Concept (The "Hello World" Mob)

**Objective:** Run the pipeline end-to-end with a simple entity.

- **Task 4.1: The Bouncing Cube Test**
- Prompt Claude Code: _"Create a living green cube entity that bounces up and down."_
- Monitor Claude as it writes `CubeEntity.java` and `CubeRenderer.java`.
- Monitor the MCP calls as Claude drives Blockbench to create a cube, rig it with a single bone, animate a 30-frame bounce loop, and screenshot-verify it before export.

- **Task 4.2: Compilation & Verification**
- Verify the `.geo.json` / `.animation.json` appeared in the correct directories and pass schema validation.
- Launch the Minecraft client on the operator's display (or attach to the one the user already opened).
- Use a spawn egg to test that the custom model renders and animates correctly in-game, and capture the confirming screenshot (Success Criteria #5).
