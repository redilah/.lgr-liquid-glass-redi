/**
 * LIQUID GLASS REDI COMPILER (lgrc v1.0.0)
 * Standalone Universal CLI & Programmatic Compiler for .lgr source files.
 *
 * Targets:
 *   - WebGL2 Fragment Shaders (.frag.glsl)
 *   - WebGPU Compute Shaders (.compute.wgsl)
 *   - Universal Intermediate Representation (.lgr.json)
 *   - Universal Native C-ABI Header (.h) for Vulkan/Metal
 *   - High-Speed WebAssembly Binary (.wasm) for Node/Browser V8
 *
 * Usage:
 *   node compiler/lgrc.js <file.lgr> [--target=all|glsl|wgsl|json|c-header|wasm] [--out-dir=<dir>] [--check]
 */

import fs from 'node:fs';
import path from 'node:path';
import { LGRLexer } from './lexer.js';
import { LGRParser } from './parser.js';
import { LGRAnalyzer } from './analyzer.js';
import { LGRCodeGenerator } from './codegen.js';
import { emitCABIHeader } from './cabiEmitter.js';
import { emitLGRWasmBinary } from './wasmEmitter.js';

export function compileLGRSource(sourceCode, options = {}) {
  const baseName = options.baseName || 'crystal_redi';
  const lexer = new LGRLexer(sourceCode);
  const tokens = lexer.tokenize();

  const parser = new LGRParser(tokens);
  const ast = parser.parseProgram();

  const analyzer = new LGRAnalyzer(ast);
  const analyzedIR = analyzer.analyze();

  const codegen = new LGRCodeGenerator(analyzedIR);
  const artifact = codegen.generate();

  const cabiHeader = emitCABIHeader(analyzedIR, baseName);
  const wasmBinary = emitLGRWasmBinary(analyzedIR);

  return {
    tokensCount: tokens.length,
    ast,
    ir: analyzedIR,
    artifact,
    cabiHeader,
    wasmBinary,
  };
}

// Execute CLI if invoked directly
const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

if (isMain || process.argv[1]?.endsWith('lgrc.js')) {
  const args = process.argv.slice(2);
  const inputArg = args.find((a) => !a.startsWith('--'));

  if (!inputArg || args.includes('--help') || args.includes('-h')) {
    console.log(`
LIQUID GLASS REDI COMPILER (lgrc v1.0.0 — Universal Toolchain)
Penggunaan:
  node compiler/lgrc.js <file.lgr> [opsi]

Opsi:
  --target=TARGET    Target output: all (default), glsl, wgsl, json, c-header, wasm
  --out-dir=DIR      Direktori tujuan output (default: ../build)
  --check            Validasi sintaks & tipe tanpa menulis file ke disk
  --version, -v      Tampilkan versi compiler
  --help, -h         Tampilkan bantuan ini
`);
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log('lgrc v1.0.0 (Crystal Genesis — 5 Pillars Unified)');
    process.exit(0);
  }

  const targetArg = (args.find((a) => a.startsWith('--target=')) || '--target=all').split('=')[1].toLowerCase();
  const outDirArg = (args.find((a) => a.startsWith('--out-dir=')) || '').split('=')[1];
  const isCheckOnly = args.includes('--check');

  const inputPath = path.resolve(process.cwd(), inputArg);
  if (!fs.existsSync(inputPath)) {
    console.error(`[lgrc] File tidak ditemukan: ${inputPath}`);
    process.exit(1);
  }

  const baseName = path.basename(inputPath, '.lgr');
  const rawSource = fs.readFileSync(inputPath, 'utf8');

  console.log('======================================================================');
  console.log('  LIQUID GLASS REDI COMPILER (lgrc v1.0.0 — Crystal Genesis)');
  console.log('======================================================================');
  console.log(`Mengompilasi sumber : ${inputPath}`);
  console.log(`Target kompilasi    : ${targetArg.toUpperCase()}`);

  const startTime = performance.now();
  const result = compileLGRSource(rawSource, { baseName });
  const elapsedMs = (performance.now() - startTime).toFixed(2);

  console.log(`Token terdeteksi    : ${result.tokensCount} token`);
  console.log(`Material tervalidasi: ${Object.keys(result.ir.materials).join(', ')}`);
  console.log(`Scene tervalidasi   : ${Object.keys(result.ir.scenes).join(', ')}`);
  console.log('----------------------------------------------------------------------');
  console.log('DIAGNOSTIK FISIKA & OPTIK COMPILE-TIME:');
  for (const diag of result.ir.diagnostics) {
    console.log(`  [${diag.level}] (${diag.target}) -> ${diag.message}`);
  }

  if (isCheckOnly) {
    console.log('----------------------------------------------------------------------');
    console.log(`[CHECK LULUS] File ${inputArg} valid secara sintaks dan hukum fisika optik.`);
    console.log('======================================================================');
    process.exit(0);
  }

  const outDir = outDirArg ? path.resolve(process.cwd(), outDirArg) : path.join(path.dirname(inputPath), '..', 'build');
  fs.mkdirSync(outDir, { recursive: true });

  // 1. JSON IR Target
  if (targetArg === 'all' || targetArg === 'json') {
    const irOutPath = path.join(outDir, `${baseName}.lgr.json`);
    fs.writeFileSync(irOutPath, JSON.stringify(result.artifact, null, 2), 'utf8');
    console.log(`Artefak IR dibuat   : ${irOutPath}`);
  }

  // 2. GLSL Fragment Shader Target
  if (targetArg === 'all' || targetArg === 'glsl') {
    for (const [matName, shaderPair] of Object.entries(result.artifact.shaders)) {
      const glslPath = path.join(outDir, `${baseName}_${matName}.frag.glsl`);
      fs.writeFileSync(glslPath, shaderPair.fragmentShader, 'utf8');
      console.log(`Shader GPU dibuat   : ${glslPath}`);
    }
  }

  // 3. WebGPU Compute Shader Target
  if (targetArg === 'all' || targetArg === 'wgsl') {
    for (const [matName, wgslCode] of Object.entries(result.artifact.computeShaders || {})) {
      const wgslPath = path.join(outDir, `${baseName}_${matName}.compute.wgsl`);
      fs.writeFileSync(wgslPath, wgslCode, 'utf8');
      console.log(`Compute WGSL dibuat : ${wgslPath}`);
    }
  }

  // 4. C-ABI Native Header Target (.h)
  if (targetArg === 'all' || targetArg === 'c-header') {
    const cabiPath = path.join(outDir, `${baseName}_abi.h`);
    fs.writeFileSync(cabiPath, result.cabiHeader, 'utf8');
    console.log(`C-ABI Header dibuat : ${cabiPath}`);
  }

  // 5. Standalone WebAssembly Binary Target (.wasm)
  if (targetArg === 'all' || targetArg === 'wasm') {
    const wasmPath = path.join(outDir, `${baseName}.wasm`);
    fs.writeFileSync(wasmPath, result.wasmBinary);
    console.log(`Wasm Binary dibuat  : ${wasmPath} (${result.wasmBinary.length} bytes)`);
  }

  console.log(`Waktu Kompilasi     : ${elapsedMs} ms`);
  console.log('======================================================================');
}
