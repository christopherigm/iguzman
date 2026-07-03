package com.iguzman.mobforge.client;

import com.iguzman.mobforge.entity.FlyingSealEntity;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import software.bernie.geckolib.renderer.GeoEntityRenderer;

/** Renders {@link FlyingSealEntity} through GeckoLib using {@link FlyingSealModel}. */
public class FlyingSealRenderer extends GeoEntityRenderer<FlyingSealEntity> {

    public FlyingSealRenderer(EntityRendererProvider.Context context) {
        super(context, new FlyingSealModel());
    }
}
