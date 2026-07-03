package com.iguzman.mobforge.client;

import com.iguzman.mobforge.entity.XenomorphEntity;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import software.bernie.geckolib.renderer.GeoEntityRenderer;

/** Renders {@link XenomorphEntity} through GeckoLib using {@link XenomorphModel}. */
public class XenomorphRenderer extends GeoEntityRenderer<XenomorphEntity> {

    public XenomorphRenderer(EntityRendererProvider.Context context) {
        super(context, new XenomorphModel());
    }
}
