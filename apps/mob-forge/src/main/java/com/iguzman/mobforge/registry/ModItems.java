package com.iguzman.mobforge.registry;

import com.iguzman.mobforge.MobForge;
import com.iguzman.mobforge.item.ForgeItemTier;
import net.minecraft.world.food.FoodProperties;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.SwordItem;
import net.minecraft.world.item.Tier;
import net.minecraft.world.item.crafting.Ingredient;
import net.neoforged.neoforge.common.DeferredSpawnEggItem;
import net.neoforged.neoforge.registries.DeferredItem;
import net.neoforged.neoforge.registries.DeferredRegister;

/**
 * Item registry. Registers the spawn eggs used to place mobs in-world, plus the
 * AI-authored inventory items (gems, food, tools/weapons) produced by the
 * {@code /item-forge} skill.
 *
 * <p>NeoForge 1.20.2 uses {@link DeferredSpawnEggItem} (the loader-provided
 * spawn-egg that resolves its entity type lazily) — not the 1.12/1.16-era
 * Forge {@code ForgeSpawnEggItem} (PRD R7).
 *
 * <p><b>Forged items are flat sprites.</b> Each has a 16×16 texture at
 * {@code textures/item/<id>.png} and a model at {@code models/item/<id>.json}
 * ({@code item/generated} for icons, {@code item/handheld} for tools). They are
 * grouped into the custom {@link ModCreativeTabs#ITEMS_TAB} creative tab (spawn
 * eggs stay in the vanilla Spawn Eggs tab).
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

    // ── Forged inventory items (authored by /item-forge) ──────────────────────

    /** Gem / material — a plain inventory object with no behaviour. */
    public static final DeferredItem<Item> RUBY =
            ITEMS.register("ruby", () -> new Item(new Item.Properties()));

    /** Food — edible; nutrition + saturation come from {@link FoodProperties}. */
    public static final DeferredItem<Item> SUNBERRY =
            ITEMS.register("sunberry", () -> new Item(new Item.Properties()
                    .food(new FoodProperties.Builder()
                            .nutrition(4)
                            .saturationMod(0.4f)
                            .build())));

    /**
     * Weapon — a custom-tier sword. Final attack damage = 1 (base) +
     * tier bonus (5) + the {@code SwordItem} modifier (3) = 9 (netherite-class);
     * durability flows from the tier's {@code uses}.
     */
    private static final Tier EMBERBLADE_TIER =
            new ForgeItemTier(1200, 8.0f, 5.0f, 3, 15, Ingredient.EMPTY);

    public static final DeferredItem<SwordItem> EMBERBLADE =
            ITEMS.register("emberblade",
                    () -> new SwordItem(EMBERBLADE_TIER, 3, -2.4f, new Item.Properties()));

    private ModItems() {}
}
