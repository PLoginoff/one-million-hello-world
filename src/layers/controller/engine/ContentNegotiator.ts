/**
 * Content Negotiator + Response Builder
 *
 * Parses `Accept` headers into weighted media ranges and selects the
 * best serializer a controller supports, per RFC 9110 §12.5.1:
 *
 *   Accept: text/html, application/json;q=0.9, * / *;q=0.1
 *
 * Selection algorithm:
 * - Each offered media type is scored against each Accept range by
 *   (specificity, q): type+subtype match > type/* > *\/*. Ranges are
 *   sorted by (q desc, specificity desc, index asc); the first offering
 *   accepted by the highest-priority range wins.
 * - No `Accept` header ⇒ first registered serializer (server default).
 * - `q=0` explicitly forbids a type — a match at q=0 is rejected.
 *
 * Serializers are pluggable; the engine ships JSON, CSV and plain-text
 * implementations covering the common API surface.
 *
 * @module ControllerLayer/Engine
 */

import { AcceptRange, BodySerializer, NegotiatedResponse, ResponseBody } from './types';

/** Parse a q-value string ("0.9", "0", absent) to a float. */
function parseQ(raw: string | undefined): number {
  if (raw === undefined) {
    return 1;
  }
  const q = Number.parseFloat(raw);
  return Number.isNaN(q) ? 0 : Math.max(0, Math.min(1, q));
}

/**
 * Parse an `Accept` header into sorted media ranges.
 *
 * Malformed segments (no `/`) are skipped rather than throwing — clients
 * routinely send odd headers; tolerance beats strictness here.
 */
export function parseAccept(header: string | undefined): AcceptRange[] {
  if (header === undefined || header.trim() === '') {
    return [{ type: '*', subtype: '*', q: 1, index: 0 }];
  }

  const ranges: AcceptRange[] = [];
  header.split(',').forEach((part, index) => {
    const segments = part.trim().split(';');
    const media = segments[0].trim();
    const slash = media.indexOf('/');
    if (slash < 0) {
      return;
    }
    let q = 1;
    for (const seg of segments.slice(1)) {
      const [k, v] = seg.split('=').map((s) => s.trim());
      if (k === 'q') {
        q = parseQ(v);
      }
    }
    ranges.push({ type: media.slice(0, slash), subtype: media.slice(slash + 1), q, index });
  });

  // Sort by q desc, then specificity desc, then original position.
  const specificity = (r: AcceptRange): number =>
    (r.type === '*' ? 0 : 1) + (r.subtype === '*' ? 0 : 1);
  ranges.sort((a, b) => b.q - a.q || specificity(b) - specificity(a) || a.index - b.index);
  return ranges;
}

/**
 * Whether a media range accepts a concrete `type/subtype`.
 */
export function rangeAccepts(range: AcceptRange, type: string, subtype: string): boolean {
  if (range.q === 0) {
    return false;
  }
  const typeMatch = range.type === '*' || range.type === type;
  const subtypeMatch = range.subtype === '*' || range.subtype === subtype;
  return typeMatch && subtypeMatch;
}

/** JSON serializer — the default API representation. */
export class JsonSerializer implements BodySerializer {
  readonly contentType = 'application/json';

  serialize(body: ResponseBody): string {
    return JSON.stringify(body);
  }
}

/**
 * CSV serializer — flattens arrays of objects into a header row + data
 * rows. Scalars and non-array bodies fall back to a single column.
 */
export class CsvSerializer implements BodySerializer {
  readonly contentType = 'text/csv';

  serialize(body: ResponseBody): string {
    if (Array.isArray(body)) {
      return this._rows(body);
    }
    if (body !== null && typeof body === 'object') {
      return this._rows([body]);
    }
    return this._escapeCell(String(body ?? '')) + '\r\n';
  }

  private _rows(items: readonly unknown[]): string {
    if (items.length === 0) {
      return '\r\n';
    }
    const first = items[0];
    const columns =
      first !== null && typeof first === 'object' && !Array.isArray(first)
        ? Object.keys(first as Record<string, unknown>)
        : ['value'];

    const lines: string[] = [columns.map((c) => this._escapeCell(c)).join(',')];
    for (const item of items) {
      if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
        const record = item as Record<string, unknown>;
        lines.push(columns.map((c) => this._escapeCell(this._cell(record[c]))).join(','));
      } else {
        lines.push(this._escapeCell(this._cell(item)));
      }
    }
    return lines.join('\r\n') + '\r\n';
  }

  private _cell(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  private _escapeCell(text: string): string {
    // RFC 4180: quote when containing comma, quote or newline; "" escapes ".
    if (/[",\r\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }
}

/** Plain-text serializer — String() of the body. */
export class PlainTextSerializer implements BodySerializer {
  readonly contentType = 'text/plain';

  serialize(body: ResponseBody): string {
    if (typeof body === 'string') {
      return body;
    }
    if (body === null || body === undefined) {
      return '';
    }
    return typeof body === 'object' ? JSON.stringify(body) : String(body);
  }
}

/**
 * Response builder — owns the serializer registry and resolves a
 * request's `Accept` header to a concrete serialization.
 */
export class ResponseBuilder {
  private readonly _serializers: Map<string, BodySerializer>;
  private readonly _order: string[];

  constructor(serializers?: readonly BodySerializer[]) {
    const initial = serializers ?? [new JsonSerializer(), new CsvSerializer(), new PlainTextSerializer()];
    this._serializers = new Map();
    this._order = [];
    for (const s of initial) {
      this.register(s);
    }
  }

  /** Register (or replace) a serializer. */
  register(serializer: BodySerializer): void {
    if (!this._serializers.has(serializer.contentType)) {
      this._order.push(serializer.contentType);
    }
    this._serializers.set(serializer.contentType, serializer);
  }

  /** Media types supported, in preference order. */
  supported(): readonly string[] {
    return [...this._order];
  }

  /**
   * Negotiate + serialize.
   *
   * @throws NotAcceptableError when no supported type matches the
   *         Accept header — callers map this to a 406 problem+json.
   */
  build(status: number, body: ResponseBody, acceptHeader?: string): NegotiatedResponse {
    const ranges = parseAccept(acceptHeader);

    for (const range of ranges) {
      for (const contentType of this._order) {
        const [type, subtype] = contentType.split('/');
        if (rangeAccepts(range, type, subtype)) {
          const serializer = this._serializers.get(contentType);
          if (serializer === undefined) {
            continue;
          }
          return {
            status,
            contentType: serializer.contentType,
            body: serializer.serialize(body),
            negotiation: { selected: serializer.contentType, candidates: this.supported() },
          };
        }
      }
    }

    throw new NotAcceptableError(this.supported(), acceptHeader);
  }
}

/** 406-equivalent: no supported type was acceptable to the client. */
export class NotAcceptableError extends Error {
  readonly supportedTypes: readonly string[];
  readonly acceptHeader?: string;

  constructor(supportedTypes: readonly string[], acceptHeader?: string) {
    super(`No acceptable representation. Supported: ${supportedTypes.join(', ')}`);
    this.name = 'NotAcceptableError';
    this.supportedTypes = supportedTypes;
    this.acceptHeader = acceptHeader;
  }
}
