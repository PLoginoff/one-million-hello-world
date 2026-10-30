/**
 * HTTP Parser Engine — unit tests.
 *
 * Every parser is fed both whole-buffer and one-byte-at-a-time to
 * prove the incremental contract — a parser that only works when the
 * input arrives in one chunk isn't a streaming parser.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  MultipartParser,
  ChunkedDecoder,
  HeaderNormalizer,
  UrlParser,
  BodySizeLimiter,
  MultipartError,
  ChunkedEncodingError,
  BodyLimitExceededError,
  UrlParseError,
  MultipartPart,
} from '../index';

const enc = new TextEncoder();

function feedAll(
  feed: (b: Uint8Array) => void,
  bytes: Uint8Array,
  chunkSize = 0
): void {
  if (chunkSize <= 0) {
    feed(bytes);
    return;
  }
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    feed(bytes.slice(i, i + chunkSize));
  }
}

/* ------------------------------------------------------------------ */
/* MultipartParser                                                     */
/* ------------------------------------------------------------------ */

describe('MultipartParser', () => {
  const BODY =
    'preamble-ignored\r\n' +
    '--BOUND\r\n' +
    'Content-Disposition: form-data; name="field1"\r\n' +
    '\r\n' +
    'value1\r\n' +
    '--BOUND\r\n' +
    'Content-Disposition: form-data; name="file"; filename="a.txt"\r\n' +
    'Content-Type: text/plain\r\n' +
    '\r\n' +
    'file-body-with--dashes\r\nand second line\r\n' +
    '--BOUND--\r\n' +
    'epilogue-ignored';

  function collect() {
    const parts: { part: MultipartPart; data: Uint8Array[] }[] = [];
    let current: { part: MultipartPart; data: Uint8Array[] } | null = null;
    let completed = false;
    const parser = new MultipartParser(
      { boundary: 'BOUND' },
      {
        onPart(p) {
          current = { part: p, data: [] };
        },
        onPartData(d) {
          current?.data.push(d);
        },
        onPartEnd() {
          if (current) parts.push(current);
          current = null;
        },
        onComplete() {
          completed = true;
        },
      }
    );
    return { parser, parts, done: () => completed };
  }

  it('parses a two-part body fed as one buffer', () => {
    const { parser, parts, done } = collect();
    parser.feed(enc.encode(BODY));
    expect(done()).toBe(true);
    parser.finish();
    expect(parts.length).toBe(2);
    expect(parts[0].part.name).toBe('field1');
    expect(parts[0].part.filename).toBeNull();
    expect(new TextDecoder().decode(concat(parts[0].data))).toBe('value1');
    expect(parts[1].part.name).toBe('file');
    expect(parts[1].part.filename).toBe('a.txt');
    expect(parts[1].part.contentType).toBe('text/plain');
    expect(new TextDecoder().decode(concat(parts[1].data))).toBe(
      'file-body-with--dashes\r\nand second line'
    );
  });

  it('parses identically when fed one byte at a time', () => {
    const { parser, parts, done } = collect();
    feedAll((b) => parser.feed(b), enc.encode(BODY), 1);
    expect(done()).toBe(true);
    expect(parts.length).toBe(2);
    expect(new TextDecoder().decode(concat(parts[1].data))).toBe(
      'file-body-with--dashes\r\nand second line'
    );
  });

  it('does not corrupt a body whose contents contain boundary prefixes', () => {
    const body =
      '--B\r\n' +
      'Content-Disposition: form-data; name="x"\r\n' +
      '\r\n' +
      'data with --B inside it (no CRLF prefix, not a delimiter)\r\n' +
      '--B--';
    const { parser, parts } = collect2('B');
    parser.feed(enc.encode(body));
    expect(parts.length).toBe(1);
    expect(new TextDecoder().decode(concat(parts[0].data))).toBe(
      'data with --B inside it (no CRLF prefix, not a delimiter)'
    );
  });

  it('enforces maxPartSize mid-stream', () => {
    const body =
      '--B\r\n' +
      'Content-Disposition: form-data; name="x"\r\n' +
      '\r\n' +
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\r\n' +
      '--B--';
    const parser = new MultipartParser({ boundary: 'B', maxPartSize: 10 });
    expect(() => parser.feed(enc.encode(body))).toThrow(MultipartError);
  });

  it('enforces maxTotalSize', () => {
    const parser = new MultipartParser({ boundary: 'B', maxTotalSize: 20 });
    expect(() => parser.feed(enc.encode(`--B\r\nA: b\r\n\r\n${'x'.repeat(100)}`))).toThrow(
      MultipartError
    );
  });

  it('enforces maxParts', () => {
    const { parser } = collect2('B', { maxParts: 1 });
    const body =
      '--B\r\nA: b\r\n\r\n1\r\n--B\r\nA: b\r\n\r\n2\r\n--B--';
    expect(() => parser.feed(enc.encode(body))).toThrow(MultipartError);
  });

  it('rejects finish() before the final boundary', () => {
    const { parser } = collect();
    parser.feed(enc.encode('--BOUND\r\nA: b\r\n\r\npartial'));
    expect(() => parser.finish()).toThrow(MultipartError);
  });

  it('rejects a body with no boundary at all', () => {
    const { parser } = collect();
    parser.feed(enc.encode('no boundaries here'));
    expect(() => parser.finish()).toThrow(MultipartError);
  });

  function collect2(boundary: string, opts = {}) {
    const parts: { part: MultipartPart; data: Uint8Array[] }[] = [];
    let current: { part: MultipartPart; data: Uint8Array[] } | null = null;
    const parser = new MultipartParser(
      { boundary, ...opts },
      {
        onPart: (p) => (current = { part: p, data: [] }),
        onPartData: (d) => current?.data.push(d),
        onPartEnd: () => {
          if (current) parts.push(current);
          current = null;
        },
      }
    );
    return { parser, parts };
  }
});

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let i = 0;
  for (const c of chunks) {
    out.set(c, i);
    i += c.byteLength;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* ChunkedDecoder                                                      */
/* ------------------------------------------------------------------ */

describe('ChunkedDecoder', () => {
  function collect(opts = {}) {
    const data: Uint8Array[] = [];
    let trailers: Map<string, string> | null = null;
    let completed = false;
    const dec = new ChunkedDecoder(opts, {
      onData: (d) => data.push(d),
      onTrailers: (t) => (trailers = new Map(t)),
      onComplete: () => (completed = true),
    });
    return { dec, data, trailers: () => trailers, completed: () => completed };
  }

  it('decodes a simple chunked body', () => {
    const { dec, data, completed } = collect();
    dec.feed(enc.encode('4\r\nWiki\r\n5\r\npedia\r\n0\r\n\r\n'));
    expect(completed()).toBe(true);
    expect(new TextDecoder().decode(concat(data))).toBe('Wikipedia');
    expect(dec.bytesDecoded).toBe(9);
  });

  it('decodes when fed one byte at a time', () => {
    const { dec, data, completed } = collect();
    feedAll((b) => dec.feed(b), enc.encode('4\r\nWiki\r\n5\r\npedia\r\n0\r\n\r\n'), 1);
    expect(completed()).toBe(true);
    expect(new TextDecoder().decode(concat(data))).toBe('Wikipedia');
  });

  it('handles upper- and lower-case hex sizes', () => {
    const { dec, data } = collect();
    dec.feed(enc.encode('a\r\n0123456789\r\nA\r\nabcdefghij\r\n0\r\n\r\n'));
    expect(new TextDecoder().decode(concat(data))).toBe('0123456789abcdefghij');
  });

  it('parses trailer headers and calls onTrailers', () => {
    const { dec, trailers } = collect();
    dec.feed(
      enc.encode('4\r\nWiki\r\n0\r\nX-Checksum: abc123\r\nExpires: never\r\n\r\n')
    );
    expect(trailers()?.get('x-checksum')).toBe('abc123');
    expect(trailers()?.get('expires')).toBe('never');
  });

  it('discards chunk extensions', () => {
    const { dec, data, completed } = collect();
    dec.feed(enc.encode('4;foo=bar;baz\r\nWiki\r\n0;done=yes\r\n\r\n'));
    expect(completed()).toBe(true);
    expect(new TextDecoder().decode(concat(data))).toBe('Wiki');
  });

  it('rejects a missing CRLF after chunk data', () => {
    const { dec } = collect();
    expect(() => dec.feed(enc.encode('4\r\nWikiXX0\r\n\r\n'))).toThrow(
      ChunkedEncodingError
    );
  });

  it('rejects non-hex in the size line', () => {
    const { dec } = collect();
    expect(() => dec.feed(enc.encode('zz\r\nWiki\r\n0\r\n\r\n'))).toThrow(
      ChunkedEncodingError
    );
  });

  it('enforces maxTotalBytes mid-stream', () => {
    const { dec } = collect({ maxTotalBytes: 5 });
    expect(() => dec.feed(enc.encode('8\r\n01234567\r\n0\r\n\r\n'))).toThrow(
      ChunkedEncodingError
    );
  });

  it('whitelists trailers when allowedTrailers is set', () => {
    const { dec } = collect({ allowedTrailers: new Set(['x-ok']) });
    expect(() =>
      dec.feed(enc.encode('0\r\nX-Evil: yes\r\n\r\n'))
    ).toThrow(ChunkedEncodingError);
    const ok = collect({ allowedTrailers: new Set(['x-ok']) });
    ok.dec.feed(enc.encode('0\r\nX-Ok: fine\r\n\r\n'));
    expect(ok.trailers()?.get('x-ok')).toBe('fine');
  });

  it('finish() throws when the stream ends mid-body', () => {
    const { dec } = collect();
    dec.feed(enc.encode('4\r\nWi'));
    expect(() => dec.finish()).toThrow(ChunkedEncodingError);
  });

  it('emits data incrementally across feeds within one chunk', () => {
    const { dec, data } = collect();
    dec.feed(enc.encode('6\r\nabc'));
    expect(data.length).toBe(1);
    dec.feed(enc.encode('def\r\n0\r\n\r\n'));
    expect(new TextDecoder().decode(concat(data))).toBe('abcdef');
  });
});

/* ------------------------------------------------------------------ */
/* HeaderNormalizer                                                    */
/* ------------------------------------------------------------------ */

describe('HeaderNormalizer', () => {
  let norm: HeaderNormalizer;

  beforeEach(() => {
    norm = new HeaderNormalizer();
  });

  it('lower-cases names and trims values', () => {
    const r = norm.normalize([
      ['Content-Type', '  application/json  '],
      ['X-Custom', 'v'],
    ]);
    expect(r.byName.get('content-type')).toBe('application/json');
    expect(r.headers[0].rawName).toBe('Content-Type');
  });

  it('merges list-valued duplicates with comma-join', () => {
    const r = norm.normalize([
      ['Accept', 'text/html'],
      ['Accept', 'application/json'],
    ]);
    expect(r.byName.get('accept')).toBe('text/html, application/json');
    expect(r.duplicates.get('accept')).toBe(2);
  });

  it('does not merge Set-Cookie (last wins in byName, all kept in headers)', () => {
    const r = norm.normalize([
      ['Set-Cookie', 'a=1'],
      ['Set-Cookie', 'b=2'],
    ]);
    expect(r.byName.get('set-cookie')).toBe('b=2');
    expect(r.headers.filter((h) => h.name === 'set-cookie').length).toBe(2);
  });

  it('unfolds obs-fold continuation lines', () => {
    const r = norm.normalize([
      ['X-Long', 'part1'],
      '   part2 folded',
    ]);
    expect(r.byName.get('x-long')).toBe('part1 part2 folded');
    expect(r.foldedLines).toBe(1);
  });

  it('records duplicate counts', () => {
    const r = norm.normalize([
      ['X-A', '1'],
      ['X-A', '2'],
      ['X-A', '3'],
    ]);
    expect(r.duplicates.get('x-a')).toBe(3);
  });

  it('normalizeBlock parses a raw CRLF block', () => {
    const r = norm.normalizeBlock(
      'Host: example.com\r\nAccept: a\r\nAccept: b\r\n\r\n'
    );
    expect(r.byName.get('host')).toBe('example.com');
    expect(r.byName.get('accept')).toBe('a, b');
  });

  it('respects noMergeFields override', () => {
    const n = new HeaderNormalizer({ noMergeFields: new Set(['accept']) });
    const r = n.normalize([
      ['Accept', 'a'],
      ['Accept', 'b'],
    ]);
    expect(r.byName.get('accept')).toBe('b');
  });
});

/* ------------------------------------------------------------------ */
/* UrlParser                                                           */
/* ------------------------------------------------------------------ */

describe('UrlParser', () => {
  let parser: UrlParser;

  beforeEach(() => {
    parser = new UrlParser();
  });

  it('parses origin-form targets', () => {
    const u = parser.parse('/path/to?q=1&r=2#frag');
    expect(u.path).toBe('/path/to');
    expect(u.queryMap.get('q')).toBe('1');
    expect(u.fragment).toBe('frag');
    expect(u.host).toBe('');
  });

  it('parses absolute-form with host and port', () => {
    const u = parser.parse('https://example.com:8443/p?x=1');
    expect(u.protocol).toBe('https');
    expect(u.host).toBe('example.com');
    expect(u.port).toBe(8443);
    expect(u.path).toBe('/p');
  });

  it('infers default ports for known schemes', () => {
    expect(parser.parse('http://h/').port).toBe(80);
    expect(parser.parse('https://h/').port).toBe(443);
  });

  it('empty path in absolute form becomes /', () => {
    expect(parser.parse('http://h').path).toBe('/');
  });

  it('handles asterisk-form', () => {
    expect(parser.parse('*').path).toBe('*');
  });

  it('decodes percent-encoding including UTF-8 sequences', () => {
    const u = parser.parse('/caf%C3%A9?k=%20v');
    expect(u.path).toBe('/café');
    expect(u.queryMap.get('k')).toBe(' v');
  });

  it('treats + as space in query but not path', () => {
    const u = parser.parse('/a+b?x=a+b');
    expect(u.path).toBe('/a+b');
    expect(u.queryMap.get('x')).toBe('a b');
  });

  it('preserves duplicate query params in order', () => {
    const u = parser.parse('/?k=1&k=2&k=3');
    expect(u.query.map(([, v]) => v)).toEqual(['1', '2', '3']);
    expect(u.queryMap.get('k')).toBe('1'); // first wins in the map
  });

  it('parses userinfo', () => {
    const u = parser.parse('http://user:pass@h/');
    expect(u.username).toBe('user');
    expect(u.password).toBe('pass');
  });

  it('parses IPv6 literals', () => {
    const u = parser.parse('http://[::1]:8080/p');
    expect(u.host).toBe('[::1]');
    expect(u.port).toBe(8080);
  });

  it('parseAuthority handles CONNECT targets', () => {
    const { host, port } = parser.parseAuthority('example.com:443');
    expect(host).toBe('example.com');
    expect(port).toBe(443);
    expect(() => parser.parseAuthority('example.com')).toThrow(UrlParseError);
  });

  it('rejects non-numeric and out-of-range ports', () => {
    expect(() => parser.parse('http://h:abc/')).toThrow(UrlParseError);
    expect(() => parser.parse('http://h:99999/')).toThrow(UrlParseError);
  });

  it('rejects bad percent-encoding', () => {
    expect(() => parser.parse('/%zz')).toThrow(UrlParseError);
    expect(() => parser.parse('/%1')).toThrow(UrlParseError);
  });

  it('enforces maxLength', () => {
    const p = new UrlParser({ maxLength: 10 });
    expect(() => p.parse('/this-is-too-long')).toThrow(UrlParseError);
  });

  it('stringifyQuery round-trips pairs', () => {
    const pairs: [string, string][] = [['a b', 'x+y'], ['k', 'v']];
    const s = UrlParser.stringifyQuery(pairs);
    const u = new UrlParser().parse(`/?${s}`);
    expect(u.queryMap.get('a b')).toBe('x+y');
    expect(u.queryMap.get('k')).toBe('v');
  });
});

/* ------------------------------------------------------------------ */
/* BodySizeLimiter                                                     */
/* ------------------------------------------------------------------ */

describe('BodySizeLimiter', () => {
  it('passes under-budget chunks through untouched', () => {
    const l = new BodySizeLimiter({ maxBytes: 10 });
    const chunk = new Uint8Array(5);
    const r = l.feed(chunk);
    expect(r.accepted).toBe(chunk); // same reference — no copy
    expect(r.exceeded).toBe(false);
    expect(l.remaining).toBe(5);
  });

  it('throws on the exact chunk that crosses the limit (hard mode)', () => {
    const l = new BodySizeLimiter({ maxBytes: 10 });
    l.feed(new Uint8Array(8));
    try {
      l.feed(new Uint8Array(5));
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(BodyLimitExceededError);
      expect((e as BodyLimitExceededError).limit).toBe(10);
      expect(l.exceeded).toBe(true);
    }
  });

  it('truncates without throwing in soft mode', () => {
    const l = new BodySizeLimiter({ maxBytes: 10 }, false);
    l.feed(new Uint8Array(8));
    const r = l.feed(new Uint8Array(5));
    expect(r.exceeded).toBe(true);
    expect(r.accepted.byteLength).toBe(2); // only in-budget prefix
    expect(l.totalAccepted).toBe(10);
  });

  it('forwards nothing after the budget is spent (soft mode)', () => {
    const l = new BodySizeLimiter({ maxBytes: 5 }, false);
    l.feed(new Uint8Array(10));
    const r = l.feed(new Uint8Array(10));
    expect(r.accepted.byteLength).toBe(0);
    expect(r.exceeded).toBe(true);
  });

  it('reset() restores the budget', () => {
    const l = new BodySizeLimiter({ maxBytes: 5 });
    l.feed(new Uint8Array(5));
    expect(l.remaining).toBe(0);
    l.reset();
    expect(l.remaining).toBe(5);
    expect(l.exceeded).toBe(false);
  });
});
