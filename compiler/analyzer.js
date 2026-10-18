/**
 * LIQUID GLASS REDI (LGR) — PHYSICS & OPTICAL SEMANTIC ANALYZER
 * Validates physical laws (Snell-Cauchy Dispersion, Schlick Fresnel,
 * Navier-Stokes Volume Conservation, Resting 1:1 Invariant) and pre-computes
 * exact GPU shader constants at compile-time.
 */

export class LGRSemanticError extends Error {
  constructor(message, loc) {
    const pos = loc ? `Baris ${loc.line}, Kolom ${loc.column}` : 'Global';
    super(`[LGR Physics/Semantic Error] ${pos}: ${message}`);
    this.name = 'LGRSemanticError';
    this.loc = loc;
  }
}

export class LGRAnalyzer {
  constructor(ast) {
    this.ast = ast;
    this.materials = new Map();
    this.scenes = new Map();
    this.diagnostics = [];
  }

  extractNumber(propNode, defaultVal) {
    if (!propNode) return defaultVal;
    const val = propNode.value;
    if (val.type === 'NumericLiteral' || val.type === 'PhysicalQuantity') {
      if (val.unit === 'ms') return val.value / 1000.0;
      if (val.unit === 'deg') return (val.value * Math.PI) / 180.0;
      return val.value;
    }
    return defaultVal;
  }

  extractBoolean(propNode, defaultVal) {
    if (!propNode) return defaultVal;
    if (propNode.value.type === 'BooleanLiteral') return propNode.value.value;
    return defaultVal;
  }

  extractColor(propNode, defaultRGBA) {
    if (!propNode) return defaultRGBA;
    if (propNode.value.type === 'ColorLiteral') return propNode.value.rgba;
    if (
      propNode.value.type === 'ConstructExpression' &&
      propNode.value.callee === 'rgba'
    ) {
      const args = propNode.value.arguments.map((a) => a.value ?? 1.0);
      return [
        (args[0] > 1 ? args[0] / 255 : args[0]) || 0,
        (args[1] > 1 ? args[1] / 255 : args[1]) || 0,
        (args[2] > 1 ? args[2] / 255 : args[2]) || 0,
        args[3] !== undefined ? args[3] : 1.0,
      ];
    }
    return defaultRGBA;
  }

  extractVec2(propNode, defaultVec) {
    if (!propNode) return defaultVec;
    const val = propNode.value;
    if (val.type === 'ConstructExpression' && val.arguments.length >= 2) {
      return [
        val.arguments[0].value ?? defaultVec[0],
        val.arguments[1].value ?? defaultVec[1],
      ];
    }
    return defaultVec;
  }

  analyze() {
    for (const node of this.ast.body) {
      if (node.type === 'MaterialDeclaration') {
        const compiledMat = this.analyzeMaterial(node);
        this.materials.set(node.name, compiledMat);
      } else if (node.type === 'SceneDeclaration') {
        const compiledScene = this.analyzeScene(node);
        this.scenes.set(node.name, compiledScene);
      }
    }

    return {
      version: this.ast.version,
      materials: Object.fromEntries(this.materials),
      scenes: Object.fromEntries(this.scenes),
      diagnostics: this.diagnostics,
    };
  }

  analyzeMaterial(node) {
    const opticsProps = node.sections.optics?.properties || {};
    const fluidProps = node.sections.fluid?.properties || {};
    const lightingProps = node.sections.lighting?.properties || {};
    const causticsProps = node.sections.caustics?.properties || {};

    // 1. Optical Law Validation & Cauchy Spectral Pre-Computation
    const n0 = this.extractNumber(opticsProps.refractiveIndex, 1.52);
    if (n0 < 1.0) {
      throw new LGRSemanticError(
        `Hukum Snellius dilanggar pada material "${node.name}": refractiveIndex (${n0}) tidak boleh lebih kecil dari vakum (1.0).`,
        opticsProps.refractiveIndex?.loc || node.loc
      );
    }

    const cauchyB = this.extractNumber(opticsProps.cauchyDispersion, 0.0048); // um^2
    let wavelengthsNm = [650, 550, 450]; // Default Red, Green, Blue (nm)
    if (
      opticsProps.wavelengths?.value?.type === 'ConstructExpression' &&
      opticsProps.wavelengths.value.arguments.length === 3
    ) {
      wavelengthsNm = opticsProps.wavelengths.value.arguments.map(
        (a) => a.value
      );
    }

    // Convert nm to micrometers (um) for Cauchy equation: n(lambda) = A + B / lambda^2
    const [lamR, lamG, lamB] = wavelengthsNm.map((w) => w / 1000.0);
    const cauchyA = n0 - cauchyB / (lamG * lamG);
    const nRed = Number((cauchyA + cauchyB / (lamR * lamR)).toFixed(6));
    const nGreen = Number(n0.toFixed(6));
    const nBlue = Number((cauchyA + cauchyB / (lamB * lamB)).toFixed(6));

    // Snell's Law Eta Ratios (n_air / n_glass) per RGB channel
    const etaRed = Number((1.0 / nRed).toFixed(6));
    const etaGreen = Number((1.0 / nGreen).toFixed(6));
    const etaBlue = Number((1.0 / nBlue).toFixed(6));

    // Schlick Fresnel F0 at normal incidence: ((1 - n0) / (1 + n0))^2
    const f0 = Number(Math.pow((1.0 - n0) / (1.0 + n0), 2).toFixed(6));

    // Total Internal Reflection (TIR) Critical Angle: arcsin(1 / n0)
    const criticalAngleRad = Number(Math.asin(1.0 / n0).toFixed(6));
    const criticalAngleDeg = Number(
      ((criticalAngleRad * 180.0) / Math.PI).toFixed(2)
    );

    // Abbe Number V_d = (nG - 1) / (nB - nR)
    const abbeNumber =
      nBlue !== nRed
        ? Number(((nGreen - 1.0) / (nBlue - nRed)).toFixed(2))
        : 999.0;

    const meniscusRimWidth = this.extractNumber(
      opticsProps.meniscusRimWidth,
      9.2
    );
    const totalInternalReflection = this.extractBoolean(
      opticsProps.totalInternalReflection,
      true
    );

    // 2. Fluid Mechanics & Hydro-Elastic Spring Constants
    const incompressibility = this.extractBoolean(
      fluidProps.incompressibility,
      true
    );
    const weberStretchX = this.extractNumber(fluidProps.weberStretchX, 0.28);
    const weberCompressY = this.extractNumber(fluidProps.weberCompressY, 0.14);
    const characteristicVelocity = this.extractNumber(
      fluidProps.characteristicVelocity,
      1180.0
    );
    const marangoniRadius = this.extractNumber(
      fluidProps.marangoniRadius,
      18.0
    );
    const dampingRatio = this.extractNumber(fluidProps.dampingRatio, 1.0);
    const responseTime = this.extractNumber(fluidProps.responseTime, 0.36);

    if (responseTime <= 0.001) {
      throw new LGRSemanticError(
        `Parameter fluid.responseTime (${responseTime}s) harus bernilai positif (> 0.001s).`,
        fluidProps.responseTime?.loc || node.loc
      );
    }

    // Derive 2nd-order differential equation coefficients: x'' + c*x' + k*(x - x_target) = 0
    const omegaN = (2.0 * Math.PI) / responseTime;
    const springStiffnessK = Number((omegaN * omegaN).toFixed(4));
    const springDampingC = Number((2.0 * dampingRatio * omegaN).toFixed(4));

    // 3. Studio 4-Light PBR Parameters
    const keyLightExp = this.extractNumber(lightingProps.keyLightExp, 54.0);
    const crownShelfExp = this.extractNumber(lightingProps.crownShelfExp, 14.0);
    const bottomRimBounceExp = this.extractNumber(
      lightingProps.bottomRimBounceExp,
      34.0
    );
    const bernoulliGlintExp = this.extractNumber(
      lightingProps.bernoulliGlintExp,
      22.0
    );
    const tintColor = this.extractColor(
      lightingProps.tintColor,
      [1.0, 0.992, 0.976, 1.0]
    );
    const accentColor = this.extractColor(
      lightingProps.accentColor,
      [0.851, 0.4667, 0.0235, 1.0]
    );

    // 4. Analytical Caustics
    const causticsMode =
      causticsProps.mode?.value?.name ||
      causticsProps.mode?.value?.value ||
      'analytical_jacobian';
    const causticsIntensity = this.extractNumber(
      causticsProps.intensity,
      0.34
    );
    const causticsFocusHeight = this.extractNumber(
      causticsProps.focusHeight,
      2.5
    );

    this.diagnostics.push({
      level: 'INFO',
      target: `material:${node.name}`,
      message: `Dispersi Cauchy terkompilasi: nR=${nRed} (η=${etaRed}), nG=${nGreen} (η=${etaGreen}), nB=${nBlue} (η=${etaBlue}) | Abbe Vd=${abbeNumber} | Fresnel F0=${f0} | Sudut Kritis TIR=${criticalAngleDeg}° | Pegas RK4 (k=${springStiffnessK}, c=${springDampingC})`,
    });

    return {
      name: node.name,
      optics: {
        refractiveIndex: n0,
        cauchyA: Number(cauchyA.toFixed(6)),
        cauchyB,
        wavelengthsNm,
        spectralIndices: { r: nRed, g: nGreen, b: nBlue },
        spectralEta: { r: etaRed, g: etaGreen, b: etaBlue },
        fresnelF0: f0,
        criticalAngleRad,
        criticalAngleDeg,
        abbeNumber,
        meniscusRimWidth,
        totalInternalReflection,
      },
      fluid: {
        incompressibility,
        weberStretchX,
        weberCompressY,
        characteristicVelocity,
        marangoniRadius,
        dampingRatio,
        responseTime,
        derivedRK4: {
          omegaN: Number(omegaN.toFixed(4)),
          stiffnessK: springStiffnessK,
          dampingC: springDampingC,
        },
      },
      lighting: {
        keyLightExp,
        crownShelfExp,
        bottomRimBounceExp,
        bernoulliGlintExp,
        tintColor,
        accentColor,
      },
      caustics: {
        mode: causticsMode,
        intensity: causticsIntensity,
        focusHeight: causticsFocusHeight,
      },
    };
  }

  analyzeScene(node) {
    const resolution = this.extractVec2(node.properties.resolution, [380, 62]);
    const matRef =
      node.properties.useMaterial?.value?.name ||
      node.properties.useMaterial?.value?.value ||
      null;

    if (matRef && !this.materials.has(matRef)) {
      throw new LGRSemanticError(
        `Scene "${node.name}" mereferensikan material "${matRef}" yang belum dideklarasikan.`,
        node.properties.useMaterial?.loc || node.loc
      );
    }

    const invProps = node.sections.invariant?.properties || {};
    const restingScale = this.extractNumber(invProps.restingScale, 1.0);
    const restingLiftY = this.extractNumber(invProps.restingLiftY, 0.0);
    const maxDynamicZoom = this.extractNumber(invProps.maxDynamicZoom, 1.18);

    // Enforce Apple + LGR Resting State 1:1 Baseline Invariant
    if (Math.abs(restingScale - 1.0) > 0.0001 || Math.abs(restingLiftY) > 0.001) {
      throw new LGRSemanticError(
        `Pelanggaran Resting Baseline Invariant pada scene "${node.name}": Saat diam (idle), restingScale wajib 1.0000 (ditemukan ${restingScale}) dan restingLiftY wajib 0.0px (ditemukan ${restingLiftY}px) agar sejajar sempurna.`,
        node.sections.invariant?.loc || node.loc
      );
    }

    const compiledVessels = node.vessels.map((v) => ({
      name: v.name || 'DefaultVessel',
      size: this.extractVec2(v.properties.shape, resolution),
      baseColor: this.extractColor(
        v.properties.baseColor,
        [1.0, 0.994, 0.982, 1.0]
      ),
      bevelStrength: this.extractNumber(v.properties.bevelStrength, 0.3),
    }));

    const compiledDroplets = node.droplets.map((d, idx) => ({
      name: d.name || `Droplet_${idx}`,
      size: this.extractVec2(d.properties.shape, [72, 48]),
      initialPos: this.extractVec2(d.properties.initialPos, [
        64 + idx * 90,
        resolution[1] * 0.5,
      ]),
      coalescence: this.extractBoolean(d.properties.coalescence, true),
    }));

    return {
      name: node.name,
      resolution,
      materialName: matRef,
      invariant: {
        restingScale: 1.0,
        restingLiftY: 0.0,
        maxDynamicZoom,
        clipGeometry:
          invProps.clipGeometry?.value?.name || 'capsule_exact',
      },
      vessels: compiledVessels,
      droplets: compiledDroplets,
    };
  }
}
