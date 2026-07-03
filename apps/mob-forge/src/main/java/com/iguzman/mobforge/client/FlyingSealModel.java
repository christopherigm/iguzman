package com.iguzman.mobforge.client;

import com.iguzman.mobforge.MobForge;
import com.iguzman.mobforge.entity.FlyingSealEntity;
import net.minecraft.resources.ResourceLocation;
import software.bernie.geckolib.model.GeoModel;

/**
 * GeoModel binding the {@link FlyingSealEntity} to its exported GeckoLib assets.
 *
 * <p>All three resource paths reuse the "flyingseal" name verbatim (PRD R6). In
 * 1.20.2 the two-arg {@code new ResourceLocation(namespace, path)} constructor
 * is still current — the {@code fromNamespaceAndPath} rename lands in 1.20.5+.
 */
public class FlyingSealModel extends GeoModel<FlyingSealEntity> {

    private static final ResourceLocation MODEL =
            new ResourceLocation(MobForge.MOD_ID, "geo/flyingseal.geo.json");
    private static final ResourceLocation TEXTURE =
            new ResourceLocation(MobForge.MOD_ID, "textures/entity/flyingseal.png");
    private static final ResourceLocation ANIMATION =
            new ResourceLocation(MobForge.MOD_ID, "animations/flyingseal.animation.json");

    @Override
    public ResourceLocation getModelResource(FlyingSealEntity animatable) {
        return MODEL;
    }

    @Override
    public ResourceLocation getTextureResource(FlyingSealEntity animatable) {
        return TEXTURE;
    }

    @Override
    public ResourceLocation getAnimationResource(FlyingSealEntity animatable) {
        return ANIMATION;
    }
}
