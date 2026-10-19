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

/**
 * PILAR 1: LGR GYROSCOPE & ACCELEROMETER PHYSICAL CAUSTIC SWEEP CONTROLLER
 * Translates 3-axis smartphone orientation (Roll γ, Pitch β) and linear acceleration
 * into a 3D unit studio light vector u_lightPos(Lx, Ly, Lz) and hydro-gravity caustic
 * floor shift using sub-stepped RK4 harmonic filtering.
 *
 * Zero-Regression Invariant:
 *   When at rest (0°, 0°) or on devices without orientation sensors, lightPos
 *   equals the exact canonical LGR baseline vector and gyroTilt equals [0, 0].
 */
export class LGRGyroscopeController {
  constructor(options = {}) {
    this.sensitivity = options.sensitivity ?? 0.82;
    this.maxAngleDeg = options.maxAngleDeg ?? 45.0;
    this.ergonomicBaselinePitchDeg = options.ergonomicPitchDeg ?? null;

    // RK4 Harmonic Filter (omega_n = 18.5 rad/s, zeta = 0.92 => k = 342.25, c = 34.04)
    this.springRollX = new RK4Spring1D(0.0, 342.25, 34.04);
    this.springPitchY = new RK4Spring1D(0.0, 342.25, 34.04);

    this.rawRollDeg = 0.0;
    this.rawPitchDeg = 0.0;
    this.virtualMode = false;
    this.hardwareConnected = false;
    this._boundOrientation = null;
    this._boundMotion = null;
    this._onWakeCallback = options.onWake || null;
  }

  /**
   * Sets virtual 3D tilt angles in degrees (for Desktop Lab & Automated Testing)
   */
  setVirtualTiltDeg(rollGammaDeg, pitchBetaDeg) {
    this.virtualMode = true;
    this.rawRollDeg = Math.max(-this.maxAngleDeg, Math.min(this.maxAngleDeg, rollGammaDeg));
    this.rawPitchDeg = Math.max(-this.maxAngleDeg, Math.min(this.maxAngleDeg, pitchBetaDeg));
    const normX = (this.rawRollDeg / this.maxAngleDeg) * this.sensitivity;
    const normY = (this.rawPitchDeg / this.maxAngleDeg) * this.sensitivity;
    this.springRollX.setTarget(normX);
    this.springPitchY.setTarget(normY);
    if (this._onWakeCallback) this._onWakeCallback();
  }

  /**
   * Resets gyroscope to neutral 0° state
   */
  resetNeutral() {
    this.virtualMode = false;
    this.rawRollDeg = 0.0;
    this.rawPitchDeg = 0.0;
    this.ergonomicBaselinePitchDeg = null;
    this.springRollX.setTarget(0.0);
    this.springPitchY.setTarget(0.0);
    if (this._onWakeCallback) this._onWakeCallback();
  }

  /**
   * Connects to real smartphone DeviceOrientationEvent / DeviceMotionEvent
   */
  async connectHardwareSensor() {
    if (typeof window === 'undefined') return false;

    try {
      if (
        typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function'
      ) {
        const perm = await DeviceOrientationEvent.requestPermission();
        if (perm !== 'granted') return false;
      }
    } catch (_) {
      // Non-iOS or permission not required
    }

    if (this._boundOrientation) return true;

    this._boundOrientation = (e) => {
      if (this.virtualMode) return;
      if (e.gamma === null && e.beta === null) return;

      const gamma = Number(e.gamma) || 0; // Left/Right tilt [-90, 90]
      const beta = Number(e.beta) || 0;   // Front/Back pitch [-180, 180]

      // Auto-calibrate initial ergonomic hand-holding angle on first reading
      if (this.ergonomicBaselinePitchDeg === null) {
        this.ergonomicBaselinePitchDeg = Math.max(-20, Math.min(75, beta));
      }

      const deltaRoll = Math.max(-this.maxAngleDeg, Math.min(this.maxAngleDeg, gamma));
      const deltaPitch = Math.max(
        -this.maxAngleDeg,
        Math.min(this.maxAngleDeg, beta - this.ergonomicBaselinePitchDeg)
      );

      // Ignore sub-degree MEMS sensor micro-noise (< 0.35 deg) when already settled
      if (
        Math.abs(deltaRoll - this.rawRollDeg) < 0.35 &&
        Math.abs(deltaPitch - this.rawPitchDeg) < 0.35
      ) {
        return;
      }

      this.hardwareConnected = true;
      this.rawRollDeg = deltaRoll;
      this.rawPitchDeg = deltaPitch;

      const normX = (deltaRoll / this.maxAngleDeg) * this.sensitivity;
      const normY = (deltaPitch / this.maxAngleDeg) * this.sensitivity;
      this.springRollX.setTarget(normX);
      this.springPitchY.setTarget(normY);

      if (this._onWakeCallback) this._onWakeCallback();
    };

    window.addEventListener('deviceorientation', this._boundOrientation, { passive: true });
    return true;
  }

  disconnectHardwareSensor() {
    if (typeof window !== 'undefined' && this._boundOrientation) {
      window.removeEventListener('deviceorientation', this._boundOrientation);
      this._boundOrientation = null;
    }
  }

  /**
   * Steps the RK4 gyroscope filter and computes the 3D optical light vector & caustic shift
   */
  step(dt = 1 / 60, refractiveIndex = 1.52, focusHeightPx = 2.5) {
    const clampedDt = Math.min(dt, 0.05);
    const subSteps = 4;
    const subDt = clampedDt / subSteps;

    for (let i = 0; i < subSteps; i++) {
      this.springRollX.stepRK4(subDt);
      this.springPitchY.stepRK4(subDt);
    }

    const gx = this.springRollX.value;
    const gy = this.springPitchY.value;

    // Compute 3D unit studio key light direction vector L = normalize(Lx, Ly, Lz)
    const rawLx = -gx * 0.85;
    const rawLy = -0.76 - gy * 0.65;
    const rawLz = Math.sqrt(Math.max(0.18, 1.0 - Math.min(0.82, gx * gx * 0.45 + gy * gy * 0.35)));
    const lenL = Math.hypot(rawLx, rawLy, rawLz) || 1.0;

    const lightPos = [
      Number((rawLx / lenL).toFixed(5)),
      Number((rawLy / lenL).toFixed(5)),
      Number((rawLz / lenL).toFixed(5)),
    ];

    // Snell's Law Hydro-Gravity Caustic Shift:
    // delta_p = h_focus * tan(arcsin(sin(theta) / n_crystal))
    const sinThetaX = Math.sin(Math.max(-0.78, Math.min(0.78, gx * 0.75)));
    const sinThetaY = Math.sin(Math.max(-0.78, Math.min(0.78, gy * 0.75)));
    const refractedAngleX = Math.asin(sinThetaX / Math.max(1.0, refractiveIndex));
    const refractedAngleY = Math.asin(sinThetaY / Math.max(1.0, refractiveIndex));

    const causticShiftXY = [
      Number((focusHeightPx * Math.tan(refractedAngleX) * 6.5).toFixed(4)),
      Number((focusHeightPx * Math.tan(refractedAngleY) * 6.5).toFixed(4)),
    ];

    const isSettled =
      Math.abs(this.springRollX.value - this.springRollX.target) < 0.0006 &&
      Math.abs(this.springPitchY.value - this.springPitchY.target) < 0.0006 &&
      Math.abs(this.springRollX.velocity) < 0.005 &&
      Math.abs(this.springPitchY.velocity) < 0.005;

    return {
      gyroTilt: [Number(gx.toFixed(5)), Number(gy.toFixed(5))],
      rollDeg: Number(this.rawRollDeg.toFixed(2)),
      pitchDeg: Number(this.rawPitchDeg.toFixed(2)),
      lightPos,
      causticShiftXY,
      isSettled,
    };
  }
}

/**
 * PILAR 2: LGR OPTICAL DISTORTION & SNELL DEFLECTION ENGINE
 * Computes exact physical ray displacement:
 *   Delta p(lambda) = d0 * ((n_air - n_glass(lambda)) / n_glass(lambda)) * grad(z)
 *                   = d0 * (eta(lambda) - 1.0) * grad(z)
 * on an underlying planar scene or offscreen framebuffer texture.
 *
 * Invariants:
 *   1. Zero Deflection at Rest: When at rest at the droplet center,
 *      grad(z) -> 0 and magnification = 1.0000x => Delta p = 0.0px (100% sharp text, zero blur).
 *   2. Cauchy Spectral Dispersion: Blue wavelengths bend stronger than Red wavelengths
 *      (|kappa_blue| > |kappa_red|), creating authentic physical chromatic fringing.
 *   3. Dynamic Optical Depth: Lift elevates the optical path length:
 *      d_eff = d0 * (1.0 + lift * 0.55).
 */
export class LGROpticalDistortion {
  constructor(options = {}) {
    this.refractiveIndex = options.refractiveIndex ?? 1.52;
    this.cauchyB = options.cauchyB ?? 0.0052;
    this.opticalDepth = options.opticalDepth ?? 14.5;
    this.wavelengths = options.wavelengths ?? [650, 550, 450]; // nm: Red, Green, Blue

    const [lamR, lamG, lamB] = this.wavelengths.map((w) => w / 1000.0);
    const n0 = this.refractiveIndex;
    const cauchyA = n0 - this.cauchyB / (lamG * lamG);
    this.nRed = Number((cauchyA + this.cauchyB / (lamR * lamR)).toFixed(6));
    this.nGreen = Number(n0.toFixed(6));
    this.nBlue = Number((cauchyA + this.cauchyB / (lamB * lamB)).toFixed(6));

    // Snell deflection kappa factors: kappa = (1 - n) / n
    this.kappaRed = Number(((1.0 - this.nRed) / this.nRed).toFixed(6));
    this.kappaGreen = Number(((1.0 - this.nGreen) / this.nGreen).toFixed(6));
    this.kappaBlue = Number(((1.0 - this.nBlue) / this.nBlue).toFixed(6));
  }

  /**
   * Computes height z(x,y) of a physical meniscus dome in pixels
   */
  evaluateMeniscusHeight(distPx, rimWidthPx = 11.5, lift = 0.0) {
    if (distPx >= 0.0) return 0.0;
    const tRim = Math.max(0.0, Math.min(1.0, -distPx / rimWidthPx));
    const oneMinusT = 1.0 - tRim;
    const wallZ = Math.sqrt(Math.max(0.0, 1.0 - oneMinusT * oneMinusT)) * rimWidthPx * 0.85;
    const centerDomeZ = Math.max(0.0, Math.min(1.0, -distPx / 42.0)) * (3.2 + lift * 2.4);
    return wallZ + centerDomeZ;
  }

  /**
   * Evaluates the 2D surface gradient grad(z) = (dz/dx, dz/dy) around a given point
   */
  evaluateSurfaceGradient(distCenter, gradDirection, rimWidthPx = 11.5, lift = 0.0) {
    if (distCenter >= 0.0) return [0.0, 0.0];
    const eps = 0.85;
    const zAhead = this.evaluateMeniscusHeight(distCenter + eps, rimWidthPx, lift);
    const zBehind = this.evaluateMeniscusHeight(distCenter - eps, rimWidthPx, lift);
    const slope = (zAhead - zBehind) / (2.0 * eps);
    return [
      Number((gradDirection[0] * slope).toFixed(5)),
      Number((gradDirection[1] * slope).toFixed(5)),
    ];
  }

  /**
   * Evaluates Snellius deflection vector Delta p(lambda) = d_eff * kappa(lambda) * grad(z)
   */
  computeDeflection(gradZX, gradZY, lift = 0.0, dynamicZoom = 1.0, beyondApple = 1.0) {
    const effectiveDepth = this.opticalDepth * (1.0 + lift * 0.55);

    // Green (central reference)
    const dpGx = effectiveDepth * this.kappaGreen * gradZX;
    const dpGy = effectiveDepth * this.kappaGreen * gradZY;

    // Cauchy chromatic dispersion
    const kappaR = this.kappaGreen + (this.kappaRed - this.kappaGreen) * beyondApple;
    const kappaB = this.kappaGreen + (this.kappaBlue - this.kappaGreen) * beyondApple;

    const dpRx = effectiveDepth * kappaR * gradZX;
    const dpRy = effectiveDepth * kappaR * gradZY;

    const dpBx = effectiveDepth * kappaB * gradZX;
    const dpBy = effectiveDepth * kappaB * gradZY;

    const chromaticSpread = Math.hypot(dpBx - dpRx, dpBy - dpRy);
    const maxDeflection = Math.hypot(dpGx, dpGy);

    return {
      deltaPGreen: [Number(dpGx.toFixed(4)), Number(dpGy.toFixed(4))],
      deltaPRed: [Number(dpRx.toFixed(4)), Number(dpRy.toFixed(4))],
      deltaPBlue: [Number(dpBx.toFixed(4)), Number(dpBy.toFixed(4))],
      chromaticSpread: Number(chromaticSpread.toFixed(4)),
      maxDeflection: Number(maxDeflection.toFixed(4)),
      effectiveDepth: Number(effectiveDepth.toFixed(3)),
      isRestingZero: Math.abs(dpGx) < 0.0001 && Math.abs(dpGy) < 0.0001,
    };
  }
}

/**
 * PILAR 3: LGR AUDIO-HAPTIC FLUID HYDRO-RESONANCE ENGINE
 * Synchronizes fluid micro-dynamics, capillary wave frequency (omega_cap = sqrt(sigma/rho * k^3)),
 * kinetic energy (Ek = 0.5 * m * v^2), and Marangoni droplet coalescence snap into tactile
 * vibration pulses via navigator.vibrate / Android Haptic Waveforms and low-frequency WebAudio
 * acoustic clicks.
 *
 * Invariants:
 *   1. Zero-Regression Resting Invariant:
 *      When droplets are at rest (v_x = 0, isResting1to1 = true), exactly 0 haptic pulses and
 *      0 audio clicks are emitted.
 *   2. Non-blocking & Crash-Resistant Fallback:
 *      All hardware vibration and WebAudio context calls are strictly wrapped in try/catch.
 *      On desktop browsers, headless Node.js testing, or devices without haptics, the engine
 *      runs smoothly without throwing exceptions or blocking the render thread.
 *   3. Marangoni Coalescence Snap:
 *      When two liquid droplets touch and fuse (coalescenceFactor crosses threshold 0.5),
 *      the release of surface energy triggers an impulsive double-pulse haptic transient [15, 20, 10] ms
 *      and a synthetic resonant acoustic click.
 */
export class LGRHydroResonanceEngine {
  constructor(options = {}) {
    this.capillaryFrequencyHz = options.capillaryFrequencyHz ?? 48.0;
    this.surfaceTension = options.surfaceTension ?? 0.0728; // N/m
    this.coalescenceSnapIntensity = options.coalescenceSnapIntensity ?? 0.85;
    this.boundaryRestitution = options.boundaryRestitution ?? 0.65;
    this.hapticEnabled = options.hapticFeedback ?? true;
    this.audioEnabled = options.audioResonance ?? true;
    this.decayTimeMs = options.decayTimeMs ?? 65.0;
    this.massMg = options.massMg ?? 0.12; // Virtual droplet mass in mg

    // Waveform presets (durations in ms)
    this.snapWaveformMs = options.snapWaveformMs ?? [15, 20, 10]; // Pulse, Pause, Pulse
    this.bounceWaveformMs = options.bounceWaveformMs ?? [18];
    this.flickWaveformMs = options.flickWaveformMs ?? [8];

    // Derived Kelvin capillary wave angular frequency: omega = 2 * pi * f
    this.omegaCapillary = Number((2.0 * Math.PI * this.capillaryFrequencyHz).toFixed(4));

    // Internal state tracking
    this.lastCoalescenceFactor = 0.0;
    this.lastVelocityX = 0.0;
    this.lastHapticTimestamp = 0;
    this.lastAudioTimestamp = 0;
    this.minIntervalMs = 40; // Debounce to prevent haptic saturation

    // WebAudio synthetic context (lazy loaded on user interaction)
    this._audioCtx = null;
    this._audioMuted = false;
  }

  /**
   * Computes droplet kinetic energy Ek = 0.5 * m * v^2 in microJoules (uJ) or milliJoules (mJ)
   * @param {number} velocityPxPerSec Droplet linear velocity in px/s
   * @param {number} massMg Droplet mass in mg (default 0.12 mg)
   * @returns {number} Kinetic energy in mJ
   */
  computeKineticEnergyMJ(velocityPxPerSec, massMg = this.massMg) {
    const vMPerSec = velocityPxPerSec / 1000.0; // Normalized velocity in m/s
    const massKg = massMg * 1e-6; // Convert mg to kg
    const energyJoules = 0.5 * massKg * (vMPerSec * vMPerSec);
    // Return in mJ (1 J = 1000 mJ)
    return Number((energyJoules * 1000.0).toFixed(6));
  }

  /**
   * Computes theoretical Kelvin capillary wave frequency:
   *   omega_cap = sqrt((sigma / rho) * k^3), where k = 2*pi / lambda
   * @param {number} surfaceTension N/m (default 0.0728 N/m)
   * @param {number} densityKgM3 kg/m^3 (default 1000 kg/m^3 for water/hydro-crystal)
   * @param {number} contactWidthMm mm (default 5.8 mm for finger pad contact & meniscus edge)
   * @returns {number} Frequency in Hz
   */
  static computeKelvinCapillaryFreq(surfaceTension = 0.0728, densityKgM3 = 1000.0, contactWidthMm = 5.8) {
    const wavelengthM = Math.max(0.001, contactWidthMm * 1e-3);
    const k = (2.0 * Math.PI) / wavelengthM;
    const omega = Math.sqrt((surfaceTension / densityKgM3) * Math.pow(k, 3));
    return Number((omega / (2.0 * Math.PI)).toFixed(2));
  }

  /**
   * Triggers hardware haptic vibration via navigator.vibrate (non-blocking, try/catch protected)
   */
  triggerHaptic(patternMs) {
    if (!this.hapticEnabled) return false;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (now - this.lastHapticTimestamp < this.minIntervalMs) return false;
        this.lastHapticTimestamp = now;
        navigator.vibrate(patternMs);
        return true;
      }
    } catch {
      // Graceful fallback on unsupported or restricted environments
    }
    return false;
  }

  /**
   * Synthesizes a real-time damped sinusoidal acoustic click using WebAudio
   * s(t) = A0 * exp(-t / tau) * sin(2*pi*f*t)
   */
  triggerAudioClick(freqHz = this.capillaryFrequencyHz, durationMs = this.decayTimeMs, volume = 0.18) {
    if (!this.audioEnabled || this._audioMuted) return false;
    try {
      if (typeof window === 'undefined') return false;
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtxClass) return false;

      if (!this._audioCtx) {
        this._audioCtx = new AudioCtxClass();
      }

      if (this._audioCtx.state === 'suspended') {
        this._audioCtx.resume().catch(() => {});
      }

      const now = this._audioCtx.currentTime;
      const osc = this._audioCtx.createOscillator();
      const gain = this._audioCtx.createGain();

      // Damped decay envelope
      const durSec = Math.max(0.015, durationMs / 1000.0);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freqHz, now);
      // Exponential micro-pitch downward slide for authentic hydro droplet acoustic
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqHz * 0.72), now + durSec);

      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durSec);

      osc.connect(gain);
      gain.connect(this._audioCtx.destination);

      osc.start(now);
      osc.stop(now + durSec);
      return true;
    } catch {
      // Graceful fallback for headless or restricted environments
    }
    return false;
  }

  /**
   * Triggers the Marangoni Coalescence Snap (impulsive tactile transient & acoustic snap)
   */
  triggerCoalescenceSnap(intensity = this.coalescenceSnapIntensity) {
    const scale = Math.max(0.5, Math.min(1.5, intensity));
    const scaledPattern = this.snapWaveformMs.map((d) => Math.round(d * scale));
    const hapticFired = this.triggerHaptic(scaledPattern);
    const audioFired = this.triggerAudioClick(this.capillaryFrequencyHz * 1.65, this.decayTimeMs * 1.1, 0.22 * scale);
    return { event: 'coalescence_snap', hapticFired, audioFired, pattern: scaledPattern };
  }

  /**
   * Triggers high-speed fluid flick ripple haptic & acoustic pulse
   */
  triggerFlickRipple(weber = 0.5, velocityX = 800) {
    const scale = Math.max(0.4, Math.min(1.4, Math.abs(velocityX) / 1000.0));
    const pattern = this.flickWaveformMs.map((d) => Math.max(4, Math.round(d * scale)));
    const hapticFired = this.triggerHaptic(pattern);
    const audioFired = this.triggerAudioClick(this.capillaryFrequencyHz, this.decayTimeMs * 0.65, 0.12 * scale);
    return { event: 'flick_ripple', hapticFired, audioFired, pattern };
  }

  /**
   * Triggers boundary wall rebound haptic & deep acoustic bump
   */
  triggerBoundaryBounce(velocityX = 500) {
    const scale = Math.max(0.5, Math.min(1.3, this.boundaryRestitution));
    const pattern = this.bounceWaveformMs.map((d) => Math.round(d * scale));
    const hapticFired = this.triggerHaptic(pattern);
    const audioFired = this.triggerAudioClick(Math.max(24, this.capillaryFrequencyHz * 0.75), this.decayTimeMs * 0.85, 0.16 * scale);
    return { event: 'boundary_bounce', hapticFired, audioFired, pattern };
  }

  /**
   * Advances the hydro-resonance engine by monitoring the current physics state.
   * Enforces the Zero-Regression Resting Invariant.
   * @param {object} physicsState State returned by LGRHydroPhysicsEngine.step()
   * @returns {object} Telemetry report
   */
  step(physicsState) {
    if (!physicsState) {
      return {
        lastEvent: 'none',
        kineticEnergyMJ: 0.0,
        capillaryFreqHz: this.capillaryFrequencyHz,
        surfaceTension: this.surfaceTension,
        hapticEmitted: false,
        audioEmitted: false,
        isRestingZero: true,
      };
    }

    const vx = physicsState.velocityX ?? 0.0;
    const coalescence = physicsState.coalescenceFactor ?? 0.0;
    const isResting = (physicsState.isResting1to1 === true) || (Math.abs(vx) < 0.001 && coalescence === 0.0);

    const ek = this.computeKineticEnergyMJ(vx);

    // 1. Strict Resting Invariant: When at rest, zero events are emitted!
    if (isResting) {
      this.lastCoalescenceFactor = coalescence;
      this.lastVelocityX = vx;
      return {
        lastEvent: 'none',
        kineticEnergyMJ: 0.0,
        capillaryFreqHz: this.capillaryFrequencyHz,
        surfaceTension: this.surfaceTension,
        hapticEmitted: false,
        audioEmitted: false,
        isRestingZero: true,
      };
    }

    let emittedEvent = 'none';
    let hapticEmitted = false;
    let audioEmitted = false;

    // 2. Marangoni Coalescence Trigger: Fired when two droplets fuse across 0.5 threshold
    if (coalescence >= 0.5 && this.lastCoalescenceFactor < 0.5) {
      const snap = this.triggerCoalescenceSnap(this.coalescenceSnapIntensity);
      emittedEvent = snap.event;
      hapticEmitted = snap.hapticFired;
      audioEmitted = snap.audioFired;
    }
    // 3. Flick Ripple Trigger: High Weber number / rapid movement
    else if (physicsState.weber > 0.45 && Math.abs(vx) > 750 && Math.abs(vx - this.lastVelocityX) > 200) {
      const flick = this.triggerFlickRipple(physicsState.weber, vx);
      emittedEvent = flick.event;
      hapticEmitted = flick.hapticFired;
      audioEmitted = flick.audioFired;
    }

    this.lastCoalescenceFactor = coalescence;
    this.lastVelocityX = vx;

    return {
      lastEvent: emittedEvent,
      kineticEnergyMJ: ek,
      capillaryFreqHz: this.capillaryFrequencyHz,
      surfaceTension: this.surfaceTension,
      hapticEmitted,
      audioEmitted,
      isRestingZero: false,
    };
  }
}


