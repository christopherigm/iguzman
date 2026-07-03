package com.iguzman.mobforge.client;

import com.iguzman.mobforge.MobForge;
import com.iguzman.mobforge.entity.XenomorphEntity;
import net.minecraft.resources.ResourceLocation;
import software.bernie.geckolib.model.GeoModel;

/**
 * GeoModel binding the {@link XenomorphEntity} to its exported GeckoLib assets.
 *
 * <p>All three resource paths reuse the "xenomorph" name verbatim (PRD R6). In
 * 1.20.2 the two-arg {@code new ResourceLocation(namespace, path)} constructor
 * is still current — the {@code fromNamespaceAndPath} rename lands in 1.20.5+.
 */
public class XenomorphModel extends GeoModel<XenomorphEntity> {

    private static final ResourceLocation MODEL =
            new ResourceLocation(MobForge.MOD_ID, "geo/xenomorph.geo.json");
    private static final ResourceLocation TEXTURE =
            new ResourceLocation(MobForge.MOD_ID, "textures/entity/xenomorph.png");
    private static final ResourceLocation ANIMATION =
            new ResourceLocation(MobForge.MOD_ID, "animations/xenomorph.animation.json");

    @Override
    public ResourceLocation getModelResource(XenomorphEntity animatable) {
        return MODEL;
    }

    @Override
    public ResourceLocation getTextureResource(XenomorphEntity animatable) {
        return TEXTURE;
    }

    @Override
    public ResourceLocation getAnimationResource(XenomorphEntity animatable) {
        return ANIMATION;
    }
}
