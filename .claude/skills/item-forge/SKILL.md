---
name: item-forge
description: Author a new flat inventory item in apps/mob-forge end-to-end from a natural-language description — decide category (gem/material, food, tool/weapon) + stats, generate a 16×16 pixel-art sprite via tools/item_sprite.py, register the Java Item (custom Tier for tools) in the mobforge items creative tab, build, and hand off the attended in-game check. Use when the user asks to create or add a Minecraft item (not a mob, not a placeable block) in mob-forge (e.g. "/item-forge a ruby-encrusted dagger", "/item-forge a glowing healing berry", "/item-forge a bag of emerald dust").
---

# item-forge — prompt-to-inventory item pipeline

Author a new Minecraft 1.20.2 NeoForge **inventory item** in `apps/mob-forge`
from a natural-language description. Items are far simpler than mobs: a flat
item (`item/generated` or `item/handheld`) has **no geometry** — the game
auto-extrudes the in-hand slab from the sprite's alpha, so the 16×16 sprite *is*
the model. There is no GeckoLib, no rig, no animation, no entity, no renderer.

The authoritative technical recipe lives in `apps/mob-forge/CLAUDE.md` →
**"Authoring an item"**. Follow it verbatim; **if it ever conflicts with this
skill, CLAUDE.md wins.**

**The item to build is described in this skill's arguments** (the text after
`/item-forge`). If no description was given, ask for one before starting.

## Scope — what this skill does and does NOT build

- ✅ **Inventory items**: gems/materials, food, and tools/weapons (swords, etc.).
  Anything held or carried but never placed in the world.
- ❌ **Not blocks.** If the thing is placeable in the world (a candle, lamp, ore,
  decorative block), it is a *block* (Block + BlockItem + blockstate + world
  behaviour) — out of scope. Say so and stop, don't fake it as an item.
- ❌ **Not mobs.** Use `/mob-forge` for entities.

## Read these FIRST — source of truth, do not duplicate their contents

- **`apps/mob-forge/CLAUDE.md` → "Authoring an item"** — the item recipe: asset
  paths, model parents, the sprite tool, the creative tab, the 1.20.2 item/tier
  syntax, and the Blockbench touch-up path.
- The existing `RUBY` / `SUNBERRY` / `EMBERBLADE` registrations in
  `registry/ModItems.java`, `registry/ModCreativeTabs.java`, the item models in
  `assets/mobforge/models/item/`, and the specs in `tools/items/` are your
  worked templates — mirror their structure exactly (gem, food, sword).

## No Blockbench needed to generate

Generation is pure Python (`tools/item_sprite.py` + Pillow) — it does **not**
require a live Blockbench/MCP session, unlike `/mob-forge`. Blockbench is only
the operator's optional **touch-up** surface afterward (see phase 6). So this
pipeline runs unattended right up to the in-game check.

## Pipeline

Work top-to-bottom; each phase gates the next. Track progress with the task tool.

### 0. Clarify + enrich the prompt (do this before anything else)
A one-line item prompt is usually under-specified. Before locking the name, turn
the raw description into a complete build spec by (a) asking about genuine
ambiguities and (b) proposing sensible gap-fillers. Use `AskUserQuestion` so
choices are one tap, and batch related questions. **Ask only when the answer
changes what you build** — otherwise state the default you're assuming.

Typical gaps worth a question:

- **Category / behaviour** — is it an inert gem/material, **food** (edible), or a
  **tool/weapon**? This picks the Java item type and the model parent.
- **Food params** — how filling? (nutrition + saturation; optionally `alwaysEat`,
  `fast`, an effect on eat.)
- **Tool/weapon stats** — how strong/durable? Derive attack damage, durability,
  mining speed, harvest level, enchantability from the description (e.g. "a heavy
  obsidian greatsword" → high damage, slow, very durable). One custom `Tier` per
  item via `ForgeItemTier`.
- **Look** — dominant colours, silhouette, defining details. You will hand-author
  the 16×16 pixel grid, so nail the palette + shape down.

Confirm the final one-paragraph build spec back to the user before proceeding
(skip the questions if the prompt is already rich or the user says "sensible
defaults").

### 1. Lock the name first (naming discipline, closes R6)
Choose the item id (lower_snake, e.g. `emberblade`) and reuse it VERBATIM
everywhere: the registry name in `ModItems`, `tools/items/<id>.item.json`,
`textures/item/<id>.png`, `models/item/<id>.json`, `blockbench/items/<id>.bbmodel`,
and the `item.mobforge.<id>` lang key. Write the list down; every later step must
match it.

### 2. Author the sprite spec + render it
Write `tools/items/<id>.item.json` — a `palette` (char → RGBA) and a 16×16
`grid` of chars (`.` = transparent). Keep it readable at icon scale: strong
silhouette, a dark outline, 1–2 shading tones, a highlight. Mirror the reference
specs (`ruby` = faceted gem, `sunberry` = round fruit + leaf, `emberblade` =
vertical blade + guard + handle + pommel). Then render:

```bash
python3 tools/item_sprite.py render --spec tools/items/<id>.item.json --root .
```

It writes `textures/item/<id>.png` **and** `blockbench/items/<id>.bbmodel`
(editable source with the sprite embedded). **Look at the PNG** to confirm it
reads as the intended object before moving on — re-author the grid if not.

### 3. Java layer
Mirror the matching reference in `registry/ModItems.java`:

- **Gem / material** → `new Item(new Item.Properties())`.
- **Food** → `new Item(new Item.Properties().food(new FoodProperties.Builder()
  .nutrition(n).saturationMod(s).build()))`.
- **Tool / weapon** → a `SwordItem` (or other tiered item) with a per-item
  `ForgeItemTier(uses, speed, attackDamageBonus, level, enchantmentValue,
  Ingredient.EMPTY)`; durability flows from the tier's `uses`.

Then add the item to `registry/ModCreativeTabs.java`'s `displayItems` list so it
shows in the **Mob Forge Items** tab. Obey the 1.20.2 syntax rules in CLAUDE.md.

### 4. Assets + lang
- `models/item/<id>.json` → `{ "parent": "minecraft:item/generated", "textures":
  { "layer0": "mobforge:item/<id>" } }` for icons; use
  **`minecraft:item/handheld`** for swords/tools (correct in-hand grip).
- Add `"item.mobforge.<id>": "<Display Name>"` to `lang/en_us.json`.

### 5. Build
`pnpm --filter=mob-forge build` → expect BUILD SUCCESSFUL, and confirm the new
assets packaged into the jar (`unzip -l build/libs/*.jar | grep <id>`).

### 6. Attended in-game verification
Ask the operator to launch `pnpm --filter=mob-forge dev`, open the **Mob Forge
Items** creative tab, and grab the new item. Confirm the icon renders, the name
is right, and behaviour works (food is edible; a weapon swings/deals damage).
Optionally the operator can open `blockbench/items/<id>.bbmodel` in Blockbench,
paint the texture in the Paint tab, export the PNG over the build output, and
rebuild — the CLAUDE.md "Authoring an item" section documents that touch-up loop.

## Definition of done
Report which held; log any manual intervention as a gap (a partial pass).

1. A compiling Java `Item` registration (correct type for the category), no
   manual edits, added to the Mob Forge Items creative tab.
2. A 16×16 sprite that reads recognizably as the described object, rendered by
   `tools/item_sprite.py` from a committed `tools/items/<id>.item.json` spec.
3. A committed editable `blockbench/items/<id>.bbmodel` with the sprite embedded.
4. Correct model parent (`item/generated` vs `item/handheld`) + a `lang` entry.
5. Client launches and the item appears in the Mob Forge Items tab with no
   load-time crash; behaviour matches the description (in-game confirmation).

## On completion
- Report against the Definition of done above.
- **Do NOT commit** unless the user explicitly asks.
