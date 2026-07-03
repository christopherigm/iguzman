---
name: mob-forge
description: Author a new GeckoLib mob in apps/mob-forge end-to-end — generate the Java entity/renderer, drive Blockbench over MCP to model + rig + animate, export schema-valid .geo.json / .animation.json, build, and hand off the attended in-game spawn-egg check. Use when the user asks to create or add a Minecraft mob/entity in mob-forge (e.g. "/mob-forge a bouncing green cube", "/mob-forge a hostile flying eyeball that shoots lasers").
---

# mob-forge — prompt-to-play mob pipeline

Author a new Minecraft 1.20.2 NeoForge + GeckoLib mob in `apps/mob-forge` from a
natural-language description, following the pipeline proven in PRD Phase 4
(`apps/prds/minecraft.md`).

**The mob to build is described in this skill's arguments** (the text after
`/mob-forge`). If no description was given, ask for one before starting.

## Read these FIRST — source of truth, do not duplicate their contents

- **`apps/mob-forge/CLAUDE.md`** — the authoritative recipe: NeoForge 1.20.2
  syntax rules (R7), naming discipline (R6), the Blockbench MCP tool contract,
  the `risky_eval` export recipe (R3a/R3b), and every known gotcha. Follow it
  verbatim; **if it ever conflicts with this skill, CLAUDE.md wins.**
- The existing `Cube*` / `TestCube*` Java classes and the `geo/` + `animations/`
  assets are your working templates — mirror their structure exactly.

## Precondition (attended mode — do not skip)

This pipeline drives a **live, operator-launched Blockbench**; it cannot author
headless. Before touching Blockbench:

1. Confirm with the operator that Blockbench is open with the GeckoLib + MCP
   plugins and the MCP server is live at `http://localhost:3000/bb-mcp`.
2. Smoke-test the bridge with `get_project_info` (either a project summary or a
   "no project open" error proves the round-trip works).

If the MCP call errors as unreachable, **stop and ask the operator to open
Blockbench** — never proceed blind.

## Pipeline

Work top-to-bottom; each phase gates the next. Track progress with the task tool.

### 1. Lock the names first (closes R6)
Choose the entity id and reuse it VERBATIM everywhere before writing any code:
registry id, `geo/<id>.geo.json`, `animations/<id>.animation.json`, animation ids
`animation.<id>.<action>`, the root bone/group name, the texture name, and
`<id>_spawn_egg`. Write the list down; every later step must match it exactly.

### 2. Java layer (schema-first — PRD data-flow step 2)
Mirror `CubeEntity` / `CubeModel` / `CubeRenderer`. Register the entity, spawn
egg, attributes, creative-tab entry, and renderer; add `lang/en_us.json` keys and
the spawn-egg item model. Obey the 1.20.2 syntax rules in CLAUDE.md (injected
`IEventBus`, `META-INF/mods.toml` with `mandatory=true`, `DeferredSpawnEggItem`,
renderer via `EntityRenderersEvent` listener, two-arg `ResourceLocation`).

### 3. Author in Blockbench over MCP (watched live)
`create_project` (format **`geckolib_model`**) → `create_texture` (geometry needs
a texture BEFORE `place_cube`) → `place_cube` / mesh inside the named bone →
`create_animation` (pass the **bare** name — the plugin auto-prepends
`animation.`) → shape the motion to match the description → `capture_screenshot`
to verify. Confirm names with `list_outline` and `Animation.all` before exporting.

### 4. Export + validate (R3a/R3b recipe)
Use the `risky_eval` recipe in CLAUDE.md: the `geometry_name` + `Blockbench.export`
intercept for the `.geo.json`, `AnimationCodec.compileFile([anim])` for the
`.animation.json`, write both into
`src/main/resources/assets/mobforge/{geo,animations}/`, and save the texture PNG
to `textures/entity/<id>.png`. Then **validate every file on disk**
(`python3 -m json.tool`) — never trust the tool's success message alone.
Finally, **save the editable Blockbench source to `blockbench/<id>.bbmodel`**
(`Codecs.project.compile()` → `fs.writeFileSync`, then set `Project.save_path`
and `Project.saved=true`). This is the committed source of truth for later edits;
see "Editing an existing mob" in `apps/mob-forge/CLAUDE.md`.

### 5. Build
`pnpm --filter=mob-forge build` → expect BUILD SUCCESSFUL, and confirm the new
assets packaged into the jar (`unzip -l build/libs/*.jar | grep <id>`).

### 6. Attended in-game verification (Success Criteria #4–5)
Ask the operator to launch `pnpm --filter=mob-forge dev`, then spawn the **new**
`<Name> Spawn Egg` from the Spawn Eggs creative tab — **warn them there are
multiple near-identical eggs** and to pick the right label. Confirm the model
renders and the animation plays recognizably. This step is human-in-the-loop.

## On completion
- Report which Success Criteria (PRD §6) were met, and log any step that needed
  manual intervention as a gap.
- Update `apps/prds/minecraft.md` only if this run represents a real milestone.
- **Do NOT commit** unless the user explicitly asks.
