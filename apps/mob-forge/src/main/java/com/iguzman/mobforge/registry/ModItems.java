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

    private ModItems() {}
}
