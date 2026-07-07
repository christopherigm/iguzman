#!/usr/bin/env node
// Bedrock Add-On exporter for mob-forge.
//
// mob-forge is a Java Edition (NeoForge) mod, but the heavy assets it produces
// -- GeckoLib `.geo.json` (Bedrock geometry) and `.animation.json` (Bedrock
// animation) plus the entity/item PNGs -- are ALREADY in Bedrock's native
// format. So porting to Android/Bedrock is not an asset conversion; it is
// generating the JSON "glue" (pack manifests, client-entity + server-behavior
// definitions for mobs, item definitions for items) and copying the assets into
// a resource pack + behavior pack, then zipping a `.mcaddon`.
//
// This runs as the second half of `pnpm --filter=mob-forge build`. It reads
// `src/main/resources` directly and does NOT need the Gradle MDK bootstrapped.
//
// Sources of truth:
//   - Assets:  src/main/resources/assets/mobforge/{geo,animations,textures}
//   - Mob specs:  tools/bedrock/<id>.entity.json
//   - Item specs: tools/bedrock/<id>.item.json
//   - Pack identity (stable UUIDs, versions): tools/bedrock/packs.json
//
// Output: build/bedrock/mobforge.mcaddon  (+ the unzipped tree beside it)

import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const specDir = join(appDir, "tools", "bedrock");
const assetsDir = join(appDir, "src", "main", "resources", "assets", "mobforge");
const outDir = join(appDir, "build", "bedrock");
const rpDir = join(outDir, "mobforge_rp");
const bpDir = join(outDir, "mobforge_bp");

const NS = "mobforge";

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const write = (p, data) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, data);
};
const writeJson = (p, obj) => write(p, JSON.stringify(obj, null, 2) + "\n");
const copy = (from, to) => write(to, readFileSync(from));

// --- Behavior component mapping -------------------------------------------
// Each entry turns a spec `behaviors` keyword into a Bedrock AI-goal component.
// Priority is assigned by position in the spec's `behaviors` array (0 = first).
const BEHAVIOR_COMPONENTS = {
  float: () => ["minecraft:behavior.float", {}],
  tempt: (spec) => [
    "minecraft:behavior.tempt",
    { speed_multiplier: 1.0, items: spec.tempt_items ?? [] },
  ],
  random_fly: () => [
    "minecraft:behavior.random_fly",
    { speed_multiplier: 1.0, can_land_on_trees: false, xz_dist: 15, y_dist: 7 },
  ],
  // Keeps a flyer aloft: an always-eligible, low-priority goal that hovers a
  // few blocks off the ground whenever a higher goal (e.g. random_fly) isn't
  // actively moving the mob -- otherwise gravity would drop it to the floor.
  random_hover: () => [
    "minecraft:behavior.random_hover",
    {
      speed_multiplier: 1.0,
      xz_dist: 8,
      y_dist: 8,
      y_offset: 0,
      interval: 1,
      hover_height: [1, 4],
    },
  ],
  random_stroll: () => [
    "minecraft:behavior.random_stroll",
    { speed_multiplier: 1.0 },
  ],
  look_at_player: () => [
    "minecraft:behavior.look_at_player",
    { look_distance: 8.0 },
  ],
  random_look_around: () => ["minecraft:behavior.random_look_around", {}],
  melee_attack: () => [
    "minecraft:behavior.melee_attack",
    { speed_multiplier: 1.0, track_target: true, reach_multiplier: 1.5 },
  ],
  hurt_by_target: () => ["minecraft:behavior.hurt_by_target", {}],
  nearest_attackable_target: (spec) => [
    "minecraft:behavior.nearest_attackable_target",
    {
      must_see: true,
      reselect_targets: true,
      entity_types: [
        {
          filters: {
            any_of: (spec.target_families ?? ["player"]).map((f) => ({
              test: "is_family",
              subject: "other",
              value: f,
            })),
          },
          max_dist: spec.follow_range ?? 16,
        },
      ],
    },
  ],
};

function locomotionComponents(spec) {
  const speed = spec.movement_speed ?? 0.2;
  if (spec.locomotion === "fly") {
    return {
      "minecraft:can_fly": {},
      "minecraft:movement": { value: speed },
      "minecraft:movement.fly": {},
      "minecraft:navigation.fly": {
        can_path_over_water: true,
        can_pass_doors: true,
        can_open_doors: false,
        avoid_damage_blocks: true,
      },
    };
  }
  // default: ground walker
  return {
    "minecraft:movement": { value: speed },
    "minecraft:movement.basic": {},
    "minecraft:navigation.walk": { can_path_over_water: true },
    "minecraft:jump.static": {},
  };
}

// --- Per-mob generation ----------------------------------------------------
function exportMob(spec, langRp) {
  const id = spec.id;
  const identifier = `${NS}:${id}`;

  // 1. Copy the Bedrock-native assets verbatim.
  copy(
    join(assetsDir, "geo", `${id}.geo.json`),
    join(rpDir, "models", "entity", `${id}.geo.json`),
  );
  copy(
    join(assetsDir, "animations", `${id}.animation.json`),
    join(rpDir, "animations", `${id}.animation.json`),
  );
  copy(
    join(assetsDir, "textures", "entity", `${id}.png`),
    join(rpDir, "textures", "entity", `${id}.png`),
  );

  // 2. Optional client-side animation controller (e.g. idle<->walk blend).
  if (spec.animation_controllers) {
    writeJson(
      join(rpDir, "animation_controllers", `${id}.animation_controllers.json`),
      {
        format_version: "1.10.0",
        animation_controllers: spec.animation_controllers,
      },
    );
  }

  // 3. Client entity (resource pack): geometry + texture + animation + spawn egg.
  const clientEntity = {
    format_version: "1.10.0",
    "minecraft:client_entity": {
      description: {
        identifier,
        materials: { default: "entity_alphatest" },
        textures: { default: `textures/entity/${id}` },
        geometry: { default: `geometry.${id}` },
        animations: spec.animations ?? {},
        scripts: spec.animate ? { animate: spec.animate } : {},
        render_controllers: ["controller.render.default"],
        spawn_egg: spec.spawn_egg
          ? {
              base_color: spec.spawn_egg.base_color,
              overlay_color: spec.spawn_egg.overlay_color,
            }
          : undefined,
      },
    },
  };
  writeJson(join(rpDir, "entity", `${id}.entity.json`), clientEntity);

  // 4. Server behavior (behavior pack): stats + AI goals.
  const health = spec.health ?? 10;
  const components = {
    "minecraft:type_family": { family: spec.family ?? [id, "mob"] },
    "minecraft:health": { value: health, max: health },
    "minecraft:collision_box": {
      width: spec.collision?.width ?? 0.6,
      height: spec.collision?.height ?? 0.6,
    },
    "minecraft:physics": {},
    "minecraft:pushable": { is_pushable: true, is_pushable_by_piston: true },
    ...locomotionComponents(spec),
  };
  if (spec.attack_damage != null)
    components["minecraft:attack"] = { damage: spec.attack_damage };
  if (spec.follow_range != null)
    components["minecraft:follow_range"] = {
      value: spec.follow_range,
      max: spec.follow_range,
    };
  if (spec.knockback_resistance != null)
    components["minecraft:knockback_resistance"] = {
      value: spec.knockback_resistance,
    };

  (spec.behaviors ?? []).forEach((name, i) => {
    const factory = BEHAVIOR_COMPONENTS[name];
    if (!factory) {
      console.warn(`  ! unknown behavior "${name}" on ${id} — skipped`);
      return;
    }
    const [compName, compBody] = factory(spec, i);
    components[compName] = { priority: i, ...compBody };
  });

  const behavior = {
    format_version: "1.16.0",
    "minecraft:entity": {
      description: {
        identifier,
        is_spawnable: true,
        is_summonable: true,
        is_experimental: false,
      },
      components,
    },
  };
  writeJson(join(bpDir, "entities", `${id}.behavior.json`), behavior);

  // 5. Names (spawn egg is auto-generated from is_spawnable + the client spawn_egg).
  langRp.push(`entity.${identifier}.name=${spec.name}`);
  langRp.push(
    `item.spawn_egg.entity.${identifier}.name=${spec.spawn_egg_name ?? spec.name + " Spawn Egg"}`,
  );
}

// --- Per-item generation ---------------------------------------------------
function exportItem(spec, itemTextureData) {
  const id = spec.id;
  const identifier = `${NS}:${id}`;

  copy(
    join(assetsDir, "textures", "item", `${id}.png`),
    join(rpDir, "textures", "item", `${id}.png`),
  );
  itemTextureData[id] = { textures: `textures/item/${id}` };

  const components = {
    "minecraft:icon": { texture: id },
    "minecraft:display_name": { value: spec.name },
    "minecraft:max_stack_size": spec.max_stack_size ?? 64,
  };
  if (spec.food) {
    components["minecraft:food"] = {
      nutrition: spec.food.nutrition,
      saturation_modifier: spec.food.saturation_modifier,
      can_always_eat: spec.food.can_always_eat ?? false,
    };
    components["minecraft:use_modifiers"] = {
      use_duration: spec.use_duration ?? 1.6,
      movement_modifier: 0.35,
    };
    components["minecraft:use_animation"] = "eat";
  }
  if (spec.weapon) {
    components["minecraft:max_stack_size"] = 1;
    components["minecraft:hand_equipped"] = true;
    components["minecraft:damage"] = spec.weapon.damage;
    components["minecraft:durability"] = {
      max_durability: spec.weapon.durability,
    };
    if (spec.weapon.enchant_slot)
      components["minecraft:enchantable"] = {
        value: spec.weapon.enchant_value ?? 10,
        slot: spec.weapon.enchant_slot,
      };
  }

  writeJson(join(bpDir, "items", `${id}.item.json`), {
    format_version: "1.20.60",
    "minecraft:item": {
      description: {
        identifier,
        menu_category: { category: spec.category ?? "items" },
      },
      components,
    },
  });
}

// --- Manifests -------------------------------------------------------------
function manifests(cfg) {
  const rp = cfg.resource_pack;
  const bp = cfg.behavior_pack;
  writeJson(join(rpDir, "manifest.json"), {
    format_version: 2,
    header: {
      name: `${cfg.name} Resources`,
      description: cfg.description,
      uuid: rp.header_uuid,
      version: cfg.version,
      min_engine_version: cfg.min_engine_version,
    },
    modules: [
      { type: "resources", uuid: rp.module_uuid, version: cfg.version },
    ],
  });
  writeJson(join(bpDir, "manifest.json"), {
    format_version: 2,
    header: {
      name: `${cfg.name} Behavior`,
      description: cfg.description,
      uuid: bp.header_uuid,
      version: cfg.version,
      min_engine_version: cfg.min_engine_version,
    },
    modules: [{ type: "data", uuid: bp.module_uuid, version: cfg.version }],
    // Enabling the behavior pack auto-activates the resource pack it depends on.
    dependencies: [{ uuid: rp.header_uuid, version: cfg.version }],
  });
}

// --- Minimal .mcaddon (zip) writer ----------------------------------------
// A .mcaddon is a zip whose top-level folders are packs (each with a manifest).
// We write it in pure Node (deflate via zlib) so `pnpm build` needs no external
// `zip` binary and behaves identically on every OS.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++)
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function collectFiles(dir, base, acc) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) collectFiles(abs, rel, acc);
    else acc.push({ name: rel, data: readFileSync(abs) });
  }
  return acc;
}
function writeMcaddon(mcaddonPath) {
  const files = [
    ...collectFiles(rpDir, "mobforge_rp", []),
    ...collectFiles(bpDir, "mobforge_bp", []),
  ];
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const f of files) {
    const nameBuf = Buffer.from(f.name, "utf8");
    const crc = crc32(f.data);
    const comp = deflateRawSync(f.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // method: deflate
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0x21, 12); // date (arbitrary, 1980)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, comp);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(f.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + comp.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const centralStart = offset;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(centralStart, 16);
  writeFileSync(mcaddonPath, Buffer.concat([...locals, centralBuf, end]));
  return files.length;
}

// --- Main ------------------------------------------------------------------
// Bump the patch component of a [major, minor, patch] version array.
function bumpPatch(version) {
  const [major = 0, minor = 1, patch = 0] = version ?? [];
  return [major, minor, patch + 1];
}

function main() {
  const cfg = readJson(join(specDir, "packs.json"));

  // Bump + persist the pack version on every build. Bedrock rejects re-importing
  // a .mcaddon whose pack UUID already exists at the same version ("duplicate"
  // error); a strictly-higher version makes it cleanly update the installed pack.
  cfg.version = bumpPatch(cfg.version);
  writeJson(join(specDir, "packs.json"), cfg);
  console.log(`bedrock-export: pack version -> ${cfg.version.join(".")}`);

  const all = readdirSync(specDir);
  const mobSpecs = all
    .filter((f) => f.endsWith(".entity.json"))
    .map((f) => readJson(join(specDir, f)))
    .sort((a, b) => a.id.localeCompare(b.id));
  const itemSpecs = all
    .filter((f) => f.endsWith(".item.json"))
    .map((f) => readJson(join(specDir, f)))
    .sort((a, b) => a.id.localeCompare(b.id));

  if (mobSpecs.length === 0 && itemSpecs.length === 0) {
    console.log("bedrock-export: no tools/bedrock/*.{entity,item}.json specs.");
    return;
  }

  rmSync(rpDir, { recursive: true, force: true });
  rmSync(bpDir, { recursive: true, force: true });

  const langRp = [`pack.name=${cfg.name}`];
  for (const spec of mobSpecs) {
    console.log(`bedrock-export: mob  ${spec.id}`);
    exportMob(spec, langRp);
  }

  const itemTextureData = {};
  for (const spec of itemSpecs) {
    console.log(`bedrock-export: item ${spec.id}`);
    exportItem(spec, itemTextureData);
  }
  if (itemSpecs.length > 0) {
    writeJson(join(rpDir, "textures", "item_texture.json"), {
      resource_pack_name: NS,
      texture_name: "atlas.items",
      texture_data: itemTextureData,
    });
  }

  manifests(cfg);
  write(join(rpDir, "texts", "en_US.lang"), langRp.join("\n") + "\n");
  writeJson(join(rpDir, "texts", "languages.json"), ["en_US"]);

  const mcaddon = join(outDir, "mobforge.mcaddon");
  const count = writeMcaddon(mcaddon);
  console.log(
    `bedrock-export: wrote ${mcaddon} (${count} files, ${mobSpecs.length} mob(s), ${itemSpecs.length} item(s))`,
  );
}

main();
