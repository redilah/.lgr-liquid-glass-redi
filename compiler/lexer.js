/**
 * LIQUID GLASS REDI (LGR) — STANDALONE LEXER (TOKENIZER)
 * Reads raw .lgr source code and converts it into a structured token stream
 * with first-class support for physical units (px, %, deg, rad, nm, ior, ms, s)
 * and optical hex colors.
 */

export const TokenType = Object.freeze({
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

export class LGRLexerError extends Error {
  constructor(message, line, column) {
    super(`[LGR Lexer Error] Baris ${line}, Kolom ${column}: ${message}`);
    this.name = 'LGRLexerError';
    this.line = line;
    this.column = column;
  }
}

export class LGRLexer {
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
