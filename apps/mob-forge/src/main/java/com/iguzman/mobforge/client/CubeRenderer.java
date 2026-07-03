package com.iguzman.mobforge.client;

import com.iguzman.mobforge.entity.CubeEntity;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import software.bernie.geckolib.renderer.GeoEntityRenderer;

/** Renders {@link CubeEntity} through GeckoLib using {@link CubeModel}. */
public class CubeRenderer extends GeoEntityRenderer<CubeEntity> {

    public CubeRenderer(EntityRendererProvider.Context context) {
        super(context, new CubeModel());
    }
}
