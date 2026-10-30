/**
 * UrlParser — HTTP request-target decomposition with structured
 * query-string handling.
 *
 * Handles the forms an origin server actually sees (RFC 9112 §3.2):
 *  - origin-form:    `/path?query#frag`          (normal requests)
 *  - absolute-form:  `http://host/path?query`    (proxies)
 *  - authority-form: `host:port`                 (CONNECT)
 *  - asterisk-form:  `*`                         (OPTIONS)
 *
 * This is deliberately not a full WHATWG URL implementation — the
 * parser exists to give the pipeline structured access to request
 * targets, not to resolve relative URLs or do IDNA. What it *does*
 * carefully:
 *  - percent-decoding with UTF-8 boundary correctness (%XX sequences
 *    decode as octets then UTF-8, not as lone chars — `%C3%A9` must
 *    produce `é`, not `\xC3\xA9` mojibake);
 *  - `+`-as-space in query strings only (path keeps `+` literal —
 *    a very common off-by-site bug);
 *  - ordered duplicate-preserving query params ([k,v] pairs) plus a
 *    first-value map for convenience;
 *  - port validation (numeric, 0-65535) and default-port inference.
 *
 * Complexity: O(n) over the input; no backtracking.
 *
 * @module HttpParserLayer/Engine
 */

import { ParsedUrl, UrlParseError, UrlParserOptions } from './types';

const SCHEME_PORT: ReadonlyMap<string, number> = new Map([
  ['http', 80],
  ['https', 443],
  ['ws', 80],
  ['wss', 443],
]);

const HEX = '0123456789abcdef';

/** Percent-decode `s` treating `+` as space iff `plusAsSpace`. */
function pctDecode(s: string, plusAsSpace: boolean): string {
  // Fast path: nothing to decode.
  if (s.indexOf('%') < 0 && (!plusAsSpace || s.indexOf('+') < 0)) {
    return s;
  }
  const bytes: number[] = [];
  const n = s.length;
  let i = 0;
  while (i < n) {
    const c = s.charCodeAt(i);
    if (c === 0x25 /* % */) {
      if (i + 2 >= n || !isHexChar(s[i + 1]) || !isHexChar(s[i + 2])) {
        throw new UrlParseError(s, `bad percent-encoding at offset ${i}`);
      }
      bytes.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 3;
      continue;
    }
    if (plusAsSpace && c === 0x2b /* + */) {
      bytes.push(0x20);
      i++;
      continue;
    }
    // ASCII passthrough; non-ASCII chars are kept as code points by
    // re-encoding — request targets should be ASCII but tolerance is
    // cheaper than strictness here.
    if (c < 0x80) {
      bytes.push(c);
    } else {
      const enc = new TextEncoder().encode(s[i]);
      for (const b of enc) bytes.push(b);
    }
    i++;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
}

function isHexChar(c: string): boolean {
  return HEX.indexOf(c.toLowerCase()) >= 0;
}

/** Split `k=v&k=v` into ordered decoded pairs. `+` = space. */
function parseQuery(qs: string): Array<readonly [string, string]> {
  if (qs.length === 0) {
    return [];
  }
  const out: Array<readonly [string, string]> = [];
  for (const pair of qs.split('&')) {
    if (pair.length === 0) {
      continue; // `a=1&&b=2` — tolerate empty segments
    }
    const eq = pair.indexOf('=');
    if (eq < 0) {
      // Key-only params (`?flag`) carry an empty value, not null —
      // `?flag` and `?flag=` are equivalent on the wire.
      out.push([pctDecode(pair, true), '']);
    } else {
      out.push([
        pctDecode(pair.slice(0, eq), true),
        pctDecode(pair.slice(eq + 1), true),
      ]);
    }
  }
  return out;
}

export class UrlParser {
  private readonly _inferDefaultPort: boolean;
  private readonly _maxLength: number;
  private readonly _decode: boolean;

  constructor(options: UrlParserOptions = {}) {
    this._inferDefaultPort = options.inferDefaultPort ?? true;
    this._maxLength = options.maxLength ?? 0;
    this._decode = options.decodeComponents ?? true;
  }

  /** Parse a request-target (origin or absolute form). */
  parse(input: string): ParsedUrl {
    if (input.length === 0) {
      throw new UrlParseError(input, 'empty input');
    }
    if (this._maxLength > 0 && input.length > this._maxLength) {
      throw new UrlParseError(input, `exceeds maxLength ${this._maxLength}`);
    }
    if (input === '*') {
      return this._result('', '', null, '*', '', '', '', '');
    }

    let rest = input;
    let protocol = '';
    let authority = '';

    // [scheme://authority] prefix — absolute form.
    const schemeIdx = rest.indexOf('://');
    if (schemeIdx >= 0) {
      protocol = rest.slice(0, schemeIdx).toLowerCase();
      if (!/^[a-z][a-z0-9+.-]*$/.test(protocol)) {
        throw new UrlParseError(input, `invalid scheme '${protocol}'`);
      }
      rest = rest.slice(schemeIdx + 3);
      // Authority runs to the first '/', '?', or '#'.
      let end = rest.length;
      for (const sep of ['/', '?', '#']) {
        const i = rest.indexOf(sep);
        if (i >= 0 && i < end) {
          end = i;
        }
      }
      authority = rest.slice(0, end);
      rest = rest.slice(end);
    }

    // Split off fragment then query (order matters: `#` after `?`).
    let fragment = '';
    const hashIdx = rest.indexOf('#');
    if (hashIdx >= 0) {
      fragment = rest.slice(hashIdx + 1);
      rest = rest.slice(0, hashIdx);
    }
    let queryStr = '';
    const qIdx = rest.indexOf('?');
    if (qIdx >= 0) {
      queryStr = rest.slice(qIdx + 1);
      rest = rest.slice(0, qIdx);
    }

    const path = rest.length === 0 && authority.length > 0 ? '/' : rest;

    // Authority → userinfo@host:port
    let username = '';
    let password = '';
    let hostport = authority;
    const atIdx = authority.lastIndexOf('@');
    if (atIdx >= 0) {
      const ui = authority.slice(0, atIdx);
      hostport = authority.slice(atIdx + 1);
      const colon = ui.indexOf(':');
      if (colon >= 0) {
        username = ui.slice(0, colon);
        password = ui.slice(colon + 1);
      } else {
        username = ui;
      }
    }

    const { host, port } = this._splitHostPort(hostport, input, protocol);

    const decoded = (s: string, plus: boolean): string =>
      this._decode ? pctDecode(s, plus) : s;

    const query = parseQuery(queryStr);
    const queryMap = new Map<string, string>();
    for (const [k, v] of query) {
      if (!queryMap.has(k)) {
        queryMap.set(k, v);
      }
    }

    return this._result(
      protocol,
      host.toLowerCase(),
      port,
      decoded(path, false) || '/',
      queryStr,
      decoded(fragment, false),
      decoded(username, false),
      decoded(password, false),
      query,
      queryMap
    );
  }

  /** Authority-form parse for CONNECT: `host:port` only. */
  parseAuthority(input: string): { host: string; port: number } {
    const { host, port } = this._splitHostPort(input, input, '');
    if (port === null) {
      throw new UrlParseError(input, 'authority-form requires a port');
    }
    return { host, port };
  }

  /** Rebuild a query string from ordered pairs (round-trip helper). */
  static stringifyQuery(
    pairs: ReadonlyArray<readonly [string, string]>
  ): string {
    const enc = (s: string): string =>
      encodeURIComponent(s).replace(/%20/g, '+');
    return pairs.map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&');
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                         */
  /* ---------------------------------------------------------------- */

  private _splitHostPort(
    hostport: string,
    input: string,
    protocol: string
  ): { host: string; port: number | null } {
    if (hostport.length === 0) {
      return { host: '', port: this._inferDefaultPort ? SCHEME_PORT.get(protocol) ?? null : null };
    }
    // IPv6 literal: [::1]:8080
    if (hostport.startsWith('[')) {
      const close = hostport.indexOf(']');
      if (close < 0) {
        throw new UrlParseError(input, 'unterminated IPv6 literal');
      }
      const host = hostport.slice(0, close + 1);
      const tail = hostport.slice(close + 1);
      if (tail.length === 0) {
        return { host, port: this._inferDefaultPort ? SCHEME_PORT.get(protocol) ?? null : null };
      }
      if (!tail.startsWith(':')) {
        throw new UrlParseError(input, `unexpected '${tail}' after IPv6 literal`);
      }
      return { host, port: this._parsePort(tail.slice(1), input) };
    }
    const colon = hostport.lastIndexOf(':');
    if (colon < 0) {
      return { host: hostport, port: this._inferDefaultPort ? SCHEME_PORT.get(protocol) ?? null : null };
    }
    const host = hostport.slice(0, colon);
    const port = this._parsePort(hostport.slice(colon + 1), input);
    return { host, port };
  }

  private _parsePort(s: string, input: string): number | null {
    if (s.length === 0) {
      return null;
    }
    if (!/^[0-9]+$/.test(s)) {
      throw new UrlParseError(input, `non-numeric port '${s}'`);
    }
    const port = parseInt(s, 10);
    if (port > 65_535) {
      throw new UrlParseError(input, `port ${port} out of range`);
    }
    return port;
  }

  private _result(
    protocol: string,
    host: string,
    port: number | null,
    path: string,
    _queryStr: string,
    fragment: string,
    username: string,
    password: string,
    query: Array<readonly [string, string]> = [],
    queryMap: Map<string, string> = new Map()
  ): ParsedUrl {
    return { protocol, host, port, path, query, queryMap, fragment, username, password };
  }
}
