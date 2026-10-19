/**
 * LIQUID GLASS REDI COMPILER (lgrc v1.0.0)
 * Standalone CLI & Programmatic Compiler for .lgr source files.
 *
 * Usage:
 *   node compiler/lgrc.js <path-to-file.lgr>
 */

import fs from 'node:fs';
import path from 'node:path';
import { LGRLexer } from './lexer.js';
import { LGRParser } from './parser.js';
import { LGRAnalyzer } from './analyzer.js';
import { LGRCodeGenerator } from './codegen.js';

export function compileLGRSource(sourceCode) {
  const lexer = new LGRLexer(sourceCode);
  const tokens = lexer.tokenize();

  const parser = new LGRParser(tokens);
  const ast = parser.parseProgram();

  const analyzer = new LGRAnalyzer(ast);
  const analyzedIR = analyzer.analyze();

  const codegen = new LGRCodeGenerator(analyzedIR);
  const artifact = codegen.generate();

  return {
    tokensCount: tokens.length,
    ast,
    ir: analyzedIR,
    artifact,
  };
}

// Execute CLI if invoked directly
const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

if (isMain || process.argv[1]?.endsWith('lgrc.js')) {
  const inputArg = process.argv[2];
  if (!inputArg) {
    console.log('Usage: node compiler/lgrc.js <file.lgr>');
    process.exit(0);
  }

  const inputPath = path.resolve(process.cwd(), inputArg);
  if (!fs.existsSync(inputPath)) {
    console.error(`[lgrc] File tidak ditemukan: ${inputPath}`);
    process.exit(1);
  }

  const rawSource = fs.readFileSync(inputPath, 'utf8');
  console.log('======================================================================');
  console.log('  LIQUID GLASS REDI COMPILER (lgrc v1.0.0 — Crystal Genesis)');
  console.log('======================================================================');
  console.log(`Mengompilasi sumber : ${inputPath}`);

  const startTime = performance.now();
  const result = compileLGRSource(rawSource);
  const elapsedMs = (performance.now() - startTime).toFixed(2);

  const outDir = path.join(path.dirname(inputPath), '..', 'build');
  fs.mkdirSync(outDir, { recursive: true });

  const baseName = path.basename(inputPath, '.lgr');
  const irOutPath = path.join(outDir, `${baseName}.lgr.json`);
  fs.writeFileSync(irOutPath, JSON.stringify(result.artifact, null, 2), 'utf8');

  console.log(`Token terdeteksi    : ${result.tokensCount} token`);
  console.log(`Material tervalidasi: ${Object.keys(result.ir.materials).join(', ')}`);
  console.log(`Scene tervalidasi   : ${Object.keys(result.ir.scenes).join(', ')}`);
  console.log('----------------------------------------------------------------------');
  console.log('DIAGNOSTIK FISIKA & OPTIK COMPILE-TIME:');
  for (const diag of result.ir.diagnostics) {
    console.log(`  [${diag.level}] (${diag.target}) -> ${diag.message}`);
  }

  for (const [matName, shaderPair] of Object.entries(result.artifact.shaders)) {
    const glslPath = path.join(outDir, `${baseName}_${matName}.frag.glsl`);
    fs.writeFileSync(glslPath, shaderPair.fragmentShader, 'utf8');
    console.log(`Shader GPU dibuat   : ${glslPath}`);
  }

  for (const [matName, wgslCode] of Object.entries(result.artifact.computeShaders || {})) {
    const wgslPath = path.join(outDir, `${baseName}_${matName}.compute.wgsl`);
    fs.writeFileSync(wgslPath, wgslCode, 'utf8');
    console.log(`Compute WGSL dibuat : ${wgslPath}`);
  }

  console.log(`Artefak IR dibuat   : ${irOutPath}`);
  console.log(`Waktu Kompilasi     : ${elapsedMs} ms`);
  console.log('======================================================================');
}
