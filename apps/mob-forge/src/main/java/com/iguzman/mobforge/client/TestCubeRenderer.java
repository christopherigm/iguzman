package com.iguzman.mobforge.client;

import com.iguzman.mobforge.entity.TestCubeEntity;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import software.bernie.geckolib.renderer.GeoEntityRenderer;

/** Renders {@link TestCubeEntity} through GeckoLib using {@link TestCubeModel}. */
public class TestCubeRenderer extends GeoEntityRenderer<TestCubeEntity> {

    public TestCubeRenderer(EntityRendererProvider.Context context) {
        super(context, new TestCubeModel());
    }
}
