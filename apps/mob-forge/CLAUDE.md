# CLAUDE.md — mob-forge

Guidance for Claude Code when working in `apps/mob-forge`. This is a **Minecraft
1.20.2 NeoForge mod** (Gradle/Java), not a Next.js app — the conventions in
`apps/CLAUDE.md` (i18n, `@repo/ui` props, `next/image`, etc.) **do not apply
here**. It is a Turborepo workspace member only through a thin `package.json`
wrapper that shells out to `./gradlew`.

See the product spec in `apps/prds/minecraft.md`.

## What lives here vs. what is generated

- **Committed:** our Java (`src/main/java`), our assets (`src/main/resources`,
  including GeckoLib `geo/` + `animations/`), `gradle.properties`, this file.
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
(geometry) → `add_group` (bone) → `create_animation` (keyframes) →
`capture_screenshot` (verify) → **export via `risky_eval`** (see recipe below).

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

## Build / run

```bash
pnpm setup-minecraft          # one-time: toolchain + MDK bootstrap
pnpm --filter=mob-forge build # ./gradlew build
pnpm --filter=mob-forge dev   # ./gradlew runClient (launches the client)
```
