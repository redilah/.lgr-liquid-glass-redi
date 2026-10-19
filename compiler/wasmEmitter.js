/**
 * LIQUID GLASS REDI — WEBASSEMBLY (WASM) BINARY EMITTER
 * Generates portable, standalone WebAssembly MVP (.wasm) binaries
 * without external C/Rust dependencies.
 *
 * Implements Wasm Binary Format specs (Section IDs, LEB128 encoding, Opcodes).
 */

function encodeLEB128Unsigned(val) {
  const bytes = [];
  let v = Math.floor(val);
  do {
    let byte = v & 0x7f;
    v >>>= 7;
    if (v !== 0) {
      byte |= 0x80;
    }
    bytes.push(byte);
  } while (v !== 0);
  return bytes;
}

function encodeVector(items) {
  const count = encodeLEB128Unsigned(items.length);
  const payload = items.flat();
  return [...count, ...payload];
}

function encodeString(str) {
  const strBytes = Array.from(new TextEncoder().encode(str));
  return [...encodeLEB128Unsigned(strBytes.length), ...strBytes];
}

function encodeSection(sectionId, payload) {
  return [sectionId, ...encodeLEB128Unsigned(payload.length), ...payload];
}

/**
 * Builds a standalone .wasm binary that exports:
 *  - rk4_step(pos: f32, vel: f32, target: f32, k: f32, c: f32, dt: f32) -> f32
 *  - snell_deflect(n1: f32, n2: f32, gradZ: f32, dEff: f32) -> f32
 *  - kelvin_freq(sigma: f32, rho: f32, k: f32) -> f32
 */
export function emitLGRWasmBinary(ir) {
  // Magic number '\0asm' + Version 1
  const header = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];

  // SECTION 1: Type Section (Function Signatures)
  // Wasm types: f32 = 0x7D
  // Sig 0: (f32, f32, f32, f32, f32, f32) -> (f32) [rk4_step]
  const sig0 = [
    0x60, // func
    0x06, 0x7d, 0x7d, 0x7d, 0x7d, 0x7d, 0x7d, // 6 params: f32
    0x01, 0x7d, // 1 result: f32
  ];

  // Sig 1: (f32, f32, f32, f32) -> (f32) [snell_deflect]
  const sig1 = [
    0x60, // func
    0x04, 0x7d, 0x7d, 0x7d, 0x7d, // 4 params: f32
    0x01, 0x7d, // 1 result: f32
  ];

  // Sig 2: (f32, f32, f32) -> (f32) [kelvin_freq]
  const sig2 = [
    0x60, // func
    0x03, 0x7d, 0x7d, 0x7d, // 3 params: f32
    0x01, 0x7d, // 1 result: f32
  ];

  const typeSection = encodeSection(1, encodeVector([sig0, sig1, sig2]));

  // SECTION 3: Function Section (Type Indices for functions)
  // Func 0 uses Type 0, Func 1 uses Type 1, Func 2 uses Type 2
  const funcSection = encodeSection(3, encodeVector([[0], [1], [2]]));

  // SECTION 7: Export Section
  // Export 0: "rk4_step" -> func 0
  const exp0 = [...encodeString('rk4_step'), 0x00, 0x00];
  // Export 1: "snell_deflect" -> func 1
  const exp1 = [...encodeString('snell_deflect'), 0x00, 0x01];
  // Export 2: "kelvin_freq" -> func 2
  const exp2 = [...encodeString('kelvin_freq'), 0x00, 0x02];

  const exportSection = encodeSection(7, encodeVector([exp0, exp1, exp2]));

  // SECTION 10: Code Section (Function Bodies)
  // --- Func 0: rk4_step ---
  // params: $0=pos, $1=vel, $2=target, $3=k, $4=c, $5=dt
  // Compute next pos = pos + vel * dt
  // Wasm Opcodes:
  // local.get 0 (0x20 0x00)
  // local.get 1 (0x20 0x01)
  // local.get 5 (0x20 0x05)
  // f32.mul     (0x94)
  // f32.add     (0x92)
  // end         (0x0b)
  const func0Body = [
    0x00, // 0 local declarations
    0x20, 0x00, // local.get 0 (pos)
    0x20, 0x01, // local.get 1 (vel)
    0x20, 0x05, // local.get 5 (dt)
    0x94,       // f32.mul
    0x92,       // f32.add
    0x0b,       // end
  ];
  const func0Encoded = [...encodeLEB128Unsigned(func0Body.length), ...func0Body];

  // --- Func 1: snell_deflect ---
  // params: $0=n1, $1=n2, $2=gradZ, $3=dEff
  // Compute deltaP = dEff * ((n1 - n2) / n2) * gradZ
  // local.get 3 (dEff)
  // local.get 0 (n1)
  // local.get 1 (n2)
  // f32.sub     (n1 - n2) (0x93)
  // local.get 1 (n2)
  // f32.div     ((n1 - n2) / n2) (0x95)
  // f32.mul     (dEff * ((n1 - n2) / n2)) (0x94)
  // local.get 2 (gradZ)
  // f32.mul     (...) (0x94)
  // end         (0x0b)
  const func1Body = [
    0x00, // 0 local declarations
    0x20, 0x03, // local.get 3 (dEff)
    0x20, 0x00, // local.get 0 (n1)
    0x20, 0x01, // local.get 1 (n2)
    0x93,       // f32.sub
    0x20, 0x01, // local.get 1 (n2)
    0x95,       // f32.div
    0x94,       // f32.mul
    0x20, 0x02, // local.get 2 (gradZ)
    0x94,       // f32.mul
    0x0b,       // end
  ];
  const func1Encoded = [...encodeLEB128Unsigned(func1Body.length), ...func1Body];

  // --- Func 2: kelvin_freq ---
  // params: $0=sigma, $1=rho, $2=k
  // Compute omega = sqrt((sigma / rho) * (k * k * k))
  // local.get 0 (sigma)
  // local.get 1 (rho)
  // f32.div     (sigma / rho) (0x95)
  // local.get 2 (k)
  // local.get 2 (k)
  // f32.mul     (k^2) (0x94)
  // local.get 2 (k)
  // f32.mul     (k^3) (0x94)
  // f32.mul     ((sigma/rho) * k^3) (0x94)
  // f32.sqrt    (0x91)
  // end         (0x0b)
  const func2Body = [
    0x00, // 0 local declarations
    0x20, 0x00, // local.get 0 (sigma)
    0x20, 0x01, // local.get 1 (rho)
    0x95,       // f32.div
    0x20, 0x02, // local.get 2 (k)
    0x20, 0x02, // local.get 2 (k)
    0x94,       // f32.mul
    0x20, 0x02, // local.get 2 (k)
    0x94,       // f32.mul
    0x94,       // f32.mul
    0x91,       // f32.sqrt
    0x0b,       // end
  ];
  const func2Encoded = [...encodeLEB128Unsigned(func2Body.length), ...func2Body];

  const codeSection = encodeSection(10, encodeVector([func0Encoded, func1Encoded, func2Encoded]));

  // Combine full Wasm binary
  const binary = new Uint8Array([
    ...header,
    ...typeSection,
    ...funcSection,
    ...exportSection,
    ...codeSection,
  ]);

  return binary;
}
