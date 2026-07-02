package com.iguzman.mobforge.registry;

import com.iguzman.mobforge.MobForge;
import com.iguzman.mobforge.entity.TestCubeEntity;
import net.minecraft.core.registries.Registries;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobCategory;
import net.neoforged.neoforge.registries.DeferredHolder;
import net.neoforged.neoforge.registries.DeferredRegister;

/**
 * Entity type registry. The registration name ("testcube") is the Java-side
 * registry id that must match the GeckoLib asset filenames and bone names
 * authored in Blockbench (PRD R6 naming discipline):
 *   geo/testcube.geo.json, animations/testcube.animation.json, bone "testcube".
 */
public final class ModEntities {

    public static final DeferredRegister<EntityType<?>> ENTITIES =
            DeferredRegister.create(Registries.ENTITY_TYPE, MobForge.MOD_ID);

    public static final DeferredHolder<EntityType<?>, EntityType<TestCubeEntity>> TEST_CUBE =
            ENTITIES.register("testcube", () -> EntityType.Builder
                    .of(TestCubeEntity::new, MobCategory.CREATURE)
                    .sized(0.5f, 0.5f)
                    .build("testcube"));

    private ModEntities() {}
}
