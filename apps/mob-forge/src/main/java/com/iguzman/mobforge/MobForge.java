package com.iguzman.mobforge;

import com.iguzman.mobforge.client.MobForgeClient;
import com.iguzman.mobforge.entity.TestCubeEntity;
import com.iguzman.mobforge.registry.ModEntities;
import com.iguzman.mobforge.registry.ModItems;
import com.mojang.logging.LogUtils;
import net.minecraft.world.item.CreativeModeTabs;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.common.Mod;
import net.neoforged.fml.loading.FMLEnvironment;
import net.neoforged.neoforge.event.BuildCreativeModeTabContentsEvent;
import net.neoforged.neoforge.event.entity.EntityAttributeCreationEvent;
import org.slf4j.Logger;
import software.bernie.geckolib.GeckoLib;

/**
 * Mob Forge — entry point.
 *
 * <p>NeoForge 1.20.2 (20.2.x) convention: the mod entry takes an injected
 * {@code IEventBus} — FML recognizes the parameter type and passes the mod
 * event bus in automatically. Do NOT use the 1.20.1/Forge-style no-arg
 * constructor + {@code FMLJavaModLoadingContext.get().getModEventBus()} here
 * (PRD risk R7: hallucinated wrong-version syntax).
 */
@Mod(MobForge.MOD_ID)
public class MobForge {

    /** Must match {@code mod_id} in gradle.properties and every Blockbench MCP call. */
    public static final String MOD_ID = "mobforge";

    private static final Logger LOGGER = LogUtils.getLogger();

    public MobForge(IEventBus modEventBus) {
        // GeckoLib must be initialized during construction so its registries are
        // ready before entity/renderer registration runs.
        GeckoLib.initialize();

        // Deferred registers attach to the mod event bus.
        ModEntities.ENTITIES.register(modEventBus);
        ModItems.ITEMS.register(modEventBus);

        // Mod-bus lifecycle listeners.
        modEventBus.addListener(this::registerAttributes);
        modEventBus.addListener(this::addCreative);

        // Client-only wiring (entity renderers). Guarded so the client classes
        // never load on a dedicated server (safe even though Phase 1 is client-only).
        if (FMLEnvironment.dist == Dist.CLIENT) {
            MobForgeClient.init(modEventBus);
        }

        LOGGER.info("Mob Forge initialized (mod_id={})", MOD_ID);
    }

    private void registerAttributes(EntityAttributeCreationEvent event) {
        event.put(ModEntities.TEST_CUBE.get(), TestCubeEntity.createAttributes().build());
    }

    private void addCreative(BuildCreativeModeTabContentsEvent event) {
        if (event.getTabKey() == CreativeModeTabs.SPAWN_EGGS) {
            event.accept(ModItems.TEST_CUBE_SPAWN_EGG.get());
        }
    }
}
