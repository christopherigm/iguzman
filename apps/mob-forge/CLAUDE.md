# CLAUDE.md — mob-forge

Guidance for Claude Code when working in `apps/mob-forge`. This is a **Minecraft
1.20.2 NeoForge mod** (Gradle/Java), not a Next.js app — the conventions in
`apps/CLAUDE.md` (i18n, `@repo/ui` props, `next/image`, etc.) **do not apply
here**. It is a Turborepo workspace member only through a thin `package.json`
wrapper that shells out to `./gradlew`.

For the project's history and rationale (the Blender→Blockbench pivot, the
1.20.1→1.20.2 tooling decision), see the **archived** spec in
`apps/prds/minecraft.md`. That PRD is a frozen historical record — this file is
the authoritative recipe for building mobs.

### Risk glossary (the `Rn` shorthand used below)

These IDs originate in the PRD's risk register but are self-defined here so this
file stands alone:

- **R3a** — GeckoLib model export depends on the plugin chain; there is no
  GeckoLib export *codec* (see the export recipe).
- **R3b** — animation export has no MCP file-export method; resolved via the
  `risky_eval` `AnimationCodec.compileFile` path.
- **R6** — naming collisions between Java registry names and asset/bone names
  crash the client on load; author names first, reuse verbatim.
- **R7** — the model hallucinates older Forge (1.12/1.16) syntax; pin to the
  verified 1.20.2 NeoForge syntax rules below.
- **R8** — the third-party Blockbench MCP plugin can drift its tool surface; the
  tool contract below is the one-file place to fix a rename.

## What lives here vs. what is generated

- **Committed:** our Java (`src/main/java`), our assets (`src/main/resources`,
  including GeckoLib `geo/` + `animations/`), the **editable Blockbench sources
  in `blockbench/<id>.bbmodel`** (see "Editing an existing mob" below),
  `gradle.properties`, this file.
- **Bootstrapped by `pnpm setup-minecraft`, then committed:** the official
  NeoForge 1.20.2 MDK Gradle files (`build.gradle`, `settings.gradle`, the
  `gradlew` wrapper) with GeckoLib injected. Never hand-author `build.gradle`
  from memory — the CLI pins the official MDK to avoid stale-Forge drift (R7).
- **Never committed (gitignored, regenerable):** `build/`, `.gradle/`, `run/`,
  the downloaded Minecraft game + decompiled sources, and all Gradle caches.

If `./gradlew` is missing, the project has not been bootstrapped — run
`pnpm setup-minecraft` from the repo root.

## Version lock

All versions live in **`gradle.properties`** (single source of truth): Minecraft
`1.20.2`, NeoForge `20.2.x`, GeckoLib `4.3.x`, Java **17**. Bump there, then re-run
`pnpm setup-minecraft`.

> **Why 1.20.2, not 1.20.1?** 1.20.1 has no maintained NeoGradle/`net.neoforged`
> MDK — the only 1.20.1 MDK is a ModDevGradle-*legacyforge* scaffold targeting
> MinecraftForge (`net.minecraftforge.*`). NeoForge's own NeoGradle MDKs begin at
> 1.20.2, so 1.20.2 is the earliest version that gives genuine NeoForge tooling.

## NeoForge 1.20.2 syntax rules (closes R7)

The model tends to hallucinate 1.12/1.16 Forge or wrong-version NeoForge APIs.
For the 20.2.x (1.20.2) line specifically:

- Mod entry uses an **injected-`IEventBus` constructor** — `public MobForge(IEventBus modEventBus)`;
  FML passes the mod event bus in by parameter type. Do **not** use the
  1.20.1/Forge-style no-arg constructor + `FMLJavaModLoadingContext.get().getModEventBus()`.
- Metadata file is **`META-INF/mods.toml`** (the `neoforge.mods.toml` rename comes later, in 1.20.5+).
- In `mods.toml`, dependencies use the Forge-era boolean **`mandatory=true`**, *not* the
  newer **`type="required"`** (that arrives in 20.3/1.20.4). On 20.2 the wrong one
  fails mod discovery with `InvalidModFileException: Missing required field mandatory`,
  which cascades into a misleading `Failed to find system mod: minecraft`.
- Entity/item/renderer registration verified against 20.2: `DeferredRegister.createItems` →
  `DeferredItem`; spawn eggs use `net.neoforged.neoforge.common.DeferredSpawnEggItem`;
  register renderers on `EntityRenderersEvent.RegisterRenderers` via a `Dist.CLIENT`-guarded
  `modEventBus.addListener` (avoid `@EventBusSubscriber` — its `Bus` enum names drift).
  A spawn egg needs `assets/<mod>/models/item/<id>.json` →
  `{ "parent": "minecraft:item/template_spawn_egg" }` or its inventory icon 404s.
- Package root is `com.iguzman.mobforge`; `MOD_ID = "mobforge"`.
- GeckoLib entities extend the GeckoLib base and implement `GeoEntity` /
  `getAnimatableInstanceCache()`; register the renderer on the mod event bus.

## Naming discipline (closes R6 — asset/registry collisions crash on load)

**Author Java registry names AND Blockbench bone/group names FIRST, then reuse
those exact strings verbatim in every MCP call and every asset path.** For an
entity `eyeball`:

- registry id: `mobforge:eyeball`
- model: `assets/mobforge/geo/eyeball.geo.json`
- animations: `assets/mobforge/animations/eyeball.animation.json`, ids like
  `animation.eyeball.fly`
- bone/group names in Blockbench must match what the Java animation controller
  references.

## Blockbench MCP tool contract (closes R8 — pin against plugin drift)

Assets are authored in **Blockbench** (opened by the operator, watched live) and
driven over the [`jasonjgardner/blockbench-mcp-plugin`](https://github.com/jasonjgardner/blockbench-mcp-plugin)
HTTP MCP server (default `http://localhost:3000/bb-mcp`). Canonical sequence:

`create_project` (**format `geckolib_model`**) → `create_texture` → `place_cube`
(geometry, **+ `left_ear`/`right_ear` cubes for eared animals** — see "Facial
features + ears" below) → `add_group` (bone) → **UV-unwrap for per-part
paintability** (see "Per-part UV layout" below) → `create_animation` (keyframes) →
`capture_screenshot` (verify) → **export via `risky_eval`** (see recipe below) →
**paint facial features** (`tools/mob_face.py paint`, see below) →
**save the editable `blockbench/<id>.bbmodel`** (`Codecs.project.compile()` →
`fs.writeFileSync`, then set `Project.save_path`/`Project.saved`).

### Export recipe (verified in Task 0.1-V — R3a/R3b closed)

Two hard facts learned by driving the real plugin, both contradicting the naive
"pick the GeckoLib codec in `export_model`" plan:

1. **The GeckoLib plugin registers NO export codec.** `list_export_formats` never
   shows a GeckoLib entry; its `geckolib_model` format reuses the `project`
   (`.bbmodel`) codec. Export is done by two *menu actions*, not codecs:
   `export_geckolib_model` (→ `.geo.json`) and `export_geckolib_animations`.
2. **`export_geckolib_animations` just delegates to the built-in
   `export_animation_file`** — GeckoLib animations *are* plain Bedrock
   `.animation.json` (`format_version 1.8.0`). That built-in opens a confirmation
   **Dialog**, so triggering it over MCP hangs waiting for a click.

So the MCP `export_model` tool (codec-based) **cannot** reach either GeckoLib
file. The working, dialog-free path is `risky_eval`:

- **Model `.geo.json`:** set `Project.geometry_name='<entity>'` (so the identifier
  becomes `geometry.<entity>`), then intercept `Blockbench.export` (stash
  `options.content`, call `cb('x')`, return) and `BarItems.export_geckolib_model.trigger()`;
  the stashed content is the `.geo.json`. Restore `Blockbench.export` after.
- **Animation `.animation.json`:** compile directly, no dialog:
  `autoStringify((AnimationCodec.getCodec()||AnimationCodec.codecs.bedrock).compileFile([anim]))`.
- **Write both to disk** with the renderer's Node `fs` (`require('fs').writeFileSync(path, content)`)
  straight into `src/main/resources/assets/mobforge/{geo,animations}/`. Then
  **validate on disk** (`python3 -m json.tool`) — never trust the tool's success
  response alone (R3b).

> `risky_eval` rejects any code containing `//` or `/* */` — no comments, and
> build paths without `//`.

### Plugin install is programmatic (not just a GUI step)

The **"GeckoLib Models & Animations"** plugin (store id **`geckolib`**; *not* the
deprecated `animation_utils`) can be installed over MCP when the store is loaded:
`Plugins.all.find(p=>p.id==='geckolib').download(true)`. It registers the
`geckolib_model` format. (Its Blockbench-plugin version, e.g. 4.2.5, is
independent of the `geckolib_version` Java pin in `gradle.properties`.)

### Animation-name double-prefix gotcha (R6-adjacent)

`create_animation` (in `geckolib_model` format) **auto-prepends `animation.`** to
the name you pass. Passing `animation.testcube.spin` yields the broken key
`animation.animation.testcube.spin`. Pass the **bare** name (`testcube.spin`), or
fix it after by setting `Animation.all[i].name` to the exact final key
`animation.<entity>.<action>` — that string is what lands in the JSON and what the
Java `AnimationController` must reference verbatim.

**`place_cube` always requires a `texture`.** Auto-UV is not optional despite the
tool schema's defaults — calling `place_cube` with no texture (including
`faces: false` or `faces: []`) fails with `No texture found for "undefined"`, and
an empty Generic Model project has zero textures. So the geometry step must
`create_texture` first (e.g. `fill_color` + `layer_name`) and pass its name as
`texture`. Per the naming discipline above, name that texture up front and reuse
the same string. (There is no delete-texture MCP tool; remove a stray one via
`risky_eval` → `Texture … .remove()`.)

### Per-part UV layout (so each body part is hand-paintable)

**The goal:** after the pipeline finishes, the operator can open the mob in
Blockbench and paint (or add detail to) any one body part *without the paint
bleeding onto other parts*. That only works when **every cube owns its own
non-overlapping rectangle** on the texture — one shared atlas, distinct regions,
not one region shared by all.

**The default pipeline does the opposite.** `create_texture` forces a **16×16**
canvas (it ignores width/height in `geckolib_model`), and `place_cube` auto-UVs
every cube into that tiny space, so they all **collapse to `uv:[0,0]`** and
overlap completely (see `cube`/`testcube`/the pre-fix `flyingseal`). Painting the
head then paints the whole body. `xenomorph` is the counter-example — a 128×128
atlas with a distinct rect per cube.

**Fix — repack to a non-overlapping, auto-scaled box-UV atlas** once all
`place_cube`s exist and **before** export. Over `risky_eval`:

1. Select every element (`selectAll()` is unreliable — set `el.selected=true` on
   each `Outliner.elements` entry *and* push it into the global `selected` array).
2. Stub `Blockbench.showMessageBox` to a no-op for the call — sub-pixel faces
   (e.g. 0.7-wide claw tubes) pop a blocking warning dialog that hangs MCP.
3. `TextureGenerator.generateTemplate({rearrange_uv:true, box_uv:true,
   double_use:false, power:true, padding:0}, cb)` — pass a **callback fn as the
   2nd arg** so it covers all elements in single-texture formats. This repacks
   non-overlapping box-UV offsets for every cube and grows
   `Project.texture_width/height` to the smallest power-of-two atlas that fits
   them at ~1 texel per block-unit (**auto-scaled** — `xenomorph`→128,
   `flyingseal`→64; never hardcode 16).
4. `generateTemplate` **rearranges UVs but does NOT paint the bitmap over MCP.**
   So afterward, regenerate the PNG at the new `texture_width/height`, filled with
   the mob's base colour (a flat fill is fine — it is the blank canvas the
   operator paints on), and load it back (`t.fromDataURL(url); t.updateSource(url);
   Canvas.updateAll()`).
5. **Re-export `geo.json`** — the `uv` offsets and `texture_width/height` changed,
   so an un-re-exported model still samples `uv:[0,0]` in game.

Then **verify the PNG's real dimensions on disk** (`struct.unpack` of the IHDR) —
the tool's success message and byte count will not reveal a wrong-size canvas.

> The box-UV net Blockbench stores per face (needed only if you repack UVs
> deterministically *outside* Blockbench, e.g. a retrofit script): for a cube
> `size=(w,h,d)` at offset `(u,v)` —
> `east=[u, v+d, u+d, v+d+h]`, `north=[u+d, v+d, u+d+w, v+d+h]`,
> `west=[u+d+w, v+d, u+2d+w, v+d+h]`, `south=[u+2d+w, v+d, u+2d+2w, v+d+h]`,
> `up=[u+d+w, v+d, u+d, v]` (both axes flipped), `down=[u+d+2w, v, u+d+w, v+d]`.
> The game only reads the 2-element `uv:[u,v]` offset and derives faces itself;
> the `.bbmodel` stores the full rects above and must agree with them.

## Facial features + ears (a face, not a blank fill) — `tools/mob_face.py`

A mob with eyes, a mouth, and a nose reads as a creature; a flat-filled atlas
reads as a prop. Because the per-part UV step above gives **every cube its own
non-overlapping rectangle**, we can paint one part's face without bleeding onto
the others — that is exactly what `tools/mob_face.py` automates. It is
deterministic and needs no Blockbench (painting the atlas directly is the
"texture-only tweak" fast path); it uses the same box-UV net documented above to
find each part's face on the atlas.

**Dependencies:** Python 3 + [Pillow](https://pillow.readthedocs.io/). `pnpm
setup-minecraft` does not install them (it is Bash-only). Linux/macOS usually
ship Python 3, so just add Pillow (`python3 -m pip install --user Pillow`); on
Windows install Python first (`winget install -e --id Python.Python.3.12`), then
`py -m pip install Pillow`, and use `py` in place of `python3` in the commands
below.

**Decide the anatomy first.** From the build spec, list which of eyes, mouth,
nose, nostrils, brows, whiskers, and **ears** the animal actually has — a seal
has eyes + nose + a mouth and *no* external ears; a cat has all of them. Only
add what the creature has; a spurious mouth on an eyeball is worse than none.

**Eyes/mouth/nose = paint (`paint`).** Author a spec at
`tools/faces/<id>.face.json` that names, per feature, the target **bone + cube
index + face** (`front` = the mob's +Z face by convention) plus normalized
placement, then run:

```bash
python3 tools/mob_face.py paint --spec tools/faces/<id>.face.json --root .
```

It computes each feature's pixel rect from the geo, paints it, writes the PNG,
**and re-embeds the result into `blockbench/<id>.bbmodel`** so source and build
output stay in sync. Use `tools/mob_face.py faces --geo <geo.json>` to dump every
cube's face rectangles when authoring a spec. Feature types: `eyes`, `mouth`,
`nose`, `nostrils`, `brows`, `whiskers`, `patch` (generic fill). Paired features
(`eyes`, `nostrils`, `brows`) mirror across the face centre so they stay
symmetric. **Minecraft faces are tiny** (a head front is often 6×5 px), so keep
it minimal — an eye is usually a single pixel; `whiskers` need a face ≥ ~10px
wide to read and are best skipped on small heads. `tools/faces/flyingseal.face.json`
is the worked reference.

**Ears (and horns/antennae) = geometry, not paint.** External ears must be real
cubes so they cast shape, animate with the head, and get their own UV rect. Add
them in the **modeling phase**, parented to the head bone, *before* the UV
repack — then the repack gives them atlas rectangles and `mob_face.py paint` can
add inner-ear detail like any other part. To get symmetric, correctly-placed ear
geometry, run:

```bash
python3 tools/mob_face.py ears --geo <geo.json> --head <head-bone> --tilt 18
```

It emits the two `add_group` + `place_cube` calls (bone names `left_ear` /
`right_ear`, origin, size, pivot, outward tilt) to run over MCP. Because the ears
are new bones, add the matching Java only if you animate them independently (R6);
purely-cosmetic ears parented to the head need no controller change.

## Editing an existing mob (source vs. build outputs)

Treat it like the rest of the monorepo — **`blockbench/<id>.bbmodel` is the
editable source; the `geo.json` + `animation.json` + `png` are build outputs**
generated from it. Every mob keeps a committed `.bbmodel` so it can be reopened
without lossy reconstruction.

- **Texture-only tweak** (recolor / add detail / **add or fix a face**): fastest
  path — the UV layout is baked into `geo.json`, so edit
  `textures/entity/<id>.png` directly, **keeping the same pixel dimensions and UV
  layout**, then `pnpm --filter=mob-forge build`. No Blockbench needed. For
  facial features prefer `tools/mob_face.py paint` (see "Facial features + ears"
  above) — it edits the PNG *and* re-embeds it into the `.bbmodel` for you. Only
  re-export the geo if you change the texture resolution or repack UVs.
- **Hand-painting a single part** (recolour the head, add a stripe to the tail):
  because the pipeline now gives every cube its own non-overlapping rectangle (see
  "Per-part UV layout" above), a stroke on one part no longer bleeds onto the
  others. Open `blockbench/<id>.bbmodel` (`Codecs.project.load` — never `parse`),
  use the **Paint** tab, select the target part in the outliner, and paint; the UV
  panel shows exactly which rectangle you are editing. Save the PNG **and** the
  `.bbmodel`, then rebuild. (If a mob still has all cubes at `uv:[0,0]` — an old
  16×16 model — repack it first with the "Per-part UV layout" recipe, otherwise
  painting *will* bleed.)
- **Geometry / UV / animation change:** open `blockbench/<id>.bbmodel`, edit,
  re-export `geo.json` + `animation.json` via the `risky_eval` recipe above, save
  the `png`, **and save the `.bbmodel`**. If you rename a bone or animation id,
  update the matching Java (`AnimationController` refs + bone lookups) — R6.

**Blockbench-MCP gotcha (learned the hard way):** to open a `.bbmodel` over MCP,
use `Codecs.project.load(model, {path})` — it creates a **new** project.
`Codecs.project.parse(...)` **merges into the currently-active project** and will
silently corrupt it. Never leave a project's `save_path` pointing at a file whose
in-memory content is wrong (a stray Ctrl+S then overwrites the good file). If you
ever need to rebuild a `.bbmodel` from scratch, the committed `geo.json` +
`animation.json` + `png` are a complete, deterministic source: box-UV faces come
from each cube's `uv` offset + size, and bedrock→Blockbench animation conversion
is `rotation → [-x, -y, z]`, `position`/`scale` unchanged.

## Build / run

```bash
pnpm setup-minecraft          # one-time: toolchain + MDK bootstrap (Bash-only)
pnpm --filter=mob-forge build # gradlew build
pnpm --filter=mob-forge dev   # gradlew runClient (launches the client)
```

`build`/`dev`/`clean` go through `tools/gradlew.mjs`, a tiny cross-platform Node
launcher that picks `./gradlew` on Linux/macOS and `gradlew.bat` on Windows — so
`pnpm --filter=mob-forge build` works the same on every OS (no need to call the
wrapper by hand). `setup-minecraft` is still Bash-only; on Windows the toolchain
is installed manually (see the help app's Mob Forge tab).

## Authoring a new mob — use the `/mob-forge` skill

To author a new GeckoLib mob end-to-end (Java → Blockbench MCP → export → build →
attended in-game check), invoke the **`/mob-forge <description>`** skill
(`.claude/skills/mob-forge/SKILL.md`) — e.g. `/mob-forge a hostile flying eyeball
that shoots lasers`. It sequences the full prompt-to-play pipeline and treats this
file as the authoritative recipe (naming discipline, 1.20.2 syntax, the MCP tool
contract, and the `risky_eval` export steps all live here, not in the skill).
