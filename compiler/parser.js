/**
 * LIQUID GLASS REDI (LGR) — STANDALONE RECURSIVE DESCENT PARSER
 * Transforms the LGR token stream into a validated Abstract Syntax Tree (AST).
 */

import { TokenType } from './lexer.js';

export class LGRParserError extends Error {
  constructor(message, token) {
    const loc = token ? `Baris ${token.line}, Kolom ${token.column}` : 'EOF';
    super(`[LGR Syntax Error] ${loc}: ${message}`);
    this.name = 'LGRParserError';
    this.token = token;
  }
}

export class LGRParser {
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
