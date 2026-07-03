package com.iguzman.mobforge.entity;

import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.MeleeAttackGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.WaterAvoidingRandomStrollGoal;
import net.minecraft.world.entity.ai.goal.target.HurtByTargetGoal;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.entity.npc.Villager;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import software.bernie.geckolib.animatable.GeoEntity;
import software.bernie.geckolib.core.animatable.instance.AnimatableInstanceCache;
import software.bernie.geckolib.core.animation.AnimatableManager;
import software.bernie.geckolib.core.animation.AnimationController;
import software.bernie.geckolib.core.animation.RawAnimation;
import software.bernie.geckolib.core.object.PlayState;
import software.bernie.geckolib.util.GeckoLibUtil;

/**
 * A hostile, jet-black xenomorph: a skeletal-but-fleshed-out biped with long
 * clawed arms, a long spiked tail, and an elongated head that hides a second
 * inner jaw. Melee attacker (zombie-like target/goal set).
 *
 * <p>Two triggered attack animations on the dedicated "attack" controller:
 * a hand {@code slash} on a normal hit, and the inner-jaw {@code finisher}
 * (mouth lunges out toward the victim's head) when a hit is a KILLING blow —
 * see {@link #doHurtTarget(Entity)}. The looping {@code idle}/{@code walk} pair
 * lives on the separate "movement" controller so triggers never fight it.
 *
 * <p>All animation ids ("animation.xenomorph.*") and the bones they target are
 * reused VERBATIM from the exported {@code geo/xenomorph.geo.json} +
 * {@code animations/xenomorph.animation.json} (PRD R6 naming discipline).
 */
public class XenomorphEntity extends Monster implements GeoEntity {

    private static final RawAnimation IDLE =
            RawAnimation.begin().thenLoop("animation.xenomorph.idle");
    private static final RawAnimation WALK =
            RawAnimation.begin().thenLoop("animation.xenomorph.walk");
    private static final RawAnimation SLASH =
            RawAnimation.begin().thenPlay("animation.xenomorph.slash");
    private static final RawAnimation FINISHER =
            RawAnimation.begin().thenPlay("animation.xenomorph.finisher");

    private final AnimatableInstanceCache cache = GeckoLibUtil.createInstanceCache(this);

    public XenomorphEntity(EntityType<? extends Monster> type, Level level) {
        super(type, level);
    }

    public static AttributeSupplier.Builder createAttributes() {
        return Monster.createMonsterAttributes()
                .add(Attributes.MAX_HEALTH, 30.0D)
                .add(Attributes.MOVEMENT_SPEED, 0.3D)
                .add(Attributes.ATTACK_DAMAGE, 6.0D)
                .add(Attributes.FOLLOW_RANGE, 24.0D)
                .add(Attributes.KNOCKBACK_RESISTANCE, 0.3D);
    }

    @Override
    protected void registerGoals() {
        this.goalSelector.addGoal(0, new FloatGoal(this));
        this.goalSelector.addGoal(2, new MeleeAttackGoal(this, 1.0D, true));
        this.goalSelector.addGoal(7, new WaterAvoidingRandomStrollGoal(this, 1.0D));
        this.goalSelector.addGoal(8, new LookAtPlayerGoal(this, Player.class, 8.0F));
        this.goalSelector.addGoal(8, new RandomLookAroundGoal(this));

        this.targetSelector.addGoal(1, new HurtByTargetGoal(this));
        this.targetSelector.addGoal(2, new NearestAttackableTargetGoal<>(this, Player.class, true));
        this.targetSelector.addGoal(3, new NearestAttackableTargetGoal<>(this, Villager.class, true));
    }

    /**
     * Drives the two attack animations. Runs the vanilla melee hit first, then —
     * server-side only — triggers the inner-jaw {@code finisher} if the hit just
     * killed the target, otherwise the hand {@code slash}.
     */
    @Override
    public boolean doHurtTarget(Entity target) {
        boolean hit = super.doHurtTarget(target);
        if (hit && !this.level().isClientSide) {
            if (target instanceof LivingEntity living && living.isDeadOrDying()) {
                this.triggerAnim("attack", "finisher");
            } else {
                this.triggerAnim("attack", "slash");
            }
        }
        return hit;
    }

    @Override
    public void registerControllers(AnimatableManager.ControllerRegistrar controllers) {
        controllers.add(new AnimationController<>(this, "movement", 5, state -> {
            if (state.isMoving()) {
                return state.setAndContinue(WALK);
            }
            return state.setAndContinue(IDLE);
        }));
        controllers.add(new AnimationController<>(this, "attack", 0, state -> PlayState.STOP)
                .triggerableAnim("slash", SLASH)
                .triggerableAnim("finisher", FINISHER));
    }

    @Override
    public AnimatableInstanceCache getAnimatableInstanceCache() {
        return this.cache;
    }
}
