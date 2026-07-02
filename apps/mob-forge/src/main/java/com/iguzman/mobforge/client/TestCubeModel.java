package com.iguzman.mobforge.client;

import com.iguzman.mobforge.MobForge;
import com.iguzman.mobforge.entity.TestCubeEntity;
import net.minecraft.resources.ResourceLocation;
import software.bernie.geckolib.model.GeoModel;

/**
 * GeoModel binding the {@link TestCubeEntity} to its exported GeckoLib assets.
 *
 * <p>All three resource paths reuse the "testcube" name verbatim (PRD R6). In
 * 1.20.2 the two-arg {@code new ResourceLocation(namespace, path)} constructor
 * is still current — the {@code fromNamespaceAndPath} rename lands in 1.20.5+.
 */
public class TestCubeModel extends GeoModel<TestCubeEntity> {

    private static final ResourceLocation MODEL =
            new ResourceLocation(MobForge.MOD_ID, "geo/testcube.geo.json");
    private static final ResourceLocation TEXTURE =
            new ResourceLocation(MobForge.MOD_ID, "textures/entity/testcube.png");
    private static final ResourceLocation ANIMATION =
            new ResourceLocation(MobForge.MOD_ID, "animations/testcube.animation.json");

    @Override
    public ResourceLocation getModelResource(TestCubeEntity animatable) {
        return MODEL;
    }

    @Override
    public ResourceLocation getTextureResource(TestCubeEntity animatable) {
        return TEXTURE;
    }

    @Override
    public ResourceLocation getAnimationResource(TestCubeEntity animatable) {
        return ANIMATION;
    }
}
