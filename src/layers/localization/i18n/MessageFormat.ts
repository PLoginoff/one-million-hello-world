/**
 * Localization — ICU-Like Message Format
 *
 * A parser + evaluator for an ICU MessageFormat subset:
 *
 *   "Hello {name}!"                       placeholder
 *   "{n, plural, one{# item} other{# items}}"  plural select
 *   "{gender, select, male{he} other{they}}"   plain select
 *   "{ts, date, short}" / "{v, number, 0.00}"  formatted values (stubs)
 *   "#" inside a plural arm = the number being pluralized
 *   "'{literal}'"                         quoting — single quotes escape
 *
 * Design: a real recursive-descent parser producing an AST, then a pure
 * evaluator over the AST — the same shape ICU4J's MessageFormat uses. The
 * parse is O(message length); evaluation is O(AST nodes × args lookups).
 * Parsing once and evaluating many is the perf-relevant split, so
 * `compile()` returns a compiled template and catalogs cache it.
 *
 * NOT implemented (documented boundary): selectordinal, nested selects in
 * arbitrary depth beyond what the parser reaches, skeleton date formats,
 * offset: in plural (`{n, plural, offset:1 ...}`) — offset IS parsed and
 * applied, actually.
 *
 * @module Localization/I18n
 */

import { PluralCategory, pluralRuleFor } from './PluralRules';

export type MessageValue = string | number | boolean | Date;
export type MessageArgs = Readonly<Record<string, MessageValue>>;

// ------------------------------------------------------------------- AST

export type MessageNode =
  | { kind: 'text'; text: string }
  | { kind: 'arg'; name: string; style?: string }
  | { kind: 'format'; name: string; type: 'number' | 'date' | 'time'; style?: string }
  | { kind: 'plural'; name: string; offset: number; arms: Array<{ category: PluralCategory | '='; exact?: number; nodes: MessageNode[] }> }
  | { kind: 'select'; name: string; arms: Array<{ key: string; nodes: MessageNode[] }> };

export class MessageParseError extends Error {
  constructor(message: string, readonly position: number) {
    super(`${message} (at offset ${position})`);
    this.name = 'MessageParseError';
  }
}

// ----------------------------------------------------------------- parser

/**
 * Recursive-descent parser for the subset grammar:
 *
 *   message   := (text | '{' arg '}' | '{' plural '}' | '{' select '}')*
 *   arg       := name [',' ('number'|'date'|'time') [',' style]]
 *   plural    := name ',' 'plural' ',' [offset:N] arms
 *   select    := name ',' 'select' ',' arms
 *   arms      := (category '{' message '}')+
 *   category  := 'zero'|'one'|'two'|'few'|'many'|'other'|'='<number>
 *
 * Apostrophe quoting per ICU: '' = literal apostrophe; 'x' quotes until
 * the next apostrophe or end (unterminated quote = literal rest — ICU's
 * "lenient" mode, we follow it).
 */
class Parser {
  private pos = 0;
  constructor(private readonly src: string) {}

  parse(): MessageNode[] {
    const nodes = this.parseMessage(false);
    if (this.pos < this.src.length) {
      throw new MessageParseError(`unexpected '${this.src[this.pos]}'`, this.pos);
    }
    return nodes;
  }

  /** Parse text/elements until `}` (inside arm) or EOF. */
  private parseMessage(inArm: boolean): MessageNode[] {
    const nodes: MessageNode[] = [];
    let text = '';
    const flush = () => {
      if (text !== '') {
        nodes.push({ kind: 'text', text });
        text = '';
      }
    };
    while (this.pos < this.src.length) {
      const c = this.src[this.pos];
      if (c === '}' && inArm) break;
      if (c === '{') {
        flush();
        nodes.push(this.parseElement());
        continue;
      }
      if (c === "'") {
        // Quoting: '' = literal ', or quote until next '.
        if (this.src[this.pos + 1] === "'") {
          text += "'";
          this.pos += 2;
          continue;
        }
        const end = this.src.indexOf("'", this.pos + 1);
        if (end === -1) {
          text += this.src.slice(this.pos + 1); // unterminated → literal rest
          this.pos = this.src.length;
          continue;
        }
        text += this.src.slice(this.pos + 1, end);
        this.pos = end + 1;
        continue;
      }
      if (c === '#' && inArm) {
        flush();
        nodes.push({ kind: 'arg', name: '#' });
        this.pos++;
        continue;
      }
      text += c;
      this.pos++;
    }
    flush();
    return nodes;
  }

  /** `{name`, `{name,number,style}`, `{name,plural,...}`, `{name,select,...}`. */
  private parseElement(): MessageNode {
    this.expect('{');
    this.skipWs();
    const name = this.parseIdentifier();
    this.skipWs();
    if (this.peek() === '}') {
      this.pos++;
      return { kind: 'arg', name };
    }
    this.expect(',');
    this.skipWs();
    const type = this.parseIdentifier();
    this.skipWs();
    if (type === 'plural' || type === 'selectordinal') {
      this.expect(',');
      const p = this.parsePluralTail(name);
      this.expect('}');
      return p;
    }
    if (type === 'select') {
      this.expect(',');
      const s = this.parseSelectTail(name);
      this.expect('}');
      return s;
    }
    if (type === 'number' || type === 'date' || type === 'time') {
      let style: string | undefined;
      if (this.peek() === ',') {
        this.pos++;
        this.skipWs();
        style = this.readUntil('}').trim() || undefined;
      }
      this.expect('}');
      return { kind: 'format', name, type, ...(style !== undefined ? { style } : {}) };
    }
    throw new MessageParseError(`unknown arg type '${type}'`, this.pos);
  }

  private parsePluralTail(name: string): MessageNode {
    let offset = 0;
    this.skipWs();
    if (this.src.startsWith('offset:', this.pos)) {
      this.pos += 'offset:'.length;
      this.skipWs();
      const num = this.parseNumber();
      offset = num;
      this.skipWs();
    }
    const arms: Array<{ category: PluralCategory | '='; exact?: number; nodes: MessageNode[] }> = [];
    while (this.pos < this.src.length && this.peek() !== '}') {
      this.skipWs();
      if (this.peek() === '}') break;
      if (this.peek() === '=') {
        this.pos++;
        const exact = this.parseNumber();
        const nodes = this.parseArmBody();
        arms.push({ category: '=', exact, nodes });
      } else {
        const cat = this.parseIdentifier() as PluralCategory;
        if (!['zero', 'one', 'two', 'few', 'many', 'other'].includes(cat)) {
          throw new MessageParseError(`invalid plural category '${cat}'`, this.pos);
        }
        const nodes = this.parseArmBody();
        arms.push({ category: cat, nodes });
      }
      this.skipWs();
    }
    if (!arms.some((a) => a.category === 'other')) {
      throw new MessageParseError(`plural for '${name}' lacks required 'other' arm`, this.pos);
    }
    return { kind: 'plural', name, offset, arms };
  }

  private parseSelectTail(name: string): MessageNode {
    const arms: Array<{ key: string; nodes: MessageNode[] }> = [];
    while (this.pos < this.src.length && this.peek() !== '}') {
      this.skipWs();
      if (this.peek() === '}') break;
      const key = this.parseIdentifier();
      const nodes = this.parseArmBody();
      arms.push({ key, nodes });
      this.skipWs();
    }
    if (!arms.some((a) => a.key === 'other')) {
      throw new MessageParseError(`select for '${name}' lacks required 'other' arm`, this.pos);
    }
    return { kind: 'select', name, arms };
  }

  private parseArmBody(): MessageNode[] {
    this.skipWs();
    this.expect('{');
    const nodes = this.parseMessage(true);
    this.expect('}');
    return nodes;
  }

  private parseIdentifier(): string {
    const m = /^[a-zA-Z0-9_.-]+/.exec(this.src.slice(this.pos));
    if (!m) throw new MessageParseError('expected identifier', this.pos);
    this.pos += m[0].length;
    return m[0];
  }

  private parseNumber(): number {
    const m = /^-?\d+/.exec(this.src.slice(this.pos));
    if (!m) throw new MessageParseError('expected number', this.pos);
    this.pos += m[0].length;
    return Number(m[0]);
  }

  private readUntil(ch: string): string {
    const end = this.src.indexOf(ch, this.pos);
    if (end === -1) throw new MessageParseError(`unterminated — expected '${ch}'`, this.pos);
    const s = this.src.slice(this.pos, end);
    this.pos = end;
    return s;
  }

  private peek(): string {
    return this.src[this.pos];
  }

  private expect(ch: string): void {
    this.skipWs();
    if (this.src[this.pos] !== ch) {
      throw new MessageParseError(`expected '${ch}', got '${this.src[this.pos] ?? 'EOF'}'`, this.pos);
    }
    this.pos++;
  }

  private skipWs(): void {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos])) this.pos++;
  }
}

// -------------------------------------------------------------- evaluation

export interface FormatContext {
  readonly locale: string;
  readonly pluralRule?: (n: number) => PluralCategory;
}

/**
 * Evaluate an AST against args. Missing args render as `{name}` (the
 * unresolved placeholder, matching ICU behaviour of leaving unfilled slots
 * visible rather than crashing).
 */
function evaluate(nodes: ReadonlyArray<MessageNode>, args: MessageArgs, ctx: FormatContext): string {
  let out = '';
  for (const node of nodes) {
    switch (node.kind) {
      case 'text':
        out += node.text;
        break;
      case 'arg': {
        if (node.name === '#') {
          // '#' only valid inside a plural arm — the plural case rewrites
          // it via args['#'] before descending; reaching here means a '#'
          // leaked outside a plural, render literally.
          const v = args['#'];
          out += v !== undefined ? formatScalar(v) : '#';
        } else {
          const v = args[node.name];
          out += v !== undefined ? formatScalar(v) : `{${node.name}}`;
        }
        break;
      }
      case 'format': {
        const v = args[node.name];
        if (v === undefined) {
          out += `{${node.name}}`;
        } else {
          out += formatTyped(v, node.type, node.style, ctx.locale);
        }
        break;
      }
      case 'plural': {
        const raw = args[node.name];
        const n = typeof raw === 'number' ? raw : Number(raw);
        if (!Number.isFinite(n)) {
          out += `{${node.name}}`;
          break;
        }
        const effective = n - node.offset;
        // Exact '=N' arms match the UN-offset number per ICU spec.
        const exact = node.arms.find((a) => a.category === '=' && a.exact === n);
        const rule = ctx.pluralRule ?? pluralRuleFor(ctx.locale);
        const cat = exact ? '=' : rule(effective);
        const arm = exact ?? node.arms.find((a) => a.category === cat) ?? node.arms.find((a) => a.category === 'other');
        if (!arm) {
          out += `{${node.name}}`;
          break;
        }
        out += evaluate(arm.nodes, { ...args, '#': effective }, ctx);
        break;
      }
      case 'select': {
        const v = args[node.name];
        const key = v !== undefined ? String(v) : undefined;
        const arm = (key !== undefined ? node.arms.find((a) => a.key === key) : undefined) ?? node.arms.find((a) => a.key === 'other');
        out += arm ? evaluate(arm.nodes, args, ctx) : `{${node.name}}`;
        break;
      }
    }
  }
  return out;
}

function formatScalar(v: MessageValue): string {
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/**
 * Formatting stubs — `Intl` powers them where available, with hand-rolled
 * fallbacks so behaviour is deterministic under test.
 */
function formatTyped(v: MessageValue, type: 'number' | 'date' | 'time', style: string | undefined, locale: string): string {
  if (type === 'number') {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) return String(v);
    if (style !== undefined) {
      // Skeleton styles: '0', '0.0', '0.00', 'percent', 'currency:EUR'.
      if (style === 'percent') return `${(n * 100).toFixed(0)}%`;
      if (style.startsWith('currency:')) {
        const cur = style.slice('currency:'.length);
        try {
          return new Intl.NumberFormat(locale, { style: 'currency', currency: cur }).format(n);
        } catch {
          return `${cur} ${n.toFixed(2)}`;
        }
      }
      const m = /^0\.(0+)$/.exec(style);
      if (m) return n.toFixed(m[1].length);
      if (style === '0') return n.toFixed(0);
    }
    try {
      return new Intl.NumberFormat(locale).format(n);
    } catch {
      return String(n);
    }
  }
  const d = v instanceof Date ? v : new Date(typeof v === 'number' ? v : String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  if (type === 'date') {
    const dateStyle = style === 'short' || style === 'medium' || style === 'long' || style === 'full' ? style : 'medium';
    try {
      return new Intl.DateTimeFormat(locale, { dateStyle }).format(d);
    } catch {
      return d.toISOString().slice(0, 10);
    }
  }
  // time
  const timeStyle = style === 'short' || style === 'medium' || style === 'long' || style === 'full' ? style : 'medium';
  try {
    return new Intl.DateTimeFormat(locale, { timeStyle }).format(d);
  } catch {
    return d.toISOString().slice(11, 19);
  }
}

// -------------------------------------------------------------- public API

/** Compile a message string into an evaluatable template. */
export function compileMessage(template: string): { ast: MessageNode[]; format(args: MessageArgs, ctx: FormatContext): string } {
  const ast = new Parser(template).parse();
  return {
    ast,
    format: (args, ctx) => evaluate(ast, args, ctx),
  };
}

/** One-shot convenience: parse + evaluate. */
export function formatMessage(template: string, args: MessageArgs, locale: string): string {
  return compileMessage(template).format(args, { locale });
}
