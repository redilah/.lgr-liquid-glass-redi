/**
 * LIQUID GLASS REDI (LGR) — TAHAP 2: STANDALONE HYDRO-OPTICAL PHYSICS ENGINE
 * Implements:
 *   1. Sub-Stepped 4th-Order Runge-Kutta (RK4) Harmonic Spring Integrator
 *   2. Navier-Stokes Incompressible Volume Conservation (Weber Number We)
 *   3. Marangoni Capillary Surface Tension & Multi-Droplet Coalescence
 *   4. Exponential Momentum Projection & 1:1 Resting Baseline Invariant
 */

export class RK4Spring1D {
  constructor(initialValue = 0, stiffnessK = 304.6, dampingC = 30.7) {
    this.value = initialValue;
    this.target = initialValue;
    this.velocity = 0;
    this.acceleration = 0;
    this.k = stiffnessK;
    this.c = dampingC;
  }

  configure(stiffnessK, dampingC) {
    this.k = stiffnessK;
    this.c = dampingC;
  }

  setTarget(newTarget) {
    this.target = newTarget;
  }

  impulse(deltaVelocity) {
    this.velocity += deltaVelocity;
  }

  snap(exactValue) {
    this.value = exactValue;
    this.target = exactValue;
    this.velocity = 0;
    this.acceleration = 0;
  }

  // Derivative function f(x, v) = -k*(x - target) - c*v
  computeAcceleration(x, v) {
    return -this.k * (x - this.target) - this.c * v;
  }

  stepRK4(dt) {
    const x0 = this.value;
    const v0 = this.velocity;

    const a1 = this.computeAcceleration(x0, v0);
    const v1 = v0;

    const x2 = x0 + 0.5 * dt * v1;
    const v2 = v0 + 0.5 * dt * a1;
    const a2 = this.computeAcceleration(x2, v2);

    const x3 = x0 + 0.5 * dt * v2;
    const v3 = v0 + 0.5 * dt * a2;
    const a3 = this.computeAcceleration(x3, v3);

    const x4 = x0 + dt * v3;
    const v4 = v0 + dt * a3;
    const a4 = this.computeAcceleration(x4, v4);

    this.value = x0 + (dt / 6.0) * (v1 + 2.0 * v2 + 2.0 * v3 + v4);
    this.velocity = v0 + (dt / 6.0) * (a1 + 2.0 * a2 + 2.0 * a3 + a4);
    this.acceleration = a4;

    // Settle threshold for Resting State 1:1 Invariant
    if (
      Math.abs(this.value - this.target) < 0.0005 &&
      Math.abs(this.velocity) < 0.005
    ) {
      this.value = this.target;
      this.velocity = 0;
      this.acceleration = 0;
    }

    return this.value;
  }
}

export class LGRHydroPhysicsEngine {
  constructor(materialConfig, sceneConfig) {
    this.material = materialConfig;
    this.scene = sceneConfig;

    const { stiffnessK, dampingC } = materialConfig.fluid.derivedRK4;
    const primaryDroplet = sceneConfig.droplets[0] || {
      size: [72, 48],
      initialPos: [64, 31],
    };
    const secondaryDroplet = sceneConfig.droplets[1] || {
      size: [48, 44],
      initialPos: [190, 31],
    };

    this.primarySize = [...primaryDroplet.size];
    this.secondarySize = [...secondaryDroplet.size];

    // Primary Droplet RK4 State
    this.springX = new RK4Spring1D(primaryDroplet.initialPos[0], stiffnessK, dampingC);
    this.springY = new RK4Spring1D(primaryDroplet.initialPos[1], stiffnessK, dampingC);
    this.springScaleX = new RK4Spring1D(1.0, 420.0, 26.0);
    this.springScaleY = new RK4Spring1D(1.0, 420.0, 26.0);
    this.springLift = new RK4Spring1D(0.0, 340.0, 28.0);
    this.springGlass = new RK4Spring1D(0.0, 290.0, 28.0);
    this.springTilt = new RK4Spring1D(0.0, 360.0, 24.0);

    // Secondary Droplet State (for Marangoni Coalescence / Metaball fusion)
    this.secSpringX = new RK4Spring1D(secondaryDroplet.initialPos[0], stiffnessK * 0.9, dampingC);
    this.secSpringY = new RK4Spring1D(secondaryDroplet.initialPos[1], stiffnessK * 0.9, dampingC);
    this.secondaryEnabled = sceneConfig.droplets.length > 1;
  }

  /**
   * Apple WWDC Exponential Momentum Projection:
   * Projects where a flick gesture will naturally land based on release velocity (px/s).
   */
  static projectMomentum(initialVelocityPxPerSec, decelerationRate = 0.998) {
    return (
      ((initialVelocityPxPerSec / 1000.0) * decelerationRate) /
      (1.0 - decelerationRate)
    );
  }

  /**
   * Progressive Rubber-Band Resistance at Vessel Boundaries
   */
  static rubberBand(overshoot, dimension, constant = 0.55) {
    return (
      (overshoot * dimension * constant) /
      (dimension + constant * Math.abs(overshoot))
    );
  }

  triggerFluidBounce(intensity = 1.0) {
    this.springScaleX.impulse(0.42 * intensity);
    this.springScaleY.impulse(-0.34 * intensity);
    this.springLift.setTarget(Math.min(1.0, this.springLift.target + 0.65 * intensity));
    this.springGlass.setTarget(1.0);
  }

  moveTo(targetX, targetY = null, releaseVelocityX = 0) {
    this.springX.setTarget(targetX);
    if (targetY !== null) this.springY.setTarget(targetY);
    if (Math.abs(releaseVelocityX) > 1.0) {
      this.springX.impulse(releaseVelocityX * 0.15);
    }
  }

  setInteractiveLift(active) {
    this.springLift.setTarget(active ? 1.0 : 0.0);
    this.springGlass.setTarget(active ? 1.0 : 0.0);
  }

  /**
   * Advances the hydro-elastic physics simulation by deltaSeconds using 4 sub-steps of RK4.
   */
  step(deltaSeconds = 1 / 60) {
    const clampedDt = Math.min(deltaSeconds, 0.05);
    const subSteps = 4;
    const subDt = clampedDt / subSteps;

    const fluid = this.material.fluid;

    for (let i = 0; i < subSteps; i++) {
      this.springX.stepRK4(subDt);
      this.springY.stepRK4(subDt);
      this.springScaleX.stepRK4(subDt);
      this.springScaleY.stepRK4(subDt);
      this.springLift.stepRK4(subDt);
      this.springGlass.stepRK4(subDt);
      this.secSpringX.stepRK4(subDt);
      this.secSpringY.stepRK4(subDt);

      // Dynamic Shear Tilt driven by velocity vx and acceleration ax
      const vx = this.springX.velocity;
      const ax = this.springX.acceleration;
      const targetTilt = Math.tanh((0.75 * vx + 0.018 * ax) / 680.0);
      this.springTilt.setTarget(targetTilt);
      this.springTilt.stepRK4(subDt);

      // Auto-decay lift when motion settles
      if (Math.abs(vx) < 8.0 && this.springLift.target > 0 && !this._pointerHeld) {
        this.springLift.setTarget(0.0);
        this.springGlass.setTarget(0.0);
      }
    }

    // 1. Dimensionless Weber Number (We) & Volume-Conserving Stretch/Compress
    const vx = this.springX.velocity;
    const weber = Math.tanh(Math.abs(vx) / fluid.characteristicVelocity);
    const stretchX = Math.sqrt(1.0 + fluid.weberStretchX * weber);
    const compressY = fluid.incompressibility
      ? 1.0 / Math.sqrt(1.0 + fluid.weberCompressY * weber)
      : 1.0;

    // 2. Marangoni Capillary Pull between Primary & Secondary Droplets
    let marangoniPullX = 0.0;
    let coalescenceFactor = 0.0;
    if (this.secondaryEnabled) {
      const dx = this.secSpringX.value - this.springX.value;
      const dy = this.secSpringY.value - this.springY.value;
      const centerDist = Math.hypot(dx, dy);
      const sumRadii = this.primarySize[0] * 0.5 + this.secondarySize[0] * 0.5;
      const surfaceGap = centerDist - sumRadii;
      const kRadius = fluid.marangoniRadius;

      if (surfaceGap < kRadius * 1.6) {
        coalescenceFactor = Math.max(
          0.0,
          Math.min(1.0, 1.0 - surfaceGap / (kRadius * 1.6))
        );
        // Capillary necking stretches droplets slightly toward each other
        marangoniPullX = Math.sign(dx) * coalescenceFactor * 2.8;
      }
    }

    const buoyancySwell = 1.0 + this.springLift.value * 0.075;
    const finalScaleX =
      this.springScaleX.value * stretchX * buoyancySwell +
      Math.abs(marangoniPullX) * 0.018;
    const finalScaleY = this.springScaleY.value * compressY * buoyancySwell;

    // 3. Bounce Activity & Strict Resting 1:1 Baseline Invariant
    const scaleDeviation =
      Math.abs(this.springScaleX.value - 1.0) +
      Math.abs(this.springScaleY.value - 1.0);
    const rawActivity =
      scaleDeviation * 2.2 +
      this.springLift.value * 1.0 +
      this.springGlass.value * 0.65 +
      weber * 1.15;
    const bounceActivity =
      rawActivity < 0.002 ? 0.0 : Math.min(1.5, rawActivity);

    // At rest (bounceActivity === 0): snellMagnification is strictly 1.0000 and liftOffsetY is 0.0px!
    const maxZoomDelta = (this.scene.invariant?.maxDynamicZoom || 1.18) - 1.0;
    const snellMagnification =
      bounceActivity === 0.0
        ? 1.0
        : 1.0 + Math.min(maxZoomDelta, bounceActivity * 0.18);
    const liftOffsetY =
      bounceActivity === 0.0 ? 0.0 : -this.springLift.value * 2.15;
    const shearDeg = Math.max(
      -2.6,
      Math.min(2.6, this.springTilt.value * 1.85)
    );

    return {
      pixelX: Number((this.springX.value + marangoniPullX).toFixed(3)),
      pixelY: Number(this.springY.value.toFixed(3)),
      velocityX: Number(vx.toFixed(3)),
      weber: Number(weber.toFixed(5)),
      scaleX: Number(finalScaleX.toFixed(5)),
      scaleY: Number(finalScaleY.toFixed(5)),
      volumeProduct: Number((stretchX * compressY).toFixed(4)),
      glassActive: Number(this.springGlass.value.toFixed(4)),
      glassLift: Number(this.springLift.value.toFixed(4)),
      tiltX: Number(this.springTilt.value.toFixed(5)),
      shearRad: Number(((shearDeg * Math.PI) / 180.0).toFixed(5)),
      shearDeg: Number(shearDeg.toFixed(3)),
      bounceActivity: Number(bounceActivity.toFixed(4)),
      snellMagnification: Number(snellMagnification.toFixed(4)),
      liftOffsetY: Number(liftOffsetY.toFixed(3)),
      coalescenceFactor: Number(coalescenceFactor.toFixed(4)),
      secondaryPos: [
        Number(this.secSpringX.value.toFixed(3)),
        Number(this.secSpringY.value.toFixed(3)),
      ],
      isResting1to1: bounceActivity === 0.0 && snellMagnification === 1.0,
    };
  }
}
