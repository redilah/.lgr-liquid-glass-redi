/**
 * LIQUID GLASS REDI (LGR) — STANDALONE SDK RUNTIME ENGINE
 * Version 1.0.0 (Crystal Genesis — 5 Pillars Unified)
 *
 * Universal 1-line plug-and-play runtime that mounts fluid physical
 * optical glass with Snellius dynamic deflection, Cauchy dispersion,
 * Gyroscope 3D caustics, Audio-Haptic resonance, and WebGPU compute shaders.
 */

import { compileLGRSource } from '../compiler/lgrc.js';
import { LGRLexer } from '../compiler/lexer.js';
import { LGRParser } from '../compiler/parser.js';
import { LGRAnalyzer } from '../compiler/analyzer.js';
import { LGRCodeGenerator } from '../compiler/codegen.js';
import { emitCABIHeader } from '../compiler/cabiEmitter.js';
import { emitLGRWasmBinary } from '../compiler/wasmEmitter.js';

import {
  RK4Spring1D,
  LGRGyroscopeController,
  LGROpticalDistortion,
  LGRHydroResonanceEngine,
  LGRWebGPUComputePipeline,
} from '../physics/hydroEngine.js';

import { LGR_VERTEX_SHADER, LGR_FRAGMENT_SHADER } from '../shaders/opticalKernel.js';

// Re-export all compiler & physics primitives
export {
  compileLGRSource,
  LGRLexer,
  LGRParser,
  LGRAnalyzer,
  LGRCodeGenerator,
  emitCABIHeader,
  emitLGRWasmBinary,
  RK4Spring1D,
  LGRGyroscopeController,
  LGROpticalDistortion,
  LGRHydroResonanceEngine,
  LGRWebGPUComputePipeline,
  LGR_VERTEX_SHADER,
  LGR_FRAGMENT_SHADER,
};

/**
 * Loads and instantiates an LGR WebAssembly binary.
 * @param {Uint8Array|ArrayBuffer} wasmBytes
 * @returns {Promise<{ rk4_step: Function, snell_deflect: Function, kelvin_freq: Function, instance: WebAssembly.Instance }>}
 */
export async function instantiateLGRWasm(wasmBytes) {
  if (!wasmBytes) {
    wasmBytes = emitLGRWasmBinary({});
  }
  const result = await WebAssembly.instantiate(wasmBytes);
  const exports = result.instance.exports;
  return {
    rk4_step: exports.rk4_step,
    snell_deflect: exports.snell_deflect,
    kelvin_freq: exports.kelvin_freq,
    instance: result.instance,
    module: result.module,
  };
}

/**
 * 1-LINE PLUG-AND-PLAY FACTORY API: createLiquidGlass()
 * Mounts an interactive Liquid Glass canvas onto any DOM element or container.
 *
 * @param {HTMLElement|string} target Container element or CSS selector
 * @param {Object} options Configuration options
 * @returns {Object} GlassController instance with .destroy(), .setMaterial(), .triggerImpulse()
 */
export function createLiquidGlass(target, options = {}) {
  let container = null;
  if (typeof target === 'string') {
    container = typeof document !== 'undefined' ? document.querySelector(target) : null;
  } else {
    container = target;
  }

  // Initialize Sub-Engines (5 Pillars)
  const gyroController = new LGRGyroscopeController({
    sensitivity: options.gyroSensitivity || 0.82,
    ergonomicPitchDeg: 35.0,
  });

  const distortionEngine = new LGROpticalDistortion({
    refractiveIndex: 1.52,
    cauchyB: 0.0052,
    opticalDepth: 14.5,
  });

  const resonanceEngine = new LGRHydroResonanceEngine({
    capillaryFrequencyHz: 48.0,
    surfaceTension: 0.0728,
    coalescenceSnapIntensity: 0.85,
    boundaryRestitution: 0.65,
    decayTimeMs: 65.0,
  });

  const computePipeline = new LGRWebGPUComputePipeline({
    gridWidth: 128,
    gridHeight: 64,
    waveSpeed: 340.0,
    viscousDamping: 0.045,
  });
  computePipeline.init();

  // Physics springs
  const springX = new RK4Spring1D(50, 320, 30);
  const springY = new RK4Spring1D(50, 320, 30);
  const scaleX = new RK4Spring1D(1.0, 420, 26);
  const scaleY = new RK4Spring1D(1.0, 420, 26);
  const liftSpring = new RK4Spring1D(0.0, 340, 28);
  const tiltSpring = new RK4Spring1D(0.0, 360, 24);

  let activeMaterial = null;
  let isRunning = true;
  let rafId = null;

  let canvas = null;
  let gl = null;
  let isCanvasDirect = false;

  if (container && typeof document !== 'undefined') {
    if (container.tagName && container.tagName.toLowerCase() === 'canvas') {
      canvas = container;
      isCanvasDirect = true;
    } else {
      canvas = document.createElement('canvas');
      canvas.className = 'lgr-glass-canvas';
      canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;';
      if (container.style && getComputedStyle(container).position === 'static') {
        container.style.position = 'relative';
      }
      container.appendChild(canvas);
    }
    gl = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: true });
  }

  function setMaterial(lgrSource) {
    if (typeof lgrSource === 'string') {
      const res = compileLGRSource(lgrSource);
      const firstMat = Object.values(res.ir.materials)[0];
      if (firstMat) activeMaterial = firstMat;
    } else if (lgrSource && typeof lgrSource === 'object') {
      activeMaterial = lgrSource;
    }
    if (activeMaterial) {
      if (activeMaterial.optics) {
        distortionEngine.refractiveIndex = activeMaterial.optics.refractiveIndex;
        distortionEngine.opticalDepth = activeMaterial.optics.opticalDepth || 14.5;
      }
      if (activeMaterial.resonance) {
        resonanceEngine.capillaryFrequencyHz = activeMaterial.resonance.capillaryFrequencyHz;
        resonanceEngine.surfaceTension = activeMaterial.resonance.surfaceTension;
      }
      if (activeMaterial.compute) {
        computePipeline.waveSpeed = activeMaterial.compute.waveSpeed;
        computePipeline.viscousDamping = activeMaterial.compute.viscousDamping;
      }
    }
  }

  // Compile default material if provided
  if (options.material) {
    setMaterial(options.material);
  }

  // Enable hardware sensor if requested
  if (options.gyroscope && typeof window !== 'undefined') {
    gyroController.enableHardwareSensor().catch(() => {});
  }

  // Trigger impulse / bounce
  function triggerImpulse(intensity = 0.5) {
    scaleX.impulse(intensity);
    scaleY.impulse(-intensity * 0.75);
    resonanceEngine.triggerCoalescenceSnap();
    computePipeline.injectShockwave(64, 32, 6.0, 4.0 * intensity);
    computePipeline.step(0.016);
  }

  // Teardown
  function destroy() {
    isRunning = false;
    if (rafId && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(rafId);
    if (!isCanvasDirect && canvas && canvas.parentNode) {
      canvas.parentNode.removeChild(canvas);
    }
    computePipeline.clear();
  }

  return {
    canvas,
    gl,
    gyroController,
    distortionEngine,
    resonanceEngine,
    computePipeline,
    setMaterial,
    triggerImpulse,
    destroy,
    getState: () => ({
      isResting1to1: Math.abs(scaleX.value - 1.0) < 0.001 && Math.abs(scaleY.value - 1.0) < 0.001 && liftSpring.value === 0.0,
      zoom: scaleX.value,
      peakWaveAmplitude: computePipeline.peakAmplitude,
    }),
  };
}
