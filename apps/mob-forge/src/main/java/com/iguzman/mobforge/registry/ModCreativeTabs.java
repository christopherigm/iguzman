package com.iguzman.mobforge.registry;

import com.iguzman.mobforge.MobForge;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.ItemStack;
import net.neoforged.neoforge.registries.DeferredHolder;
import net.neoforged.neoforge.registries.DeferredRegister;

/**
 * Creative-tab registry. Forged inventory items (gems, food, tools/weapons) get
 * their own tab so they are grouped together and easy to find; mob spawn eggs
 * are left in the vanilla {@code SPAWN_EGGS} tab (see {@code MobForge#addCreative}).
 *
 * <p>NeoForge 1.20.2: a custom tab is a {@link CreativeModeTab} registered on
 * {@link Registries#CREATIVE_MODE_TAB}. {@code displayItems} is the authoritative
 * list of what the tab shows — every {@code /item-forge} item is appended here.
 */
public final class ModCreativeTabs {

    public static final DeferredRegister<CreativeModeTab> TABS =
            DeferredRegister.create(Registries.CREATIVE_MODE_TAB, MobForge.MOD_ID);

    public static final DeferredHolder<CreativeModeTab, CreativeModeTab> ITEMS_TAB =
            TABS.register("items", () -> CreativeModeTab.builder()
                    .title(Component.translatable("itemGroup.mobforge.items"))
                    .icon(() -> new ItemStack(ModItems.EMBERBLADE.get()))
                    .displayItems((params, output) -> {
                        output.accept(ModItems.RUBY.get());
                        output.accept(ModItems.SUNBERRY.get());
                        output.accept(ModItems.EMBERBLADE.get());
                    })
                    .build());

    private ModCreativeTabs() {}
}
