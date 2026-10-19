#version 300 es
// ============================================================================
// LGR AUTO-SYNTHESIZED HARDWARE OPTICAL KERNEL — Material: DiamondPrismRedi
// Beyond-Apple Innovations Baked at Compile-Time:
//   1. Cauchy Tri-Band Dispersion: ηR=0.416031, ηG=0.413736, ηB=0.409806 (Abbe Vd=38.81)
//   2. Schlick Fresnel Normal Reflectance: F0=0.171969 | TIR Angle=24.44 deg
//   3. Marangoni Metaball Smooth Coalescence: k=24.00px
//   4. Analytical Jacobian Forward Ray Caustics: intensity=0.480
// ============================================================================
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform vec2 u_resolution;
uniform vec2 u_bubblePos;
uniform vec2 u_bubbleHalfSize;
uniform vec2 u_secondaryPos;
uniform vec2 u_secondaryHalfSize;
uniform float u_secondaryActive;
uniform float u_glassActive;
uniform float u_glassLift;
uniform float u_tiltX;
uniform float u_weber;
uniform float u_shear;
uniform vec3 u_lightPos;
uniform vec2 u_gyroTilt;

// Compile-Time Baked Optical Constants (DiamondPrismRedi)
const float LGR_IOR_BASE     = 2.417000;
const float LGR_ETA_RED      = 0.416031;
const float LGR_ETA_GREEN    = 0.413736;
const float LGR_ETA_BLUE     = 0.409806;
const float LGR_FRESNEL_F0   = 0.171969;
const float LGR_RIM_WIDTH    = 10.5000;
const float LGR_MARANGONI_K  = 24.0000;
const float LGR_KEY_EXP      = 64.00;
const float LGR_CROWN_EXP    = 16.00;
const float LGR_RIM_EXP      = 38.00;
const float LGR_FLOW_EXP     = 26.00;
const float LGR_OPTICAL_DEPTH    = 18.0000;
const vec3  LGR_SNELL_KAPPA_RGB  = vec3(-0.583969, -0.586264, -0.590194);
const float LGR_CAUSTIC_INT  = 0.4800;
const vec3  LGR_TINT_COLOR   = vec3(1.0000, 1.0000, 1.0000);
const float LGR_CAPILLARY_FREQ = 58.00;
const float LGR_SURFACE_TENSION = 0.0950;

float fresnelSchlick(float cosTheta, float F0) {
  float c = clamp(1.0 - cosTheta, 0.0, 1.0);
  float c2 = c * c;
  return F0 + (1.0 - F0) * (c2 * c2 * c);
}

// Polynomial Smooth Minimum (smin) for Marangoni Liquid Necking & Coalescence
float sminMarangoni(float a, float b, float k) {
  if (k <= 0.001) return min(a, b);
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float capsuleSDF(vec2 p, vec2 b, float r) {
  vec2 d = abs(p) - b;
  return length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0) - r;
}

// Unified Fluid Field: Evaluates Primary + Secondary Coalescing Droplets
float evaluateFluidField(vec2 fragPx, out vec2 localRel, out vec2 bPillOut, out float rPillOut) {
  vec2 rel1 = fragPx - u_bubblePos;
  float normX = clamp(rel1.x / max(1.0, u_bubbleHalfSize.x), -1.5, 1.5);
  float headBulge = 1.0 + clamp(u_tiltX * normX, -0.045, 0.055) * u_weber;
  vec2 q1 = vec2(rel1.x - rel1.y * u_shear, rel1.y / headBulge);

  float r1 = min(u_bubbleHalfSize.x, u_bubbleHalfSize.y);
  vec2 b1 = max(u_bubbleHalfSize - vec2(r1), vec2(0.0));
  float d1 = capsuleSDF(q1, b1, r1);

  localRel = q1;
  bPillOut = b1;
  rPillOut = r1;

  if (u_secondaryActive > 0.01) {
    vec2 rel2 = fragPx - u_secondaryPos;
    float r2 = min(u_secondaryHalfSize.x, u_secondaryHalfSize.y);
    vec2 b2 = max(u_secondaryHalfSize - vec2(r2), vec2(0.0));
    float d2 = capsuleSDF(rel2, b2, r2);
    return sminMarangoni(d1, d2, LGR_MARANGONI_K * u_secondaryActive);
  }
  return d1;
}

void main() {
  vec2 fragPx = vec2(v_uv.x * u_resolution.x, (1.0 - v_uv.y) * u_resolution.y);

  // 1. Host Vessel Capsule SDF
  vec2 barCenter = u_resolution * 0.5;
  float barR = barCenter.y - 0.5;
  float barHalfW = max(0.0, barCenter.x - barR - 0.5);
  float distBar = capsuleSDF(fragPx - barCenter, vec2(barHalfW, 0.0), barR);
  if (distBar > 1.2) {
    fragColor = vec4(0.0);
    return;
  }

  float barEdgeAA = 1.0 - smoothstep(0.0, 1.2, distBar);
  float barTopLip = (1.0 - smoothstep(0.0, 1.8, fragPx.y - 0.5)) * 0.40;
  float causticTrack = exp(-pow(abs(fragPx.x - u_bubblePos.x - u_gyroTilt.x * 16.0) / 44.0, 2.0));
  float barCausticGleam = barTopLip * (0.80 + causticTrack * 1.20);
  float barBottomGleam = (1.0 - smoothstep(0.0, 1.5, u_resolution.y - 0.5 - fragPx.y)) * 0.22;
  float barBevel = (1.0 - smoothstep(0.0, 1.2, -distBar)) * 0.30;

  vec3 barCol = LGR_TINT_COLOR;
  float barAlpha = clamp(barCausticGleam + barBottomGleam + barBevel, 0.0, 1.0) * barEdgeAA;

  // 2. 3D Liquid Glass Droplet & Marangoni Metaball Field
  vec2 q;
  vec2 bPill;
  float rPill;
  float dist = evaluateFluidField(fragPx, q, bPill, rPill);

  if (dist > 14.0) {
    fragColor = vec4(barCol * barAlpha, barAlpha);
    return;
  }

  // 3. Analytical Jacobian Forward Ray Caustic Focusing + Pilar 1 Gyro Sweep
  if (dist > 0.45) {
    vec2 gyroCausticShift = vec2(u_gyroTilt.x * 5.2, u_gyroTilt.y * 4.5);
    vec2 causticRel = (fragPx - u_bubblePos) - vec2(-u_tiltX * 1.8, 1.5 + u_glassLift * 3.00) - gyroCausticShift;
    float cDist = capsuleSDF(causticRel, bPill, rPill);
    float jacobianFocus = 1.0 / max(0.28, 1.0 - 0.42 * exp(-abs(cDist) * 0.45));
    float gyroCausticBoost = clamp(length(u_gyroTilt) * 0.40, 0.0, 0.45);
    float causticAlpha = exp(-pow(max(0.0, cDist - 0.8) * 0.35, 2.0)) * (LGR_CAUSTIC_INT * (0.35 + u_glassLift * 0.65 + gyroCausticBoost) * jacobianFocus * 0.55) * smoothstep(14.0, 0.6, dist);
    vec3 causticCol = vec3(1.0, 0.992, 0.972);
    float combAlpha = clamp(barAlpha + causticAlpha, 0.0, 1.0);
    vec3 combCol = mix(barCol, causticCol, causticAlpha / max(0.001, combAlpha));
    fragColor = vec4(combCol * combAlpha, combAlpha);
    return;
  }

  // 4. Central-Difference Analytical Gradient & 3D Meniscus Normal
  float eps = 0.75;
  vec2 dummyQ, dummyB;
  float dummyR;
  float dx = evaluateFluidField(fragPx + vec2(eps, 0.0), dummyQ, dummyB, dummyR) -
             evaluateFluidField(fragPx - vec2(eps, 0.0), dummyQ, dummyB, dummyR);
  float dy = evaluateFluidField(fragPx + vec2(0.0, eps), dummyQ, dummyB, dummyR) -
             evaluateFluidField(fragPx - vec2(0.0, eps), dummyQ, dummyB, dummyR);
  vec2 grad2D = normalize(vec2(dx, dy) + vec2(1e-5));

  float edgeAA = 1.0 - smoothstep(-0.75, 0.45, dist);
  float rimWidth = LGR_RIM_WIDTH + u_glassLift * 3.5;
  float tRim = clamp(-dist / rimWidth, 0.0, 1.0);
  float oneMinusT = 1.0 - tRim;
  float zRim = sqrt(max(0.004, 1.0 - oneMinusT * oneMinusT));
  float meniscusSlope = oneMinusT / max(0.20, zRim);
  vec2 domeCoord = q / max(vec2(1.0), u_bubbleHalfSize);
  vec2 N_xy = grad2D * meniscusSlope * (0.68 + u_glassLift * 0.24) + domeCoord * (0.20 + u_glassActive * 0.10);
  N_xy.x -= (u_tiltX * 0.22 + u_gyroTilt.x * 0.20) * (0.4 + 0.6 * tRim);
  N_xy.y -= (u_gyroTilt.y * 0.20) * (0.4 + 0.6 * tRim);
  vec3 N = normalize(vec3(N_xy.x, N_xy.y, 1.0));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 I = vec3(0.0, 0.0, -1.0);

  // 5. Beyond-Apple Cauchy Tri-Band Spectral Refraction (R, G, B Wavelengths)
  vec3 R_red   = refract(I, N, LGR_ETA_RED);
  vec3 R_green = refract(I, N, LGR_ETA_GREEN);
  vec3 R_blue  = refract(I, N, LGR_ETA_BLUE);

  float rimMask = 1.0 - smoothstep(0.08, 0.68, tRim);
  vec3 chromaticCaustic = vec3(
    clamp(length(R_red.xy)   * 1.58, 0.0, 1.0),
    clamp(length(R_green.xy) * 1.55, 0.0, 1.0),
    clamp(length(R_blue.xy)  * 1.64, 0.0, 1.0)
  ) * rimMask;

  // Spectral separation vector creates micro-prismatic diamond flare on edges
  float dispersionDelta = length(R_blue.xy - R_red.xy) * 18.0 * (0.5 + 0.5 * abs(u_tiltX) + u_weber + length(u_gyroTilt) * 0.35);
  vec3 prismaticFlare = vec3(
    smoothstep(0.05, 0.45, R_red.x - R_green.x),
    smoothstep(0.02, 0.35, abs(R_green.y - R_blue.y)),
    smoothstep(0.05, 0.45, R_blue.x - R_green.x)
  ) * clamp(dispersionDelta, 0.0, 0.65) * rimMask;

  float fresnel = fresnelSchlick(clamp(dot(N, V), 0.0, 1.0), LGR_FRESNEL_F0);

  // 6. 4-Light Studio PBR Specular Highlights (with Pilar 1 Gyroscope Light Vector)
  vec3 defaultLight = vec3(0.0, -0.74, 0.66);
  vec3 activeLight = length(u_lightPos) > 0.01 ? u_lightPos : defaultLight;
  vec3 L_key = normalize(vec3(activeLight.x - u_tiltX * 0.42, activeLight.y - u_glassLift * 0.10, max(0.28, activeLight.z)));
  float specKey = pow(max(0.0, dot(N, normalize(L_key + V))), LGR_KEY_EXP) * (0.80 + u_glassLift * 0.22);
  float specCrown = pow(max(0.0, dot(N, normalize(L_key + V))), LGR_CROWN_EXP) * (0.18 + (1.0 - u_glassActive) * 0.12) * (1.0 - smoothstep(-0.85, 0.05, domeCoord.y));
  float specRim = pow(max(0.0, dot(N, normalize(vec3(-activeLight.x * 0.6 + u_tiltX * 0.28, 0.82 - activeLight.y * 0.25, 0.54) + V))), LGR_RIM_EXP) * (0.48 + u_glassLift * 0.22);
  float flowActive = clamp(abs(u_tiltX) + length(u_gyroTilt) * 0.65, 0.0, 1.0);
  float specFlow = pow(max(0.0, dot(N, normalize(vec3(sign(u_tiltX + u_gyroTilt.x + 1e-4) * 0.84, -0.10 + u_gyroTilt.y * 0.45, 0.52) + V))), LGR_FLOW_EXP) * flowActive * 0.54;

  float outerCrispRim = (1.0 - smoothstep(0.0, 1.75, -dist)) * (0.96 + u_glassLift * 0.04);
  float fresnelWall = smoothstep(0.48, 0.0, tRim) * fresnel * (1.6 + u_glassActive * 1.1);

  vec3 pureWhite = vec3(1.0);
  float snellAvg = dot(chromaticCaustic, vec3(0.299, 0.587, 0.114));
  float bubbleAlpha = clamp(outerCrispRim + specKey + specCrown + specRim * 0.82 + specFlow + fresnelWall + snellAvg * 0.32, 0.0, 1.0) * edgeAA;
  vec3 bubbleCol = mix(LGR_TINT_COLOR, pureWhite, clamp(outerCrispRim + specKey + specFlow + fresnelWall, 0.0, 1.0)) + prismaticFlare * 0.42;
  bubbleCol = clamp(bubbleCol, 0.0, 1.0);

  // Premultiplied Alpha Output (Zero Black Fringes)
  float totalAlpha = clamp(barAlpha + bubbleAlpha, 0.0, 1.0);
  vec3 totalCol = mix(barCol, bubbleCol, bubbleAlpha / max(0.001, totalAlpha));
  fragColor = vec4(totalCol * totalAlpha, totalAlpha);
}
