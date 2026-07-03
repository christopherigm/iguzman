package com.iguzman.mobforge.item;

import net.minecraft.world.item.Tier;
import net.minecraft.world.item.crafting.Ingredient;

/**
 * A per-item {@link Tier} so each AI-authored tool/weapon can carry its own
 * stats (durability, mining speed, attack-damage bonus, harvest level,
 * enchantability) instead of borrowing a fixed vanilla {@code Tiers} entry.
 *
 * <p>NeoForge 1.20.2 {@code Tier} interface — six accessors; a record keeps the
 * stat block declarative at the registration site in {@code ModItems}. Durability
 * flows from {@link #getUses()} because {@code TieredItem} applies
 * {@code properties.defaultDurability(tier.getUses())} for us. {@code getLevel()}
 * is the harvest tier (0=wood … 4=netherite) and only matters for mining tools;
 * for a pure sword it is cosmetic.
 */
public record ForgeItemTier(
        int uses,
        float speed,
        float attackDamageBonus,
        int level,
        int enchantmentValue,
        Ingredient repairIngredient)
        implements Tier {

    @Override
    public int getUses() {
        return uses;
    }

    @Override
    public float getSpeed() {
        return speed;
    }

    @Override
    public float getAttackDamageBonus() {
        return attackDamageBonus;
    }

    @Override
    public int getLevel() {
        return level;
    }

    @Override
    public int getEnchantmentValue() {
        return enchantmentValue;
    }

    @Override
    public Ingredient getRepairIngredient() {
        return repairIngredient;
    }
}
