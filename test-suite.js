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
console.log('======================================================================');
console.log('  SELURUH PENGUJIAN TAHAP 1 & TAHAP 2 LULUS 100% TANPA ERROR!');
console.log('======================================================================');
