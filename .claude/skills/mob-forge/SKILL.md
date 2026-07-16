---
name: mob-forge
description: Author a new GeckoLib mob in apps/mob-forge end-to-end — generate the Java entity/renderer, drive Blockbench over MCP to model + rig + animate, export schema-valid .geo.json / .animation.json, build, and hand off the attended in-game spawn-egg check. Use when the user asks to create or add a Minecraft mob/entity in mob-forge (e.g. "/mob-forge a bouncing green cube", "/mob-forge a hostile flying eyeball that shoots lasers").
---

# mob-forge — prompt-to-play mob pipeline

Author a new Minecraft 1.20.2 NeoForge + GeckoLib mob in `apps/mob-forge` from a
natural-language description. This pipeline is self-contained; the authoritative
technical recipe lives in `apps/mob-forge/CLAUDE.md`. (`apps/prds/minecraft.md`
is a **frozen historical record** of how this pipeline was proven — background
only, not an operating manual; do not update it as part of a mob run.)

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

### 0. Clarify + enrich the prompt (do this before anything else)

A one-line mob prompt is almost always under-specified. **Before locking names,
turn the raw description into a complete build spec** by (a) asking the user
about genuine ambiguities and (b) proactively proposing gap-fillers. Use the
`AskUserQuestion` tool so choices are one tap, and batch related questions.

**Ask when the answer changes what you build** — don't ask what you can sensibly
default. Typical gaps worth a question:

- **Motion / locomotion** — does it walk, hop, fly, slither, or stay idle? What
  plays on idle vs. moving? (These become distinct `animation.<id>.<action>`s.)
- **Behavior / AI** — passive, neutral, or hostile? Does it wander, follow the
  player, flee, or attack? Any special action (shoots, explodes, emits particles)?
- **Appearance** — size/scale, color palette, and defining features (horns, wings,
  glowing eyes). Nail these down before you model in Blockbench.
- **Sound / effects** — ambient, hurt, death sounds? (Optional — offer, don't force.)

**Suggest improvements, don't just collect requirements.** When the prompt is
thin, propose concrete enrichments the user can accept or reject. For example,
for _"a mob of a person"_:

- "Want them to **walk**? I'd add a walk cycle + idle sway." → options: Walk + idle / Idle only / Also a wave gesture
- "How should they **behave**?" → options: Passive wanderer / Follows the player / Hostile (approaches + attacks)
- "Any **look** details?" → e.g. clothing color, held item, hat

Fold the answers into the spec, then confirm the final one-paragraph build spec
back to the user before proceeding. If the user gave a rich, unambiguous prompt
(or says "just pick sensible defaults"), skip the questions and state the
defaults you're assuming instead — never block a clear request on interrogation.

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
**add ear/horn/antenna cubes if the animal has them** (parented to the head bone;
`python3 tools/mob_face.py ears --geo <geo.json> --head <head-bone>` prints the
symmetric `add_group`/`place_cube` values) → **UV-unwrap so each part is
hand-paintable** (repack _after_ the ears exist, so they get their own atlas
rect) → `create_animation` (pass the **bare** name — the plugin auto-prepends
`animation.`) → shape the motion to match the description → `capture_screenshot`
to verify. Confirm names with `list_outline` and `Animation.all` before exporting.

**Model the anatomy the creature actually has.** Ears, horns, tails, wings, and
fins are geometry (cubes/bones), not paint — decide from the build spec which the
animal needs and add them here. Eyes/mouth/nose are painted later (phase 4); a
seal gets eyes + nose, a cat gets ears too.

**Keep authoring the head/face toward +Z, then add a forward-facing root.**
Author the mob the usual way — head/snout at the most positive Z (so
`tools/mob_face.py`'s `front` = +Z face keeps working) — but Minecraft/GeckoLib
render every entity with a 180° yaw flip, so a raw +Z-front model **travels
backwards**. Fix it by wrapping the whole rig in a single root bone rotated
`[0, 180, 0]` (a rigid rotation that preserves box-UV texturing). This is a
**mandatory** step; see **"Facing convention"** in `apps/mob-forge/CLAUDE.md` for
the one-line geo/`.bbmodel` recipe.

**The UV-unwrap step is not optional.** The default `create_texture` +
`place_cube` auto-UV collapses every cube onto a shared 16×16 region, so later
hand-painting one body part bleeds onto all the others. Once all cubes exist,
repack them into a non-overlapping, auto-scaled box-UV atlas per the **"Per-part
UV layout"** recipe in `apps/mob-forge/CLAUDE.md` (`generateTemplate` with
`rearrange_uv`, refill the PNG at the new size, then re-export the geo). This is
what lets the operator customise the mob further after the run.

### 4. Export + validate (R3a/R3b recipe) — and paint the face

Use the `risky_eval` recipe in CLAUDE.md: the `geometry_name` + `Blockbench.export`
intercept for the `.geo.json`, `AnimationCodec.compileFile([anim])` for the
`.animation.json`, write both into
`src/main/resources/assets/mobforge/{geo,animations}/`, and save the texture PNG
to `textures/entity/<id>.png`. Then **validate every file on disk**
(`python3 -m json.tool`) — never trust the tool's success message alone.

**Give the mob a face** (don't ship a blank fill). Author
`tools/faces/<id>.face.json` listing only the features the creature has (eyes,
mouth, nose, nostrils, brows, whiskers — each targeting a bone + cube + face) and
run `python3 tools/mob_face.py paint --spec tools/faces/<id>.face.json --root .`;
it paints them onto the exported atlas from the geo's box-UV rects and re-embeds
the result into the `.bbmodel`. See "Facial features + ears" in
`apps/mob-forge/CLAUDE.md`; `tools/faces/flyingseal.face.json` is the reference.
Keep it minimal — Minecraft faces are only a few pixels wide.

Finally, **save the editable Blockbench source to `blockbench/<id>.bbmodel`**
(`Codecs.project.compile()` → `fs.writeFileSync`, then set `Project.save_path`
and `Project.saved=true`). This is the committed source of truth for later edits;
see "Editing an existing mob" in `apps/mob-forge/CLAUDE.md`.

### 5. Build

`pnpm --filter=mob-forge build` → expect BUILD SUCCESSFUL, and confirm the new
assets packaged into the jar (`unzip -l build/libs/*.jar | grep <id>`).

### 6. Attended in-game verification (done-criteria #4–5)

Ask the operator to launch `pnpm --filter=mob-forge dev`, then spawn the **new**
`<Name> Spawn Egg` from the Spawn Eggs creative tab — **warn them there are
multiple near-identical eggs** and to pick the right label. Confirm the model
renders and the animation plays recognizably. This step is human-in-the-loop.

## Definition of done

A run is a full pass when all of the following hold; report which were met and log any step
that needed manual intervention as a gap (a run with manual intervention is a
**partial** pass).

1. Compiling Java entity + renderer classes, no manual edits.
2. Blockbench driven over MCP to a rigged, animated model.
3. Schema-valid GeckoLib `.geo.json` + `.animation.json` in the correct
   `src/main/resources/assets/mobforge/{geo,animations}/` paths.
4. Client launches and the spawn egg spawns the entity with no load-time crash.
5. The model renders and the animation loop plays recognizably (Blockbench +
   in-game confirmation).
6. Every cube has a **non-overlapping** UV rectangle on an auto-scaled atlas (no
   cubes left at `uv:[0,0]`), so the operator can hand-paint any part afterward
   without bleed.
7. The mob has the **anatomy and face its species implies** — ear/horn/etc.
   geometry where applicable, and painted facial features (eyes and, as
   appropriate, mouth/nose) instead of a blank fill. Only features the creature
   actually has (`tools/mob_face.py` + `tools/faces/<id>.face.json`).
8. The mob **travels forwards** — head leading, not tail-first. Any
   non-symmetric rig carries the `[0, 180, 0]` `<id>_root` wrapper bone (see
   "Facing convention" in `apps/mob-forge/CLAUDE.md`); confirm in-game that it
   walks/flies the way it faces.

## On completion

- Report against the Definition of done above.
- **Do NOT commit** unless the user explicitly asks.
