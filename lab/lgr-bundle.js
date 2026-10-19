// Inlined LGR modules for direct file:/// execution

/* --- compiler/lexer.js --- */
/**
 * LIQUID GLASS REDI (LGR) — STANDALONE LEXER (TOKENIZER)
 * Reads raw .lgr source code and converts it into a structured token stream
 * with first-class support for physical units (px, %, deg, rad, nm, ior, ms, s)
 * and optical hex colors.
 */

 TokenType = Object.freeze({
  KEYWORD: 'KEYWORD',
  IDENTIFIER: 'IDENTIFIER',
  NUMBER: 'NUMBER',
  UNIT_NUMBER: 'UNIT_NUMBER',
  STRING: 'STRING',
  HEX_COLOR: 'HEX_COLOR',
  BOOLEAN: 'BOOLEAN',
  LBRACE: 'LBRACE',       // {
  RBRACE: 'RBRACE',       // }
  LPAREN: 'LPAREN',       // (
  RPAREN: 'RPAREN',       // )
  COLON: 'COLON',         // :
  SEMICOLON: 'SEMICOLON', // ;
  COMMA: 'COMMA',         // ,
  EOF: 'EOF',
});

const KEYWORDS = new Set([
  'material',
  'scene',
  'optics',
  'fluid',
  'lighting',
  'caustics',
  'invariant',
  'vessel',
  'droplet',
  'interaction',
]);

const BOOLEAN_LITERALS = new Set(['true', 'false', 'enabled', 'disabled']);

const PHYSICAL_UNITS = new Set(['px', '%', 'deg', 'rad', 'nm', 'ior', 'ms', 's']);

 LGRLexerError extends Error {
  constructor(message, line, column) {
    super(`[LGR Lexer Error] Baris ${line}, Kolom ${column}: ${message}`);
    this.name = 'LGRLexerError';
    this.line = line;
    this.column = column;
  }
}

 LGRLexer {
  constructor(source) {
    this.source = source;
    this.pos = 0;
    this.line = 1;
    this.column = 1;
  }

  peek(offset = 0) {
    return this.source[this.pos + offset] || '\0';
  }

  advance() {
    const ch = this.source[this.pos++] || '\0';
    if (ch === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return ch;
  }

  isWhitespace(ch) {
    return ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n';
  }

  isDigit(ch) {
    return ch >= '0' && ch <= '9';
  }

  isAlpha(ch) {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
  }

  isAlphaNumeric(ch) {
    return this.isAlpha(ch) || this.isDigit(ch);
  }

  isHexChar(ch) {
    return (
      this.isDigit(ch) ||
      (ch >= 'a' && ch <= 'f') ||
      (ch >= 'A' && ch <= 'F')
    );
  }

  skipWhitespaceAndComments() {
    while (this.pos < this.source.length) {
      const ch = this.peek();

      if (this.isWhitespace(ch)) {
        this.advance();
        continue;
      }

      // Single-line comment: //
      if (ch === '/' && this.peek(1) === '/') {
        while (this.pos < this.source.length && this.peek() !== '\n') {
          this.advance();
        }
        continue;
      }

      // Multi-line comment: /* ... */
      if (ch === '/' && this.peek(1) === '*') {
        const startLine = this.line;
        const startCol = this.column;
        this.advance();
        this.advance();
        while (
          this.pos < this.source.length &&
          !(this.peek() === '*' && this.peek(1) === '/')
        ) {
          this.advance();
        }
        if (this.pos >= this.source.length) {
          throw new LGRLexerError('Komentar blok /* tidak ditutup', startLine, startCol);
        }
        this.advance(); // *
        this.advance(); // /
        continue;
      }

      break;
    }
  }

  readNumberOrUnitNumber() {
    const startLine = this.line;
    const startCol = this.column;
    let numStr = '';

    if (this.peek() === '-' || this.peek() === '+') {
      numStr += this.advance();
    }

    let hasDot = false;
    while (this.pos < this.source.length) {
      const ch = this.peek();
      if (this.isDigit(ch)) {
        numStr += this.advance();
      } else if (ch === '.' && !hasDot) {
        hasDot = true;
        numStr += this.advance();
      } else {
        break;
      }
    }

    const numericValue = parseFloat(numStr);
    if (Number.isNaN(numericValue)) {
      throw new LGRLexerError(`Angka tidak valid: "${numStr}"`, startLine, startCol);
    }

    // Check if immediately followed by a physical unit (% or letters like px, deg, nm, ior, s, ms)
    let unitStr = '';
    if (this.peek() === '%') {
      unitStr = this.advance();
    } else if (this.isAlpha(this.peek())) {
      while (this.pos < this.source.length && this.isAlpha(this.peek())) {
        unitStr += this.advance();
      }
    }

    if (unitStr.length > 0) {
      if (!PHYSICAL_UNITS.has(unitStr)) {
        throw new LGRLexerError(
          `Satuan fisika tidak dikenal: "${unitStr}" pada "${numStr}${unitStr}". Satuan valid: ${Array.from(PHYSICAL_UNITS).join(', ')}`,
          startLine,
          startCol
        );
      }
      return {
        type: TokenType.UNIT_NUMBER,
        value: numericValue,
        unit: unitStr,
        raw: `${numStr}${unitStr}`,
        line: startLine,
        column: startCol,
      };
    }

    return {
      type: TokenType.NUMBER,
      value: numericValue,
      unit: null,
      raw: numStr,
      line: startLine,
      column: startCol,
    };
  }

  readHexColor() {
    const startLine = this.line;
    const startCol = this.column;
    let hex = this.advance(); // '#'

    while (this.pos < this.source.length && this.isHexChar(this.peek())) {
      hex += this.advance();
    }

    const hexDigits = hex.slice(1);
    if (![3, 6, 8].includes(hexDigits.length)) {
      throw new LGRLexerError(
        `Format warna heksadesimal tidak valid: "${hex}" (gunakan #RGB, #RRGGBB, atau #RRGGBBAA)`,
        startLine,
        startCol
      );
    }

    return {
      type: TokenType.HEX_COLOR,
      value: hex.toUpperCase(),
      NormalizedRGB: this.hexToNormalizedRGBA(hexDigits),
      line: startLine,
      column: startCol,
    };
  }

  hexToNormalizedRGBA(hexDigits) {
    let fullHex = hexDigits;
    if (hexDigits.length === 3) {
      fullHex = hexDigits
        .split('')
        .map((c) => c + c)
        .join('') + 'FF';
    } else if (hexDigits.length === 6) {
      fullHex = hexDigits + 'FF';
    }
    const r = parseInt(fullHex.slice(0, 2), 16) / 255;
    const g = parseInt(fullHex.slice(2, 4), 16) / 255;
    const b = parseInt(fullHex.slice(4, 6), 16) / 255;
    const a = parseInt(fullHex.slice(6, 8), 16) / 255;
    return [
      Number(r.toFixed(4)),
      Number(g.toFixed(4)),
      Number(b.toFixed(4)),
      Number(a.toFixed(4)),
    ];
  }

  readString() {
    const startLine = this.line;
    const startCol = this.column;
    const quote = this.advance();
    let str = '';

    while (this.pos < this.source.length && this.peek() !== quote) {
      if (this.peek() === '\\') {
        this.advance();
      }
      str += this.advance();
    }

    if (this.peek() !== quote) {
      throw new LGRLexerError('String literal tidak ditutup', startLine, startCol);
    }
    this.advance();

    return {
      type: TokenType.STRING,
      value: str,
      line: startLine,
      column: startCol,
    };
  }

  readIdentifierOrKeyword() {
    const startLine = this.line;
    const startCol = this.column;
    let id = '';

    while (this.pos < this.source.length && (this.isAlphaNumeric(this.peek()) || this.peek() === '-')) {
      id += this.advance();
    }

    if (KEYWORDS.has(id)) {
      return {
        type: TokenType.KEYWORD,
        value: id,
        line: startLine,
        column: startCol,
      };
    }

    if (BOOLEAN_LITERALS.has(id)) {
      return {
        type: TokenType.BOOLEAN,
        value: id === 'true' || id === 'enabled',
        raw: id,
        line: startLine,
        column: startCol,
      };
    }

    return {
      type: TokenType.IDENTIFIER,
      value: id,
      line: startLine,
      column: startCol,
    };
  }

  tokenize() {
    const tokens = [];

    while (this.pos < this.source.length) {
      this.skipWhitespaceAndComments();
      if (this.pos >= this.source.length) break;

      const ch = this.peek();
      const line = this.line;
      const column = this.column;

      if (ch === '{') {
        this.advance();
        tokens.push({ type: TokenType.LBRACE, value: '{', line, column });
        continue;
      }
      if (ch === '}') {
        this.advance();
        tokens.push({ type: TokenType.RBRACE, value: '}', line, column });
        continue;
      }
      if (ch === '(') {
        this.advance();
        tokens.push({ type: TokenType.LPAREN, value: '(', line, column });
        continue;
      }
      if (ch === ')') {
        this.advance();
        tokens.push({ type: TokenType.RPAREN, value: ')', line, column });
        continue;
      }
      if (ch === ':') {
        this.advance();
        tokens.push({ type: TokenType.COLON, value: ':', line, column });
        continue;
      }
      if (ch === ';') {
        this.advance();
        tokens.push({ type: TokenType.SEMICOLON, value: ';', line, column });
        continue;
      }
      if (ch === ',') {
        this.advance();
        tokens.push({ type: TokenType.COMMA, value: ',', line, column });
        continue;
      }
      if (ch === '#') {
        tokens.push(this.readHexColor());
        continue;
      }
      if (ch === '"' || ch === "'") {
        tokens.push(this.readString());
        continue;
      }
      if (
        this.isDigit(ch) ||
        ((ch === '-' || ch === '+') && this.isDigit(this.peek(1)))
      ) {
        tokens.push(this.readNumberOrUnitNumber());
        continue;
      }
      if (this.isAlpha(ch)) {
        tokens.push(this.readIdentifierOrKeyword());
        continue;
      }

      throw new LGRLexerError(`Karakter tidak dikenal: "${ch}"`, line, column);
    }

    tokens.push({
      type: TokenType.EOF,
      value: null,
      line: this.line,
      column: this.column,
    });

    return tokens;
  }
}


/* --- compiler/parser.js --- */
/**
 * LIQUID GLASS REDI (LGR) — STANDALONE RECURSIVE DESCENT PARSER
 * Transforms the LGR token stream into a validated Abstract Syntax Tree (AST).
 */

LGRParserError extends Error {
  constructor(message, token) {
    const loc = token ? `Baris ${token.line}, Kolom ${token.column}` : 'EOF';
    super(`[LGR Syntax Error] ${loc}: ${message}`);
    this.name = 'LGRParserError';
    this.token = token;
  }
}

 LGRParser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  current() {
    return this.tokens[this.pos] || this.tokens[this.tokens.length - 1];
  }

  peek(offset = 1) {
    return (
      this.tokens[this.pos + offset] || this.tokens[this.tokens.length - 1]
    );
  }

  advance() {
    const tok = this.current();
    if (this.pos < this.tokens.length - 1) {
      this.pos++;
    }
    return tok;
  }

  expect(type, expectedValue = null) {
    const tok = this.current();
    if (tok.type !== type) {
      throw new LGRParserError(
        `Mengharapkan token ${type}${expectedValue ? ` ("${expectedValue}")` : ''}, tetapi menemukan ${tok.type} ("${tok.value}")`,
        tok
      );
    }
    if (expectedValue !== null && tok.value !== expectedValue) {
      throw new LGRParserError(
        `Mengharapkan "${expectedValue}", tetapi menemukan "${tok.value}"`,
        tok
      );
    }
    return this.advance();
  }

  parseProgram() {
    const body = [];

    while (this.current().type !== TokenType.EOF) {
      const tok = this.current();

      if (tok.type === TokenType.KEYWORD && tok.value === 'material') {
        body.push(this.parseMaterialDeclaration());
      } else if (tok.type === TokenType.KEYWORD && tok.value === 'scene') {
        body.push(this.parseSceneDeclaration());
      } else {
        throw new LGRParserError(
          `Deklarasi tingkat atas harus berupa "material" atau "scene", ditemukan "${tok.value}"`,
          tok
        );
      }
    }

    return {
      type: 'LGRProgram',
      version: '1.0.0',
      body,
    };
  }

  parseMaterialDeclaration() {
    const startTok = this.expect(TokenType.KEYWORD, 'material');
    const nameTok = this.expect(TokenType.IDENTIFIER);
    this.expect(TokenType.LBRACE);

    const properties = {};
    const sections = {};

    while (
      this.current().type !== TokenType.RBRACE &&
      this.current().type !== TokenType.EOF
    ) {
      const tok = this.current();

      if (tok.type === TokenType.KEYWORD) {
        const block = this.parseNestedBlock();
        sections[block.blockType] = block;
      } else if (tok.type === TokenType.IDENTIFIER) {
        const prop = this.parsePropertyAssignment();
        properties[prop.key] = prop;
      } else {
        throw new LGRParserError(
          `Token tidak terduga di dalam blok material "${nameTok.value}": "${tok.value}"`,
          tok
        );
      }
    }

    this.expect(TokenType.RBRACE);

    return {
      type: 'MaterialDeclaration',
      name: nameTok.value,
      properties,
      sections,
      loc: { line: startTok.line, column: startTok.column },
    };
  }

  parseSceneDeclaration() {
    const startTok = this.expect(TokenType.KEYWORD, 'scene');
    const nameTok = this.expect(TokenType.IDENTIFIER);
    this.expect(TokenType.LBRACE);

    const properties = {};
    const sections = {};
    const vessels = [];
    const droplets = [];

    while (
      this.current().type !== TokenType.RBRACE &&
      this.current().type !== TokenType.EOF
    ) {
      const tok = this.current();

      if (tok.type === TokenType.KEYWORD) {
        const block = this.parseNestedBlock();
        if (block.blockType === 'vessel') {
          vessels.push(block);
        } else if (block.blockType === 'droplet') {
          droplets.push(block);
        } else {
          sections[block.blockType] = block;
        }
      } else if (tok.type === TokenType.IDENTIFIER) {
        const prop = this.parsePropertyAssignment();
        properties[prop.key] = prop;
      } else {
        throw new LGRParserError(
          `Token tidak terduga di dalam blok scene "${nameTok.value}": "${tok.value}"`,
          tok
        );
      }
    }

    this.expect(TokenType.RBRACE);

    return {
      type: 'SceneDeclaration',
      name: nameTok.value,
      properties,
      sections,
      vessels,
      droplets,
      loc: { line: startTok.line, column: startTok.column },
    };
  }

  parseNestedBlock() {
    const blockTok = this.expect(TokenType.KEYWORD);
    let blockName = null;

    // Named sub-blocks like `vessel MainDock { ... }` or `droplet ActiveBubble { ... }`
    if (this.current().type === TokenType.IDENTIFIER) {
      blockName = this.advance().value;
    }

    this.expect(TokenType.LBRACE);

    const properties = {};
    const children = [];

    while (
      this.current().type !== TokenType.RBRACE &&
      this.current().type !== TokenType.EOF
    ) {
      if (this.current().type === TokenType.KEYWORD) {
        children.push(this.parseNestedBlock());
      } else if (this.current().type === TokenType.IDENTIFIER) {
        const prop = this.parsePropertyAssignment();
        properties[prop.key] = prop;
      } else {
        throw new LGRParserError(
          `Token tidak valid di dalam sub-blok "${blockTok.value}": "${this.current().value}"`,
          this.current()
        );
      }
    }

    this.expect(TokenType.RBRACE);

    return {
      type: 'SubBlock',
      blockType: blockTok.value,
      name: blockName,
      properties,
      children,
      loc: { line: blockTok.line, column: blockTok.column },
    };
  }

  parsePropertyAssignment() {
    const keyTok = this.expect(TokenType.IDENTIFIER);
    this.expect(TokenType.COLON);
    const expr = this.parseExpression();
    this.expect(TokenType.SEMICOLON);

    return {
      type: 'PropertyAssignment',
      key: keyTok.value,
      value: expr,
      loc: { line: keyTok.line, column: keyTok.column },
    };
  }

  parseExpression() {
    const tok = this.current();

    if (tok.type === TokenType.NUMBER) {
      this.advance();
      return {
        type: 'NumericLiteral',
        value: tok.value,
        unit: null,
        loc: { line: tok.line, column: tok.column },
      };
    }

    if (tok.type === TokenType.UNIT_NUMBER) {
      this.advance();
      return {
        type: 'PhysicalQuantity',
        value: tok.value,
        unit: tok.unit,
        raw: tok.raw,
        loc: { line: tok.line, column: tok.column },
      };
    }

    if (tok.type === TokenType.HEX_COLOR) {
      this.advance();
      return {
        type: 'ColorLiteral',
        hex: tok.value,
        rgba: tok.NormalizedRGB,
        loc: { line: tok.line, column: tok.column },
      };
    }

    if (tok.type === TokenType.BOOLEAN) {
      this.advance();
      return {
        type: 'BooleanLiteral',
        value: tok.value,
        raw: tok.raw,
        loc: { line: tok.line, column: tok.column },
      };
    }

    if (tok.type === TokenType.STRING) {
      this.advance();
      return {
        type: 'StringLiteral',
        value: tok.value,
        loc: { line: tok.line, column: tok.column },
      };
    }

    if (tok.type === TokenType.IDENTIFIER) {
      // Check if function/constructor call: e.g. vec2(380px, 62px) or spectrum(650nm, 550nm, 450nm)
      if (this.peek().type === TokenType.LPAREN) {
        return this.parseFunctionCall();
      }
      this.advance();
      return {
        type: 'SymbolReference',
        name: tok.value,
        loc: { line: tok.line, column: tok.column },
      };
    }

    throw new LGRParserError(
      `Ekspresi nilai tidak dikenali: "${tok.value}" (${tok.type})`,
      tok
    );
  }

  parseFunctionCall() {
    const fnTok = this.expect(TokenType.IDENTIFIER);
    this.expect(TokenType.LPAREN);

    const args = [];
    while (
      this.current().type !== TokenType.RPAREN &&
      this.current().type !== TokenType.EOF
    ) {
      args.push(this.parseExpression());
      if (this.current().type === TokenType.COMMA) {
        this.advance();
      } else {
        break;
      }
    }

    this.expect(TokenType.RPAREN);

    return {
      type: 'ConstructExpression',
      callee: fnTok.value,
      arguments: args,
      loc: { line: fnTok.line, column: fnTok.column },
    };
  }
}


/* --- compiler/analyzer.js --- */
/**
 * LIQUID GLASS REDI (LGR) — PHYSICS & OPTICAL SEMANTIC ANALYZER
 * Validates physical laws (Snell-Cauchy Dispersion, Schlick Fresnel,
 * Navier-Stokes Volume Conservation, Resting 1:1 Invariant) and pre-computes
 * exact GPU shader constants at compile-time.
 */

 LGRSemanticError extends Error {
  constructor(message, loc) {
    const pos = loc ? `Baris ${loc.line}, Kolom ${loc.column}` : 'Global';
    super(`[LGR Physics/Semantic Error] ${pos}: ${message}`);
    this.name = 'LGRSemanticError';
    this.loc = loc;
  }
}

 LGRAnalyzer {
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


/* --- physics/hydroEngine.js --- */
/**
 * LIQUID GLASS REDI (LGR) — TAHAP 2: STANDALONE HYDRO-OPTICAL PHYSICS ENGINE
 * Implements:
 *   1. Sub-Stepped 4th-Order Runge-Kutta (RK4) Harmonic Spring Integrator
 *   2. Navier-Stokes Incompressible Volume Conservation (Weber Number We)
 *   3. Marangoni Capillary Surface Tension & Multi-Droplet Coalescence
 *   4. Exponential Momentum Projection & 1:1 Resting Baseline Invariant
 */

 RK4Spring1D {
  constructor(initialValue = 0, stiffnessK = 304.6, dampingC = 30.7) {
    this.value = initialValue;
    this.target = initialValue;
    this.velocity = 0;
    this.acceleration = 0;
    this.k = stiffnessK;
    this.c = dampingC;
  }

  configure(stiffnessK, dampingC) {
    this.k = stiffnessK;
    this.c = dampingC;
  }

  setTarget(newTarget) {
    this.target = newTarget;
  }

  impulse(deltaVelocity) {
    this.velocity += deltaVelocity;
  }

  snap(exactValue) {
    this.value = exactValue;
    this.target = exactValue;
    this.velocity = 0;
    this.acceleration = 0;
  }

  // Derivative function f(x, v) = -k*(x - target) - c*v
  computeAcceleration(x, v) {
    return -this.k * (x - this.target) - this.c * v;
  }

  stepRK4(dt) {
    const x0 = this.value;
    const v0 = this.velocity;

    const a1 = this.computeAcceleration(x0, v0);
    const v1 = v0;

    const x2 = x0 + 0.5 * dt * v1;
    const v2 = v0 + 0.5 * dt * a1;
    const a2 = this.computeAcceleration(x2, v2);

    const x3 = x0 + 0.5 * dt * v2;
    const v3 = v0 + 0.5 * dt * a2;
    const a3 = this.computeAcceleration(x3, v3);

    const x4 = x0 + dt * v3;
    const v4 = v0 + dt * a3;
    const a4 = this.computeAcceleration(x4, v4);

    this.value = x0 + (dt / 6.0) * (v1 + 2.0 * v2 + 2.0 * v3 + v4);
    this.velocity = v0 + (dt / 6.0) * (a1 + 2.0 * a2 + 2.0 * a3 + a4);
    this.acceleration = a4;

    // Settle threshold for Resting State 1:1 Invariant
    if (
      Math.abs(this.value - this.target) < 0.0005 &&
      Math.abs(this.velocity) < 0.005
    ) {
      this.value = this.target;
      this.velocity = 0;
      this.acceleration = 0;
    }

    return this.value;
  }
}

 LGRHydroPhysicsEngine {
  constructor(materialConfig, sceneConfig) {
    this.material = materialConfig;
    this.scene = sceneConfig;

    const { stiffnessK, dampingC } = materialConfig.fluid.derivedRK4;
    const primaryDroplet = sceneConfig.droplets[0] || {
      size: [72, 48],
      initialPos: [64, 31],
    };
    const secondaryDroplet = sceneConfig.droplets[1] || {
      size: [48, 44],
      initialPos: [190, 31],
    };

    this.primarySize = [...primaryDroplet.size];
    this.secondarySize = [...secondaryDroplet.size];

    // Primary Droplet RK4 State
    this.springX = new RK4Spring1D(primaryDroplet.initialPos[0], stiffnessK, dampingC);
    this.springY = new RK4Spring1D(primaryDroplet.initialPos[1], stiffnessK, dampingC);
    this.springScaleX = new RK4Spring1D(1.0, 420.0, 26.0);
    this.springScaleY = new RK4Spring1D(1.0, 420.0, 26.0);
    this.springLift = new RK4Spring1D(0.0, 340.0, 28.0);
    this.springGlass = new RK4Spring1D(0.0, 290.0, 28.0);
    this.springTilt = new RK4Spring1D(0.0, 360.0, 24.0);

    // Secondary Droplet State (for Marangoni Coalescence / Metaball fusion)
    this.secSpringX = new RK4Spring1D(secondaryDroplet.initialPos[0], stiffnessK * 0.9, dampingC);
    this.secSpringY = new RK4Spring1D(secondaryDroplet.initialPos[1], stiffnessK * 0.9, dampingC);
    this.secondaryEnabled = sceneConfig.droplets.length > 1;
  }

  /**
   * Apple WWDC Exponential Momentum Projection:
   * Projects where a flick gesture will naturally land based on release velocity (px/s).
   */
  static projectMomentum(initialVelocityPxPerSec, decelerationRate = 0.998) {
    return (
      ((initialVelocityPxPerSec / 1000.0) * decelerationRate) /
      (1.0 - decelerationRate)
    );
  }

  /**
   * Progressive Rubber-Band Resistance at Vessel Boundaries
   */
  static rubberBand(overshoot, dimension, constant = 0.55) {
    return (
      (overshoot * dimension * constant) /
      (dimension + constant * Math.abs(overshoot))
    );
  }

  triggerFluidBounce(intensity = 1.0) {
    this.springScaleX.impulse(0.42 * intensity);
    this.springScaleY.impulse(-0.34 * intensity);
    this.springLift.setTarget(Math.min(1.0, this.springLift.target + 0.65 * intensity));
    this.springGlass.setTarget(1.0);
  }

  moveTo(targetX, targetY = null, releaseVelocityX = 0) {
    this.springX.setTarget(targetX);
    if (targetY !== null) this.springY.setTarget(targetY);
    if (Math.abs(releaseVelocityX) > 1.0) {
      this.springX.impulse(releaseVelocityX * 0.15);
    }
  }

  setInteractiveLift(active) {
    this.springLift.setTarget(active ? 1.0 : 0.0);
    this.springGlass.setTarget(active ? 1.0 : 0.0);
  }

  /**
   * Advances the hydro-elastic physics simulation by deltaSeconds using 4 sub-steps of RK4.
   */
  step(deltaSeconds = 1 / 60) {
    const clampedDt = Math.min(deltaSeconds, 0.05);
    const subSteps = 4;
    const subDt = clampedDt / subSteps;

    const fluid = this.material.fluid;

    for (let i = 0; i < subSteps; i++) {
      this.springX.stepRK4(subDt);
      this.springY.stepRK4(subDt);
      this.springScaleX.stepRK4(subDt);
      this.springScaleY.stepRK4(subDt);
      this.springLift.stepRK4(subDt);
      this.springGlass.stepRK4(subDt);
      this.secSpringX.stepRK4(subDt);
      this.secSpringY.stepRK4(subDt);

      // Dynamic Shear Tilt driven by velocity vx and acceleration ax
      const vx = this.springX.velocity;
      const ax = this.springX.acceleration;
      const targetTilt = Math.tanh((0.75 * vx + 0.018 * ax) / 680.0);
      this.springTilt.setTarget(targetTilt);
      this.springTilt.stepRK4(subDt);

      // Auto-decay lift when motion settles
      if (Math.abs(vx) < 8.0 && this.springLift.target > 0 && !this._pointerHeld) {
        this.springLift.setTarget(0.0);
        this.springGlass.setTarget(0.0);
      }
    }

    // 1. Dimensionless Weber Number (We) & Volume-Conserving Stretch/Compress
    const vx = this.springX.velocity;
    const weber = Math.tanh(Math.abs(vx) / fluid.characteristicVelocity);
    const stretchX = Math.sqrt(1.0 + fluid.weberStretchX * weber);
    const compressY = fluid.incompressibility
      ? 1.0 / Math.sqrt(1.0 + fluid.weberCompressY * weber)
      : 1.0;

    // 2. Marangoni Capillary Pull between Primary & Secondary Droplets
    let marangoniPullX = 0.0;
    let coalescenceFactor = 0.0;
    if (this.secondaryEnabled) {
      const dx = this.secSpringX.value - this.springX.value;
      const dy = this.secSpringY.value - this.springY.value;
      const centerDist = Math.hypot(dx, dy);
      const sumRadii = this.primarySize[0] * 0.5 + this.secondarySize[0] * 0.5;
      const surfaceGap = centerDist - sumRadii;
      const kRadius = fluid.marangoniRadius;

      if (surfaceGap < kRadius * 1.6) {
        coalescenceFactor = Math.max(
          0.0,
          Math.min(1.0, 1.0 - surfaceGap / (kRadius * 1.6))
        );
        // Capillary necking stretches droplets slightly toward each other
        marangoniPullX = Math.sign(dx) * coalescenceFactor * 2.8;
      }
    }

    const buoyancySwell = 1.0 + this.springLift.value * 0.075;
    const finalScaleX =
      this.springScaleX.value * stretchX * buoyancySwell +
      Math.abs(marangoniPullX) * 0.018;
    const finalScaleY = this.springScaleY.value * compressY * buoyancySwell;

    // 3. Bounce Activity & Strict Resting 1:1 Baseline Invariant
    const scaleDeviation =
      Math.abs(this.springScaleX.value - 1.0) +
      Math.abs(this.springScaleY.value - 1.0);
    const rawActivity =
      scaleDeviation * 2.2 +
      this.springLift.value * 1.0 +
      this.springGlass.value * 0.65 +
      weber * 1.15;
    const bounceActivity =
      rawActivity < 0.002 ? 0.0 : Math.min(1.5, rawActivity);

    // At rest (bounceActivity === 0): snellMagnification is strictly 1.0000 and liftOffsetY is 0.0px!
    const maxZoomDelta = (this.scene.invariant?.maxDynamicZoom || 1.18) - 1.0;
    const snellMagnification =
      bounceActivity === 0.0
        ? 1.0
        : 1.0 + Math.min(maxZoomDelta, bounceActivity * 0.18);
    const liftOffsetY =
      bounceActivity === 0.0 ? 0.0 : -this.springLift.value * 2.15;
    const shearDeg = Math.max(
      -2.6,
      Math.min(2.6, this.springTilt.value * 1.85)
    );

    return {
      pixelX: Number((this.springX.value + marangoniPullX).toFixed(3)),
      pixelY: Number(this.springY.value.toFixed(3)),
      velocityX: Number(vx.toFixed(3)),
      weber: Number(weber.toFixed(5)),
      scaleX: Number(finalScaleX.toFixed(5)),
      scaleY: Number(finalScaleY.toFixed(5)),
      volumeProduct: Number((stretchX * compressY).toFixed(4)),
      glassActive: Number(this.springGlass.value.toFixed(4)),
      glassLift: Number(this.springLift.value.toFixed(4)),
      tiltX: Number(this.springTilt.value.toFixed(5)),
      shearRad: Number(((shearDeg * Math.PI) / 180.0).toFixed(5)),
      shearDeg: Number(shearDeg.toFixed(3)),
      bounceActivity: Number(bounceActivity.toFixed(4)),
      snellMagnification: Number(snellMagnification.toFixed(4)),
      liftOffsetY: Number(liftOffsetY.toFixed(3)),
      coalescenceFactor: Number(coalescenceFactor.toFixed(4)),
      secondaryPos: [
        Number(this.secSpringX.value.toFixed(3)),
        Number(this.secSpringY.value.toFixed(3)),
      ],
      isResting1to1: bounceActivity === 0.0 && snellMagnification === 1.0,
    };
  }
}


/* --- shaders/opticalKernel.js --- */
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

 LGR_VERTEX_SHADER = `#version 300 es
precision highp float;
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

 LGR_FRAGMENT_SHADER = `#version 300 es
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

