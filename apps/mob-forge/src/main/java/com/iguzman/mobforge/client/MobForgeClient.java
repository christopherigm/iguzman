package com.iguzman.mobforge.client;

import com.iguzman.mobforge.registry.ModEntities;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.client.event.EntityRenderersEvent;

/**
 * Client-only wiring. Loaded exclusively from a {@code Dist.CLIENT} guard in the
 * mod constructor, so referencing client-only rendering classes here never
 * touches the classloader on a dedicated server.
 *
 * <p>Entity renderers are registered on the mod event bus via
 * {@link EntityRenderersEvent.RegisterRenderers}, added as a plain listener
 * rather than an {@code @EventBusSubscriber} annotation (whose enum names have
 * drifted across NeoForge versions — PRD R8).
 */
public final class MobForgeClient {

    public static void init(IEventBus modEventBus) {
        modEventBus.addListener(MobForgeClient::registerRenderers);
    }

    private static void registerRenderers(EntityRenderersEvent.RegisterRenderers event) {
        event.registerEntityRenderer(ModEntities.TEST_CUBE.get(), TestCubeRenderer::new);
    }

    private MobForgeClient() {}
}
