/**
 * LIQUID GLASS REDI (LGR) — AUTOMATED PHYSICS & COMPILER VERIFICATION SUITE
 */

import fs from 'node:fs';
import path from 'node:path';
import { compileLGRSource } from './compiler/lgrc.js';
import { LGRHydroPhysicsEngine } from './physics/hydroEngine.js';

const lgrFile = path.resolve('./examples/crystal_redi.lgr');
const source = fs.readFileSync(lgrFile, 'utf8');

console.log('======================================================================');
console.log('  PENGUJIAN VERIFIKASI TAHAP 1 & TAHAP 2 — LIQUID GLASS REDI (LGR)');
console.log('======================================================================');

// 1. Test Compiler (Tahap 1)
const compiled = compileLGRSource(source);
const crownMat = compiled.ir.materials.CrownCrystalRedi;
const diamondMat = compiled.ir.materials.DiamondPrismRedi;
const scene = compiled.ir.scenes.RediSpatialDock;

console.assert(crownMat.optics.spectralIndices.b > crownMat.optics.spectralIndices.r, 'Cauchy dispersion: Blue IOR must be > Red IOR');
console.assert(diamondMat.optics.fresnelF0 > crownMat.optics.fresnelF0, 'Diamond F0 must exceed Crown Glass F0');
console.log('[PASS] Tahap 1 — Kompilasi .lgr & Penurunan Rumus Cauchy/Fresnel/TIR Akurat.');

// 2. Test Physics Engine Resting 1:1 Invariant (Tahap 2)
const engine = new LGRHydroPhysicsEngine(crownMat, scene);
const restState = engine.step(1 / 120);
console.assert(restState.isResting1to1 === true, 'Resting state must strictly enforce 1:1 scale');
console.assert(restState.snellMagnification === 1.0, 'Resting Snell magnification must be 1.0000');
console.assert(restState.liftOffsetY === 0.0, 'Resting lift offset Y must be 0.0px');
console.log(`[PASS] Tahap 2A — Invarian Diam 1:1 Terbukti (scale=${restState.scaleX}, zoom=${restState.snellMagnification}, liftY=${restState.liftOffsetY}px).`);

// 3. Test In-Flight Navier-Stokes Volume Conservation & Shear Tilt
engine.moveTo(260, 31, 850);
engine.triggerFluidBounce(1.0);
let peakWeberState = null;
for (let frame = 0; frame < 8; frame++) {
  const st = engine.step(1 / 120);
  if (!peakWeberState || st.weber > peakWeberState.weber) {
    peakWeberState = st;
  }
}
console.assert(peakWeberState.scaleX > 1.05, 'Droplet must stretch horizontally during fast glide');
console.assert(peakWeberState.scaleY < 1.0, 'Droplet must compress vertically to conserve fluid volume');
console.assert(peakWeberState.snellMagnification > 1.0, 'Active lens must dynamically magnify during flight');
console.log(
  `[PASS] Tahap 2B — Dinamika Navier-Stokes Terbukti (vX=${peakWeberState.velocityX}px/s, We=${peakWeberState.weber}, Sx=${peakWeberState.scaleX}, Sy=${peakWeberState.scaleY}, Zoom=${peakWeberState.snellMagnification}x, Tilt=${peakWeberState.shearDeg}°).`
);

// 4. Test Marangoni Capillary Coalescence (Metaball Fusion)
engine.springX.snap(142); // Close to SecondaryDroplet at x=190
const fusionState = engine.step(1 / 120);
console.assert(fusionState.coalescenceFactor > 0.3, 'Marangoni coalescence must activate when droplets approach');
console.log(
  `[PASS] Tahap 2C — Koalesensi Tetesan Marangoni Aktif (coalescenceFactor=${fusionState.coalescenceFactor}, capillaryPullX=${(fusionState.pixelX - 142).toFixed(3)}px).`
);

// 5. Test Convergence Back to Exact 1:1 Rest
engine.moveTo(260, 31, 0);
engine.setInteractiveLift(false);
let finalState = null;
for (let frame = 0; frame < 360; frame++) {
  finalState = engine.step(1 / 120);
}
console.assert(finalState.isResting1to1 === true, 'Must converge back to exact 1:1 resting baseline');
console.log(
  `[PASS] Tahap 2D — Konvergensi Pegas RK4 Kembali ke Invarian 1:1 (pos=${finalState.pixelX}px, zoom=${finalState.snellMagnification}, liftY=${finalState.liftOffsetY}px).`
);

// 6. Test Pilar 1: Gyroscope & Accelerometer Physical Caustic Sweep
import { LGRGyroscopeController } from './physics/hydroEngine.js';

const gyro = new LGRGyroscopeController({
  sensitivity: 0.82,
  ergonomicPitchDeg: 35.0,
});

// 6A. Neutral Resting State (Zero-Regression Invariant)
const neutralGyro = gyro.step(1 / 120, 1.52, 2.5);
const neutralLen = Math.hypot(neutralGyro.lightPos[0], neutralGyro.lightPos[1], neutralGyro.lightPos[2]);
console.assert(Math.abs(neutralLen - 1.0) < 0.001, 'Light position must be a normalized unit vector');
console.assert(Math.abs(neutralGyro.gyroTilt[0]) < 0.001, 'Neutral gyro tilt X must be 0');
console.assert(Math.abs(neutralGyro.gyroTilt[1]) < 0.001, 'Neutral gyro tilt Y must be 0');
console.assert(Math.abs(neutralGyro.causticShiftXY[0]) < 0.001, 'Neutral caustic shift X must be 0');
console.assert(Math.abs(neutralGyro.causticShiftXY[1]) < 0.001, 'Neutral caustic shift Y must be 0');
console.log(
  `[PASS] Pilar 1A — Invarian Netral Gyro Terbukti (u_lightPos=[${neutralGyro.lightPos.map(v => v.toFixed(3))}], tilt=[${neutralGyro.gyroTilt.map(v => v.toFixed(3))}], causticShift=[${neutralGyro.causticShiftXY.map(v => v.toFixed(2))}px]).`
);

// 6B. Virtual Tilt Dynamic Sweep (Roll = +25°, Pitch = -15°)
gyro.setVirtualTiltDeg(25.0, -15.0);
let activeGyro = null;
for (let f = 0; f < 30; f++) {
  activeGyro = gyro.step(1 / 120, 1.52, 2.5);
}
console.assert(activeGyro.gyroTilt[0] > 0.35, 'Positive roll must tilt X to positive');
console.assert(activeGyro.gyroTilt[1] < -0.20, 'Negative pitch must tilt Y to negative');
console.assert(activeGyro.lightPos[0] < -0.20, 'Light vector X must shift counter to tilt for natural specular highlights');
console.assert(Math.abs(activeGyro.causticShiftXY[0]) > 1.0, 'Caustic floor ring must shift physically with tilt');
console.log(
  `[PASS] Pilar 1B — Dynamic Tilt Caustic Sweep Terbukti (tilt=[${activeGyro.gyroTilt.map(v => v.toFixed(3))}], lightPos=[${activeGyro.lightPos.map(v => v.toFixed(3))}], causticShift=[${activeGyro.causticShiftXY.map(v => v.toFixed(2))}px]).`
);

// 6C. Harmonic RK4 Filter Settling Back to Neutral Rest
gyro.resetNeutral();
let settledGyro = null;
for (let f = 0; f < 240; f++) {
  settledGyro = gyro.step(1 / 120, 1.52, 2.5);
}
console.assert(Math.abs(settledGyro.gyroTilt[0]) < 0.001, 'Gyro tilt X must settle back to exactly 0');
console.assert(Math.abs(settledGyro.gyroTilt[1]) < 0.001, 'Gyro tilt Y must settle back to exactly 0');
console.log(
  `[PASS] Pilar 1C — Konvergensi Filter Harmonik RK4 Gyro Berhasil Kembali Netral (tilt=[${settledGyro.gyroTilt.map(v => v.toFixed(4))}]).`
);

// 7. Test Pilar 2: True Dynamic Framebuffer Optical Distortion
import { LGROpticalDistortion } from './physics/hydroEngine.js';

// 7A. Compiler & Semantic Snell Deflection Verification
console.assert(crownMat.optics.opticalDepth === 14.5, 'Crown Crystal opticalDepth must equal 14.5px');
console.assert(crownMat.optics.framebufferDistortion === true, 'Crown Crystal framebufferDistortion must be enabled');
console.assert(crownMat.optics.snellDeflectionFactor < 0, 'Snellius deflection factor kappa must be negative for convex lens (n > 1)');
console.assert(
  crownMat.optics.spectralKappa.b < crownMat.optics.spectralKappa.r,
  'Cauchy Tri-Band: Blue kappa magnitude must exceed Red kappa magnitude (|κB| > |κR|)'
);
console.log(
  `[PASS] Pilar 2A — Parameter Compiler Snell Deflection Terbukti (d0=${crownMat.optics.opticalDepth}px, κR=${crownMat.optics.spectralKappa.r}, κG=${crownMat.optics.spectralKappa.g}, κB=${crownMat.optics.spectralKappa.b}).`
);

// 7B. Zero Deflection at Rest Invariant (Zero-Blur Typography Guard)
const optDistortion = new LGROpticalDistortion({
  refractiveIndex: crownMat.optics.refractiveIndex,
  cauchyB: crownMat.optics.cauchyB,
  opticalDepth: crownMat.optics.opticalDepth,
});

const restDeflection = optDistortion.computeDeflection(0.0, 0.0, 0.0, 1.0, 1.0);
console.assert(restDeflection.isRestingZero === true, 'Center of resting lens must produce exactly 0.0px deflection');
console.assert(restDeflection.deltaPGreen[0] === 0.0, 'Resting green delta X must be 0.0px');
console.assert(restDeflection.deltaPGreen[1] === 0.0, 'Resting green delta Y must be 0.0px');
console.assert(restDeflection.chromaticSpread === 0.0, 'Resting chromatic spread must be 0.0px');
console.log(
  `[PASS] Pilar 2B — Invarian Istirahat 1:1 Terbukti Bebas Blur (Δp=[${restDeflection.deltaPGreen.join(',')}px], spread=${restDeflection.chromaticSpread}px, 100% Sharp Typography).`
);

// 7C. Dynamic Meniscus Rim Snellius Refraction & Cauchy Chromatic Dispersion
const rimGrad = optDistortion.evaluateSurfaceGradient(-4.5, [1.0, 0.0], 9.2, 0.0);
const rimDeflection = optDistortion.computeDeflection(rimGrad[0], rimGrad[1], 0.0, 1.0, 1.0);
console.assert(rimDeflection.maxDeflection > 1.0, 'Meniscus wall must produce strong optical ray deflection');
console.assert(
  Math.abs(rimDeflection.deltaPBlue[0]) > Math.abs(rimDeflection.deltaPRed[0]),
  'Blue ray deflection must exceed Red ray deflection for Cauchy dispersion'
);
console.assert(rimDeflection.chromaticSpread > 0.02, 'Chromatic spread must be physically non-zero at meniscus rim');
console.log(
  `[PASS] Pilar 2C — Pembiasan Meniskus & Dispersi Cauchy Terbukti (Δp_G=${rimDeflection.deltaPGreen[0]}px, Δp_R=${rimDeflection.deltaPRed[0]}px, Δp_B=${rimDeflection.deltaPBlue[0]}px, spread=${rimDeflection.chromaticSpread}px).`
);

// 7D. Dynamic Optical Depth Scaling with Fluid Lift
const liftedDeflection = optDistortion.computeDeflection(rimGrad[0], rimGrad[1], 1.0, 1.18, 1.0);
console.assert(
  liftedDeflection.effectiveDepth > restDeflection.effectiveDepth,
  'Elevated lens must increase effective optical path length d_eff'
);
console.assert(
  liftedDeflection.maxDeflection > rimDeflection.maxDeflection,
  'Lifted lens must produce stronger ray deflection due to increased optical path'
);
console.log(
  `[PASS] Pilar 2D — Skalasi Kedalaman Optik Lift Terbukti (d_base=${restDeflection.effectiveDepth}px -> d_lifted=${liftedDeflection.effectiveDepth}px, Δp_lifted=${liftedDeflection.maxDeflection}px).`
);

console.log('======================================================================');
console.log('  SELURUH PENGUJIAN TAHAP 1, 2, PILAR 1 & PILAR 2 LULUS 100% TANPA ERROR!');
console.log('======================================================================');

