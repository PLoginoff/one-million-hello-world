/**
 * ErrorPath — immutable dot-notation path builder.
 *
 * Paths are `a.b.c` for object properties and `a[0].b` for array
 * indices — the notation the rest of the validation stack emits.
 * The object is immutable: every `child`/`at` returns a new path,
 * which is what recursive validators need (push child, recurse,
 * discard — no manual pop bookkeeping).
 *
 * @module ValidationLayer/Engine
 */

export class ErrorPath {
  /** Segments: strings for properties, numbers for indices. */
  private readonly _segments: readonly (string | number)[];

  private constructor(segments: readonly (string | number)[]) {
    this._segments = segments;
  }

  /** Root path — renders as `$` (or a caller-supplied root name). */
  static root(name = '$'): ErrorPath {
    return new ErrorPath([name]);
  }

  /** Child property access: `path.child('user')` → `$.user`. */
  child(name: string): ErrorPath {
    return new ErrorPath([...this._segments, name]);
  }

  /** Array index access: `path.at(3)` → `$[3]`. */
  at(index: number): ErrorPath {
    return new ErrorPath([...this._segments, index]);
  }

  /** Depth in segments (excluding the root marker). */
  get depth(): number {
    return this._segments.length - 1;
  }

  /** Raw segments (strings for props, numbers for indices). */
  get segments(): readonly (string | number)[] {
    return this._segments;
  }

  /** Last segment (property name or index), undefined at root. */
  get leaf(): string | number | undefined {
    return this._segments.length > 1
      ? this._segments[this._segments.length - 1]
      : undefined;
  }

  /**
   * Dot-notation render. String segments join with `.`; numeric
   * segments render `[i]` attached to the previous segment.
   */
  toString(): string {
    let out = '';
    for (const seg of this._segments) {
      if (typeof seg === 'number') {
        out += `[${seg}]`;
      } else {
        out += out.length === 0 ? seg : `.${seg}`;
      }
    }
    return out;
  }

  /** Parse a dot-notation string back into a path (round-trip). */
  static parse(s: string): ErrorPath {
    const segments: (string | number)[] = [];
    // Tokenize: `a.b[0].c` → a, b, [0], c — a small hand-rolled
    // scanner because regex splitting on '.|\[|\]' is brittle on
    // edge cases like `a..b`.
    let i = 0;
    let cur = '';
    const flush = () => {
      if (cur.length > 0) {
        segments.push(cur);
        cur = '';
      }
    };
    while (i < s.length) {
      const c = s[i];
      if (c === '.') {
        flush();
        i++;
      } else if (c === '[') {
        flush();
        const end = s.indexOf(']', i);
        if (end < 0) {
          cur += c;
          i++;
          continue;
        }
        const num = parseInt(s.slice(i + 1, end), 10);
        segments.push(Number.isNaN(num) ? s.slice(i + 1, end) : num);
        i = end + 1;
      } else {
        cur += c;
        i++;
      }
    }
    flush();
    return new ErrorPath(segments);
  }
}
