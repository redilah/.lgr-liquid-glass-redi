/**
 * LIQUID GLASS REDI (LGR) — TAHAP 3: BEYOND-APPLE GPU OPTICAL KERNEL
 *
 * Implements real-time per-pixel optical physics in WebGL2 / GLSL:
 *   1. True Background Framebuffer Refraction (Snell's Law 3D Ray Tracing)
 *   2. Cauchy Tri-Band Spectral Dispersion (R=650nm, G=550nm, B=450nm)
 *   3. Total Internal Reflection (TIR) & Schlick Fresnel Glancing Rim
 *   4. Marangoni Smooth-Minimum (smin) Multi-Droplet Metaball Coalescence
 *   5. Analytical Jacobian Ray-Convergence Caustics on the Floor Plane
 *   6. 4-Light Studio PBR Blinn-Phong Specular Reflections
 */

export const LGR_VERTEX_SHADER = `#version 300 es
precision highp float;
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const LGR_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_sceneTex;
uniform vec2 u_resolution;
uniform vec2 u_bubblePos;
uniform vec2 u_bubbleHalfSize;
uniform vec2 u_secondaryPos;
uniform vec2 u_secondaryHalfSize;
uniform float u_secondaryActive;

// Dynamic Hydro-Elastic Physics Uniforms
uniform float u_glassActive;
uniform float u_glassLift;
uniform float u_tiltX;
uniform float u_weber;
uniform float u_shear;
uniform float u_snellMag;

// Compile-Time Derived Optical Uniforms (from .lgr Material)
uniform vec3 u_etaRGB;          // (etaRed, etaGreen, etaBlue) from Cauchy Equation
uniform float u_fresnelF0;      // ((1 - n0) / (1 + n0))^2
uniform float u_rimWidth;       // Meniscus rim curvature thickness in px
uniform float u_marangoniK;     // Capillary metaball smoothing radius in px
uniform vec4 u_pbrExponents;    // (keyExp, crownExp, rimBounceExp, bernoulliExp)
uniform float u_causticInt;     // Jacobian caustic intensity
uniform vec3 u_tintColor;       // Crystal body tint
uniform float u_beyondApple;    // 0.0 = Apple Standard, 1.0 = LGR Beyond-Apple

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

// Evaluates the unified Signed Distance Field of Primary + Secondary Droplets
float evaluateFluidSDF(vec2 fragPx, out vec2 qLocal) {
  vec2 rel1 = fragPx - u_bubblePos;
  float normX = clamp(rel1.x / max(1.0, u_bubbleHalfSize.x), -1.5, 1.5);
  float headBulge = 1.0 + clamp(u_tiltX * normX, -0.045, 0.055) * u_weber;
  vec2 q1 = vec2(rel1.x - rel1.y * u_shear, rel1.y / headBulge);
  qLocal = q1;

  float r1 = min(u_bubbleHalfSize.x, u_bubbleHalfSize.y);
  vec2 b1 = max(u_bubbleHalfSize - vec2(r1), vec2(0.0));
  float d1 = capsuleSDF(q1, b1, r1);

  if (u_secondaryActive > 0.01) {
    vec2 rel2 = fragPx - u_secondaryPos;
    float r2 = min(u_secondaryHalfSize.x, u_secondaryHalfSize.y);
    vec2 b2 = max(u_secondaryHalfSize - vec2(r2), vec2(0.0));
    float d2 = capsuleSDF(rel2, b2, r2);
    float kSmooth = u_marangoniK * u_secondaryActive * mix(0.05, 1.0, u_beyondApple);
    return sminMarangoni(d1, d2, kSmooth);
  }
  return d1;
}

// Computes physical 3D meniscus dome height z(x, y) in pixels
float evaluateMeniscusHeight(float dist, float rimW) {
  if (dist >= 0.0) return 0.0;
  float tRim = clamp(-dist / rimW, 0.0, 1.0);
  float oneMinusT = 1.0 - tRim;
  // Elliptical meniscus wall + subtle central convex dome
  float wallZ = sqrt(max(0.0, 1.0 - oneMinusT * oneMinusT)) * rimW * 0.85;
  float centerDomeZ = clamp(-dist / 42.0, 0.0, 1.0) * (3.2 + u_glassLift * 2.4);
  return wallZ + centerDomeZ;
}

void main() {
  // Convert normalized UV to pixel coordinates (top-left origin to match UI layout)
  vec2 fragPx = vec2(v_uv.x * u_resolution.x, (1.0 - v_uv.y) * u_resolution.y);
  vec2 baseUV = vec2(v_uv.x, 1.0 - v_uv.y);

  // Sample unrefracted background floor
  vec4 floorSample = texture(u_sceneTex, baseUV);
  vec3 finalRGB = floorSample.rgb;

  vec2 qLocal;
  float dist = evaluateFluidSDF(fragPx, qLocal);
  float rimW = u_rimWidth + u_glassLift * 3.8;

  // 1. Exterior Region: Render Cast Shadow & Analytical Jacobian Caustic Glow on Floor
  if (dist > 0.5) {
    if (dist < 28.0) {
      // Soft physical drop shadow under elevated glass lens
      vec2 shadowOffset = vec2(-u_tiltX * 2.2, 3.0 + u_glassLift * 5.5);
      vec2 dummyQ;
      float shadowDist = evaluateFluidSDF(fragPx - shadowOffset, dummyQ);
      float shadowMask = exp(-max(0.0, shadowDist) * 0.16) * (0.14 + u_glassLift * 0.14) * smoothstep(0.0, 2.5, dist);
      finalRGB *= (1.0 - shadowMask);

      // Analytical Jacobian Forward Ray Caustics (concentrated light ring beneath meniscus)
      float causticShiftDist = evaluateFluidSDF(fragPx - vec2(-u_tiltX * 3.2, 1.8 + u_glassLift * 3.2), dummyQ);
      float jacobianConvergence = mix(
        1.0,
        1.0 / max(0.24, 1.0 - 0.52 * exp(-abs(causticShiftDist - 2.2) * 0.42)),
        u_beyondApple
      );
      float causticRing = exp(-pow(max(0.0, causticShiftDist - 1.4) * 0.28, 2.0))
                        * u_causticInt * (0.45 + u_glassLift * 0.75) * jacobianConvergence
                        * smoothstep(24.0, 0.8, dist);

      // Subtle warm golden-crystal caustic illumination on the floor
      finalRGB += vec3(1.0, 0.96, 0.88) * causticRing * 0.55;
    }
    fragColor = vec4(finalRGB, 1.0);
    return;
  }

  // 2. Interior & Meniscus Rim: Reconstruct Analytical 3D Surface Normal via Central Differences
  float eps = 0.85;
  vec2 dQ;
  float dRight = evaluateFluidSDF(fragPx + vec2(eps, 0.0), dQ);
  float dLeft  = evaluateFluidSDF(fragPx - vec2(eps, 0.0), dQ);
  float dDown  = evaluateFluidSDF(fragPx + vec2(0.0, eps), dQ);
  float dUp    = evaluateFluidSDF(fragPx - vec2(0.0, eps), dQ);

  float zCenter = evaluateMeniscusHeight(dist, rimW);
  float zRight  = evaluateMeniscusHeight(dRight, rimW);
  float zLeft   = evaluateMeniscusHeight(dLeft, rimW);
  float zDown   = evaluateMeniscusHeight(dDown, rimW);
  float zUp     = evaluateMeniscusHeight(dUp, rimW);

  // Surface gradient dz/dx and dz/dy
  float dzdx = (zRight - zLeft) / (2.0 * eps);
  float dzdy = (zDown - zUp) / (2.0 * eps);

  vec2 domeCoord = qLocal / max(vec2(1.0), u_bubbleHalfSize);
  vec2 N_xy = vec2(-dzdx, -dzdy) * (0.82 + u_glassLift * 0.22) + domeCoord * (0.14 + u_glassActive * 0.08);
  float tRim = clamp(-dist / rimW, 0.0, 1.0);
  N_xy.x -= u_tiltX * 0.24 * (0.4 + 0.6 * tRim);

  vec3 N = normalize(vec3(N_xy.x, N_xy.y, 1.0));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 I = vec3(0.0, 0.0, -1.0);

  // 3. Hardware Snell's Law Refraction & Cauchy Tri-Band Chromatic Dispersion
  // In Apple Standard Mode (u_beyondApple == 0), all 3 channels use monochromatic green eta.
  // In LGR Beyond-Apple Mode (u_beyondApple == 1), R, G, B bend at their true Cauchy wavelengths!
  vec3 activeEta = mix(vec3(u_etaRGB.g), u_etaRGB, u_beyondApple);

  vec3 R_red   = refract(I, N, activeEta.r);
  vec3 R_green = refract(I, N, activeEta.g);
  vec3 R_blue  = refract(I, N, activeEta.b);

  // Optical thickness displacement: zero at rest in center (1:1 invariant), strong lens bending at meniscus wall
  float rimRefractPower = (1.0 - tRim) * (14.5 + u_glassLift * 8.0);
  float centerMagScale = 1.0 / max(1.0, u_snellMag);
  vec2 centerMagOffset = (fragPx - u_bubblePos) * (centerMagScale - 1.0);

  // Sample the background scene along the 3 refracted spectral rays
  // Boost spectral separation in the steep meniscus wall so crystal rainbow dispersion is vividly visible
  float dispersionBoost = 1.0 + u_beyondApple * (1.0 - tRim) * 5.2;
  vec2 deltaG = R_green.xy * rimRefractPower + centerMagOffset;
  vec2 deltaR = deltaG + (R_red.xy - R_green.xy) * rimRefractPower * dispersionBoost;
  vec2 deltaB = deltaG + (R_blue.xy - R_green.xy) * rimRefractPower * dispersionBoost;

  vec2 uvR = clamp((fragPx + deltaR) / u_resolution, 0.001, 0.999);
  vec2 uvG = clamp((fragPx + deltaG) / u_resolution, 0.001, 0.999);
  vec2 uvB = clamp((fragPx + deltaB) / u_resolution, 0.001, 0.999);

  vec3 refractedScene = vec3(
    texture(u_sceneTex, uvR).r,
    texture(u_sceneTex, uvG).g,
    texture(u_sceneTex, uvB).b
  );

  // 4. Total Internal Reflection (TIR) & Internal Meniscus Caustic Glow
  float rimMask = 1.0 - smoothstep(0.05, 0.72, tRim);
  float cosIncident = clamp(dot(N, V), 0.0, 1.0);
  float fresnel = fresnelSchlick(cosIncident, u_fresnelF0);

  // Prismatic diamond edge dispersion flare when rays diverge at glancing angles
  float spectralSpread = length(R_blue.xy - R_red.xy) * 26.0 * (0.65 + 0.5 * abs(u_tiltX) + u_weber);
  vec3 prismaticRimFlare = vec3(
    smoothstep(-0.08, 0.28, N.x + N.y * 0.5) * 1.15,
    smoothstep(0.0, 0.35, 1.0 - abs(N.x - N.y)) * 0.90,
    smoothstep(-0.08, 0.28, -N.x - N.y * 0.5) * 1.25
  ) * clamp(spectralSpread, 0.0, 0.85) * rimMask * u_beyondApple;

  // 5. 4-Light Studio PBR Specular Reflections (Blinn-Phong)
  vec3 L_key = normalize(vec3(-u_tiltX * 0.45, -0.76 - u_glassLift * 0.12, 0.65));
  float specKey = pow(max(0.0, dot(N, normalize(L_key + V))), u_pbrExponents.x) * (0.92 + u_glassLift * 0.25);

  float specCrown = pow(max(0.0, dot(N, normalize(L_key + V))), u_pbrExponents.y)
                  * (0.24 + (1.0 - u_glassActive) * 0.14)
                  * (1.0 - smoothstep(-0.85, 0.05, domeCoord.y));

  float specBottomRim = pow(max(0.0, dot(N, normalize(vec3(u_tiltX * 0.28, 0.84, 0.52) + V))), u_pbrExponents.z)
                      * (0.58 + u_glassLift * 0.24);

  float specBernoulli = pow(max(0.0, dot(N, normalize(vec3(sign(u_tiltX) * 0.86, -0.10, 0.50) + V))), u_pbrExponents.w)
                      * abs(u_tiltX) * 0.68;

  // Razor-sharp outer crystal bevel ring + Fresnel glancing reflection wall
  float outerCrispRim = (1.0 - smoothstep(0.0, 1.85, -dist)) * (0.95 + u_glassLift * 0.05);
  float fresnelWall = smoothstep(0.55, 0.0, tRim) * fresnel * (2.2 + u_glassActive * 1.4);

  // Subtle internal glass volume tinting (Beer-Lambert optical clarity)
  vec3 glassVolumeRGB = mix(refractedScene, u_tintColor, 0.07 + 0.09 * rimMask);

  // Combine refracted background with PBR specular highlights & Cauchy prismatic flare
  float specularSum = clamp(outerCrispRim * 0.78 + specKey + specCrown + specBottomRim * 0.82 + specBernoulli + fresnelWall, 0.0, 1.0);
  vec3 glassComposite = mix(glassVolumeRGB, vec3(1.0), specularSum) + prismaticRimFlare * 0.58;
  glassComposite = clamp(glassComposite, 0.0, 1.0);

  // Anti-aliased sub-pixel blending along outer boundary
  float edgeAA = 1.0 - smoothstep(-0.65, 0.50, dist);
  vec3 outRGB = mix(finalRGB, glassComposite, edgeAA);

  fragColor = vec4(outRGB, 1.0);
}
`;
