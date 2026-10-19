// ============================================================================
// LGR AUTO-SYNTHESIZED WEBGPU COMPUTE SHADER (.wgsl)
// Material: DiamondPrismRedi
// Solves 2D Capillary Wave PDE with Laplacian Damping & Discrete Verlet Integration
// d^2z/dt^2 = c^2 * nabla^2(z) - gamma * dz/dt + F_ext
// ============================================================================

struct SimulationParams {
  gridSize: vec2<u32>,        // e.g. 128, 64
  waveSpeed: f32,             // c (e.g. 420.00)
  damping: f32,               // gamma (e.g. 0.0380)
  dt: f32,                    // delta time (e.g. 0.016)
  dx: f32,                    // grid cell spacing (e.g. 1.0)
  impulsePos: vec2<f32>,      // touch/droplet impulse position (grid coords)
  impulseRadius: f32,         // impulse splash radius
  impulseForce: f32,          // impulse magnitude
  time: f32,
  restingDecay: f32,          // 1:1 resting baseline settle threshold
};

@group(0) @binding(0) var<uniform> params: SimulationParams;
@group(0) @binding(1) var<storage, read> heightPrev: array<f32>;
@group(0) @binding(2) var<storage, read> heightCurr: array<f32>;
@group(0) @binding(3) var<storage, read_write> heightNext: array<f32>;
@group(0) @binding(4) var<storage, read_write> gradientOut: array<vec2<f32>>;

fn getIndex(x: u32, y: u32) -> u32 {
  return y * params.gridSize.x + x;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let y = id.y;
  let w = params.gridSize.x;
  let h = params.gridSize.y;

  if (x >= w || y >= h) {
    return;
  }

  let idx = getIndex(x, y);

  // 1. Boundary Neuman / Dirichlet reflection conditions
  if (x == 0u || x == w - 1u || y == 0u || y == h - 1u) {
    heightNext[idx] = 0.0;
    gradientOut[idx] = vec2<f32>(0.0, 0.0);
    return;
  }

  // 2. 5-Point Discrete 2D Laplacian operator nabla^2(z)
  let zC = heightCurr[idx];
  let zP = heightPrev[idx];
  let zL = heightCurr[getIndex(x - 1u, y)];
  let zR = heightCurr[getIndex(x + 1u, y)];
  let zT = heightCurr[getIndex(x, y - 1u)];
  let zB = heightCurr[getIndex(x, y + 1u)];

  let laplacian = (zL + zR + zT + zB - 4.0 * zC) / (params.dx * params.dx);

  // 3. Dynamic External Collision / Wave Impulse Force
  let cellPos = vec2<f32>(f32(x), f32(y));
  let distToImpulse = length(cellPos - params.impulsePos);
  var fExt: f32 = 0.0;
  if (distToImpulse < params.impulseRadius) {
    let t = distToImpulse / max(0.001, params.impulseRadius);
    fExt = params.impulseForce * (1.0 - t * t);
  }

  // 4. Verlet Time-Stepping Integration with Capillary Viscous Damping
  let c2 = params.waveSpeed * params.waveSpeed;
  let dt2 = params.dt * params.dt;
  let dampingFactor = 1.0 - params.damping * params.dt;
  
  var zNext = (2.0 * zC - zP * dampingFactor) + (c2 * laplacian + fExt) * dt2;

  // Strict 1:1 Resting Invariant Settle: zero micro-jitter when settled
  if (abs(zNext) < params.restingDecay) {
    zNext = 0.0;
  }

  heightNext[idx] = zNext;

  // 5. Compute surface gradient nabla(z) for Snellius Optical Distortion in Pilar 2
  let gradX = (zR - zL) / (2.0 * params.dx);
  let gradY = (zB - zT) / (2.0 * params.dx);
  gradientOut[idx] = vec2<f32>(gradX, gradY);
}
