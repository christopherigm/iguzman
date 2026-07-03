package com.iguzman.mobforge.registry;

import com.iguzman.mobforge.MobForge;
import net.minecraft.world.item.Item;
import net.neoforged.neoforge.common.DeferredSpawnEggItem;
import net.neoforged.neoforge.registries.DeferredItem;
import net.neoforged.neoforge.registries.DeferredRegister;

/**
 * Item registry. Registers the spawn egg used to place the test cube in-world.
 *
 * <p>NeoForge 1.20.2 uses {@link DeferredSpawnEggItem} (the loader-provided
 * spawn-egg that resolves its entity type lazily) — not the 1.12/1.16-era
 * Forge {@code ForgeSpawnEggItem} (PRD R7).
 */
public final class ModItems {

    public static final DeferredRegister.Items ITEMS =
            DeferredRegister.createItems(MobForge.MOD_ID);

    public static final DeferredItem<Item> TEST_CUBE_SPAWN_EGG =
            ITEMS.register("testcube_spawn_egg",
                    () -> new DeferredSpawnEggItem(
                            ModEntities.TEST_CUBE,
                            0x4CAF50, // primary (green body)
                            0x2E7D32, // secondary (darker green)
                            new Item.Properties()));

    public static final DeferredItem<Item> CUBE_SPAWN_EGG =
            ITEMS.register("cube_spawn_egg",
                    () -> new DeferredSpawnEggItem(
                            ModEntities.CUBE,
                            0x4CAF50, // primary (green body)
                            0x2E7D32, // secondary (darker green)
                            new Item.Properties()));

    public static final DeferredItem<Item> FLYING_SEAL_SPAWN_EGG =
            ITEMS.register("flyingseal_spawn_egg",
                    () -> new DeferredSpawnEggItem(
                            ModEntities.FLYING_SEAL,
                            0xF5F5F5, // primary (white body)
                            0x9E9E9E, // secondary (gray spots)
                            new Item.Properties()));

    public static final DeferredItem<Item> XENOMORPH_SPAWN_EGG =
            ITEMS.register("xenomorph_spawn_egg",
                    () -> new DeferredSpawnEggItem(
                            ModEntities.XENOMORPH,
                            0x141414, // primary (near-black carapace)
                            0x3E3E4A, // secondary (biomechanical steel-blue)
                            new Item.Properties()));

    private ModItems() {}
}
