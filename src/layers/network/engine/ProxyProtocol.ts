/**
 * ProxyProtocol — HTTP CONNECT tunneling and SOCKS5-style handshake
 * state machines.
 *
 * Two wire protocols, one purpose: a client asks an intermediary to
 * open a raw TCP pipe to `host:port` on its behalf, then speaks the
 * target protocol through it. The state machines here model the
 * *negotiation* — what bytes must arrive in what order, what replies
 * mean — without touching a socket.
 *
 * HTTP CONNECT (RFC 9110 §9.3.6):
 *
 *   client → "CONNECT host:port HTTP/1.1\r\nHost: ...\r\n\r\n"
 *   proxy  → "HTTP/1.1 200 Connection Established\r\n\r\n"  → tunnel
 *   proxy  → "HTTP/1.1 407|502|... \r\n\r\n"                → refused
 *
 * The parse is incremental (data arrives in arbitrary chunkings) and
 * header-block-size-capped (8 KiB — a proxy that reads unbounded
 * headers is a memory-exhaustion bug).
 *
 * SOCKS5 (RFC 1928):
 *
 *   greeting   client → [VER=5, NMETHODS, METHODS...]
 *              proxy  → [VER=5, METHOD]   (0x00 none, 0x02 user/pass,
 *                                          0xFF no acceptable)
 *   auth(0x02) client → [VER=1, ULEN, UNAME, PLEN, PASSWD]  (RFC 1929)
 *              proxy  → [VER=1, STATUS]
 *   request    client → [VER=5, CMD=CONNECT|BIND|UDP, RSV, ATYP, ADDR, PORT]
 *              proxy  → [VER=5, REP, RSV, ATYP, BND.ADDR, BND.PORT]
 *
 * REP=0x00 granted → the socket is now a tunnel to DST.ADDR:DST.PORT.
 * The state machine exposes `feed(bytes)` → `{replies, state, tunnel}`
 * so a caller can drive it with `socket.on('data')` equivalents or a
 * deterministic byte-stream in tests.
 *
 * Both machines are pure: feed bytes in, get reply bytes + state out.
 * Complexities: feed O(n) over buffered bytes, O(1) state transitions.
 *
 * @module NetworkLayer/Engine
 */

/* ------------------------------------------------------------------ */
/* Shared vocabulary                                                   */
/* ------------------------------------------------------------------ */

export const enum ProxyKind {
  HTTP_CONNECT = 'http-connect',
  SOCKS5 = 'socks5',
}

/**
 * Where the peer's bytes plug into the pipeline after negotiation.
 * `tunnel` = raw pass-through to target; everything before it is
 * proxy-plane traffic.
 */
export const enum ProxyPhase {
  NEGOTIATING = 'negotiating',
  TUNNEL = 'tunnel',
  FAILED = 'failed',
  CLOSED = 'closed',
}

export interface ProxyTarget {
  readonly host: string;
  readonly port: number;
}

export interface FeedResult {
  /** Bytes the peer must be sent (may be empty). */
  readonly replies: Uint8Array[];
  readonly phase: ProxyPhase;
  /** Negotiated target once established. */
  readonly target?: ProxyTarget;
  /** Failure detail when phase === FAILED. */
  readonly error?: string;
  /** Leftover bytes already past the negotiation boundary (tunnel data). */
  readonly tunnelBytes?: Uint8Array;
}

/* ------------------------------------------------------------------ */
/* HTTP CONNECT                                                        */
/* ------------------------------------------------------------------ */

export const enum ConnectState {
  /** Reading request line + headers. */
  READ_REQUEST = 'read-request',
  /** Negotiated — all further bytes are tunnel payload. */
  TUNNEL = 'tunnel',
  FAILED = 'failed',
}

/** Cap for the CONNECT request block; 8 KiB matches common proxies. */
export const CONNECT_MAX_HEADER_BYTES = 8192;

export interface ConnectRequest {
  readonly method: string;
  readonly target: ProxyTarget;
  readonly httpVersion: string;
  readonly headers: Readonly<Record<string, string>>;
}

/**
 * Server-side CONNECT handler: parses the client's request block,
 * validates it, and produces the appropriate response line. A real
 * deployment pairs `feed()` output with `socket.write`.
 */
export class ConnectServerHandshake {
  private _buf: Uint8Array = new Uint8Array(0);
  private _state: ConnectState = ConnectState.READ_REQUEST;
  private readonly _maxHeaderBytes: number;
  private readonly _allowedPorts: ReadonlySet<number> | null;

  constructor(opts: { maxHeaderBytes?: number; allowedPorts?: readonly number[] } = {}) {
    this._maxHeaderBytes = opts.maxHeaderBytes ?? CONNECT_MAX_HEADER_BYTES;
    this._allowedPorts = opts.allowedPorts ? new Set(opts.allowedPorts) : null;
  }

  get state(): ConnectState {
    return this._state;
  }

  feed(chunk: Uint8Array): FeedResult {
    if (this._state === ConnectState.TUNNEL) {
      return { replies: [], phase: ProxyPhase.TUNNEL, tunnelBytes: chunk };
    }
    if (this._state === ConnectState.FAILED) {
      return { replies: [], phase: ProxyPhase.FAILED };
    }

    this._buf = concat(this._buf, chunk);
    if (this._buf.length > this._maxHeaderBytes) {
      this._state = ConnectState.FAILED;
      return {
        replies: [encodeAscii('HTTP/1.1 431 Request Header Fields Too Large\r\n\r\n')],
        phase: ProxyPhase.FAILED,
        error: 'header-block-too-large',
      };
    }

    const end = indexOfCrlfCrlf(this._buf);
    if (end < 0) {
      return { replies: [], phase: ProxyPhase.NEGOTIATING };
    }

    const head = decodeAscii(this._buf.subarray(0, end));
    const rest = this._buf.subarray(end + 4);
    const parsed = parseConnectRequest(head);
    if (parsed === null) {
      this._state = ConnectState.FAILED;
      return {
        replies: [encodeAscii('HTTP/1.1 400 Bad Request\r\n\r\n')],
        phase: ProxyPhase.FAILED,
        error: 'malformed-request',
      };
    }
    if (parsed.method !== 'CONNECT') {
      this._state = ConnectState.FAILED;
      return {
        replies: [encodeAscii('HTTP/1.1 405 Method Not Allowed\r\nAllow: CONNECT\r\n\r\n')],
        phase: ProxyPhase.FAILED,
        error: 'not-connect',
      };
    }
    if (this._allowedPorts !== null && !this._allowedPorts.has(parsed.target.port)) {
      this._state = ConnectState.FAILED;
      return {
        replies: [encodeAscii('HTTP/1.1 403 Forbidden\r\n\r\n')],
        phase: ProxyPhase.FAILED,
        error: 'port-not-allowed',
      };
    }

    this._state = ConnectState.TUNNEL;
    return {
      replies: [encodeAscii('HTTP/1.1 200 Connection Established\r\n\r\n')],
      phase: ProxyPhase.TUNNEL,
      target: parsed.target,
      tunnelBytes: rest.length > 0 ? rest : undefined,
    };
  }
}

/**
 * Client-side CONNECT: builds the request and consumes the proxy's
 * response status line.
 */
export class ConnectClientHandshake {
  private _buf: Uint8Array = new Uint8Array(0);
  private _state: ConnectState = ConnectState.READ_REQUEST;
  private readonly _target: ProxyTarget;

  constructor(target: ProxyTarget) {
    this._target = target;
  }

  get state(): ConnectState {
    return this._state;
  }

  /** The request bytes to send. */
  request(): Uint8Array {
    const authority = `${this._target.host}:${this._target.port}`;
    return encodeAscii(
      `CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`
    );
  }

  feed(chunk: Uint8Array): FeedResult {
    if (this._state !== ConnectState.READ_REQUEST) {
      return {
        replies: [],
        phase: this._state === ConnectState.TUNNEL ? ProxyPhase.TUNNEL : ProxyPhase.FAILED,
        tunnelBytes: this._state === ConnectState.TUNNEL ? chunk : undefined,
      };
    }
    this._buf = concat(this._buf, chunk);
    const end = indexOfCrlfCrlf(this._buf);
    if (end < 0) return { replies: [], phase: ProxyPhase.NEGOTIATING };

    const statusLine = decodeAscii(this._buf.subarray(0, end)).split('\r\n')[0];
    const m = /^HTTP\/\d(?:\.\d)?\s+(\d{3})/.exec(statusLine);
    const rest = this._buf.subarray(end + 4);
    if (m === null) {
      this._state = ConnectState.FAILED;
      return { replies: [], phase: ProxyPhase.FAILED, error: 'bad-status-line' };
    }
    const code = Number.parseInt(m[1], 10);
    if (code >= 200 && code < 300) {
      this._state = ConnectState.TUNNEL;
      return {
        replies: [],
        phase: ProxyPhase.TUNNEL,
        target: this._target,
        tunnelBytes: rest.length > 0 ? rest : undefined,
      };
    }
    this._state = ConnectState.FAILED;
    return { replies: [], phase: ProxyPhase.FAILED, error: `status-${code}` };
  }
}

/** Parse "CONNECT host:port HTTP/1.1" + header block. */
function parseConnectRequest(head: string): ConnectRequest | null {
  const lines = head.split('\r\n');
  if (lines.length === 0) return null;
  const parts = lines[0].split(' ');
  if (parts.length !== 3) return null;
  const [method, authority, version] = parts;
  if (!version.startsWith('HTTP/')) return null;
  // Method check before authority parse: a `GET /` isn't *malformed*,
  // it's a valid HTTP request in the wrong place — the caller maps
  // 'not-connect' to 405, 'malformed-request' to 400.
  if (method !== 'CONNECT') {
    return { method, target: { host: '', port: 0 }, httpVersion: version, headers: {} };
  }
  const target = parseAuthority(authority);
  if (target === null) return null;
  const headers: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return { method, target, httpVersion: version, headers };
}

/** Parse `host:port` or `[v6]:port`. */
export function parseAuthority(authority: string): ProxyTarget | null {
  if (authority.length === 0) return null;
  if (authority.startsWith('[')) {
    const close = authority.indexOf(']');
    if (close < 0 || authority[close + 1] !== ':') return null;
    const port = Number.parseInt(authority.slice(close + 2), 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    return { host: authority.slice(1, close), port };
  }
  const i = authority.lastIndexOf(':');
  if (i < 0) return null;
  const port = Number.parseInt(authority.slice(i + 1), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host: authority.slice(0, i), port };
}

/* ------------------------------------------------------------------ */
/* SOCKS5                                                              */
/* ------------------------------------------------------------------ */

export const enum Socks5State {
  /** Awaiting client greeting [VER, NMETHODS, METHODS...]. */
  GREETING = 'greeting',
  /** Method chosen; awaiting sub-negotiation (RFC 1929 auth). */
  AUTH = 'auth',
  /** Awaiting request [VER, CMD, RSV, ATYP, ADDR, PORT]. */
  REQUEST = 'request',
  /** Granted — bytes are tunnel payload. */
  TUNNEL = 'tunnel',
  FAILED = 'failed',
}

export const enum Socks5Method {
  NO_AUTH = 0x00,
  GSSAPI = 0x01,
  USER_PASS = 0x02,
  NO_ACCEPTABLE = 0xff,
}

export const enum Socks5Cmd {
  CONNECT = 0x01,
  BIND = 0x02,
  UDP_ASSOCIATE = 0x03,
}

export const enum Socks5AddrType {
  IPV4 = 0x01,
  DOMAIN = 0x03,
  IPV6 = 0x04,
}

/** RFC 1929 §2 reply codes — the useful subset. */
export const enum Socks5Reply {
  GRANTED = 0x00,
  GENERAL_FAILURE = 0x01,
  NOT_ALLOWED = 0x02,
  NET_UNREACHABLE = 0x03,
  HOST_UNREACHABLE = 0x04,
  REFUSED = 0x05,
  TTL_EXPIRED = 0x06,
  CMD_UNSUPPORTED = 0x07,
  ATYP_UNSUPPORTED = 0x08,
}

export interface Socks5ServerOptions {
  /** Methods the server accepts, preference order. */
  readonly methods?: readonly Socks5Method[];
  /** Credential check for USER_PASS; default accepts nothing. */
  readonly authenticate?: (user: string, pass: string) => boolean;
  /** Only CONNECT is supported by this stub (BIND/UDP → CMD_UNSUPPORTED). */
  readonly allowCommands?: readonly Socks5Cmd[];
}

/**
 * Server-side SOCKS5 negotiation. Fed arbitrary chunkings; emits the
 * exact reply bytes the RFC mandates at each stage.
 */
export class Socks5ServerHandshake {
  private _buf: Uint8Array = new Uint8Array(0);
  private _state: Socks5State = Socks5State.GREETING;
  private readonly _methods: readonly Socks5Method[];
  private readonly _authenticate: (u: string, p: string) => boolean;
  private readonly _allowCommands: ReadonlySet<Socks5Cmd>;

  constructor(opts: Socks5ServerOptions = {}) {
    this._methods = opts.methods ?? [Socks5Method.NO_AUTH];
    this._authenticate = opts.authenticate ?? (() => false);
    this._allowCommands = new Set(opts.allowCommands ?? [Socks5Cmd.CONNECT]);
  }

  get state(): Socks5State {
    return this._state;
  }

  feed(chunk: Uint8Array): FeedResult {
    if (this._state === Socks5State.TUNNEL) {
      return { replies: [], phase: ProxyPhase.TUNNEL, tunnelBytes: chunk };
    }
    if (this._state === Socks5State.FAILED) {
      return { replies: [], phase: ProxyPhase.FAILED };
    }
    this._buf = concat(this._buf, chunk);

    // TUNNEL/FAILED returned early above; the narrowed state is
    // exactly GREETING | AUTH | REQUEST here.
    switch (this._state) {
      case Socks5State.GREETING:
        return this._greeting();
      case Socks5State.AUTH:
        return this._auth();
      case Socks5State.REQUEST:
        return this._request();
    }
  }

  /* ---- greeting: [VER=5 NMETHODS METHODS...] → [VER METHOD] ---- */

  private _greeting(): FeedResult {
    if (this._buf.length < 2) return { replies: [], phase: ProxyPhase.NEGOTIATING };
    const ver = this._buf[0];
    const n = this._buf[1];
    if (ver !== 0x05) {
      this._state = Socks5State.FAILED;
      return { replies: [new Uint8Array([0x05, Socks5Method.NO_ACCEPTABLE])], phase: ProxyPhase.FAILED, error: 'bad-version' };
    }
    if (this._buf.length < 2 + n) return { replies: [], phase: ProxyPhase.NEGOTIATING };
    const offered = this._buf.subarray(2, 2 + n);
    this._buf = this._buf.subarray(2 + n);

    const chosen = this._methods.find((m) => offered.includes(m));
    if (chosen === undefined) {
      this._state = Socks5State.FAILED;
      return { replies: [new Uint8Array([0x05, Socks5Method.NO_ACCEPTABLE])], phase: ProxyPhase.FAILED, error: 'no-method' };
    }
    const reply = new Uint8Array([0x05, chosen]);
    this._state = chosen === Socks5Method.USER_PASS ? Socks5State.AUTH : Socks5State.REQUEST;
    return { replies: [reply], phase: ProxyPhase.NEGOTIATING };
  }

  /* ---- RFC 1929 auth: [VER=1 ULEN UNAME PLEN PASSWD] → [VER STATUS] ---- */

  private _auth(): FeedResult {
    if (this._buf.length < 2) return { replies: [], phase: ProxyPhase.NEGOTIATING };
    const ver = this._buf[0];
    const ulen = this._buf[1];
    if (ver !== 0x01) {
      this._state = Socks5State.FAILED;
      return { replies: [new Uint8Array([0x01, 0x01])], phase: ProxyPhase.FAILED, error: 'bad-auth-version' };
    }
    if (this._buf.length < 2 + ulen + 1) return { replies: [], phase: ProxyPhase.NEGOTIATING };
    const user = decodeAscii(this._buf.subarray(2, 2 + ulen));
    const plen = this._buf[2 + ulen];
    if (this._buf.length < 3 + ulen + plen) return { replies: [], phase: ProxyPhase.NEGOTIATING };
    const pass = decodeAscii(this._buf.subarray(3 + ulen, 3 + ulen + plen));
    this._buf = this._buf.subarray(3 + ulen + plen);

    if (!this._authenticate(user, pass)) {
      this._state = Socks5State.FAILED;
      return { replies: [new Uint8Array([0x01, 0x01])], phase: ProxyPhase.FAILED, error: 'auth-failed' };
    }
    this._state = Socks5State.REQUEST;
    return { replies: [new Uint8Array([0x01, 0x00])], phase: ProxyPhase.NEGOTIATING };
  }

  /* ---- request: [VER CMD RSV ATYP ADDR PORT] → reply ---- */

  private _request(): FeedResult {
    if (this._buf.length < 4) return { replies: [], phase: ProxyPhase.NEGOTIATING };
    const [ver, cmd, , atyp] = [this._buf[0], this._buf[1], this._buf[2], this._buf[3]];
    if (ver !== 0x05) {
      this._state = Socks5State.FAILED;
      return { replies: [this._reply(Socks5Reply.GENERAL_FAILURE)], phase: ProxyPhase.FAILED, error: 'bad-version' };
    }

    const addrLen = atyp === Socks5AddrType.IPV4 ? 4
      : atyp === Socks5AddrType.IPV6 ? 16
      : atyp === Socks5AddrType.DOMAIN ? -1
      : -2;
    if (addrLen === -2) {
      this._state = Socks5State.FAILED;
      return { replies: [this._reply(Socks5Reply.ATYP_UNSUPPORTED)], phase: ProxyPhase.FAILED, error: 'bad-atyp' };
    }
    if (addrLen === -1) {
      // DOMAIN: length-prefixed
      if (this._buf.length < 5) return { replies: [], phase: ProxyPhase.NEGOTIATING };
      const dlen = this._buf[4];
      if (this._buf.length < 5 + dlen + 2) return { replies: [], phase: ProxyPhase.NEGOTIATING };
      const host = decodeAscii(this._buf.subarray(5, 5 + dlen));
      const port = (this._buf[5 + dlen] << 8) | this._buf[5 + dlen + 1];
      this._buf = this._buf.subarray(5 + dlen + 2);
      return this._finish(cmd, { host, port });
    }
    if (this._buf.length < 4 + addrLen + 2) return { replies: [], phase: ProxyPhase.NEGOTIATING };
    const addr = this._buf.subarray(4, 4 + addrLen);
    const port = (this._buf[4 + addrLen] << 8) | this._buf[4 + addrLen + 1];
    this._buf = this._buf.subarray(4 + addrLen + 2);
    const host = atyp === Socks5AddrType.IPV4
      ? `${addr[0]}.${addr[1]}.${addr[2]}.${addr[3]}`
      : formatIpv6(addr);
    return this._finish(cmd, { host, port });
  }

  private _finish(cmd: number, target: ProxyTarget): FeedResult {
    if (!this._allowCommands.has(cmd as Socks5Cmd)) {
      this._state = Socks5State.FAILED;
      return { replies: [this._reply(Socks5Reply.CMD_UNSUPPORTED)], phase: ProxyPhase.FAILED, error: 'cmd-unsupported' };
    }
    this._state = Socks5State.TUNNEL;
    // BND.ADDR/BND.PORT = 0.0.0.0:0 — the stub doesn't bind a real
    // upstream socket, so it reports the wildcard bind address a
    // minimal server is allowed to send.
    return {
      replies: [this._reply(Socks5Reply.GRANTED)],
      phase: ProxyPhase.TUNNEL,
      target,
      tunnelBytes: this._buf.length > 0 ? this._buf : undefined,
    };
  }

  private _reply(rep: Socks5Reply): Uint8Array {
    // [VER REP RSV ATYP=1 BND.ADDR(4 zeros) BND.PORT(2 zeros)]
    return new Uint8Array([0x05, rep, 0x00, 0x01, 0, 0, 0, 0, 0, 0]);
  }
}

/** Formats 16 bytes as a compressed-ish IPv6 literal (full groups). */
function formatIpv6(b: Uint8Array): string {
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) {
    groups.push(((b[i] << 8) | b[i + 1]).toString(16));
  }
  return groups.join(':');
}

/* ------------------------------------------------------------------ */
/* Byte helpers                                                        */
/* ------------------------------------------------------------------ */

export function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/** Find "\r\n\r\n"; returns the index of the first '\r' or -1. */
function indexOfCrlfCrlf(buf: Uint8Array): number {
  for (let i = 0; i + 3 < buf.length; i++) {
    if (buf[i] === 0x0d && buf[i + 1] === 0x0a && buf[i + 2] === 0x0d && buf[i + 3] === 0x0a) {
      return i;
    }
  }
  return -1;
}

export function encodeAscii(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0x7f;
  return out;
}

function decodeAscii(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

/** Client helper: build a SOCKS5 CONNECT request frame. */
export function socks5ConnectFrame(target: ProxyTarget): Uint8Array {
  const host = target.host;
  const ipv4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  let atyp: Socks5AddrType;
  let addr: number[];
  if (ipv4) {
    atyp = Socks5AddrType.IPV4;
    addr = [Number(ipv4[1]), Number(ipv4[2]), Number(ipv4[3]), Number(ipv4[4])];
  } else {
    atyp = Socks5AddrType.DOMAIN;
    addr = [host.length, ...Array.from(encodeAscii(host))];
  }
  return new Uint8Array([0x05, Socks5Cmd.CONNECT, 0x00, atyp, ...addr, (target.port >> 8) & 0xff, target.port & 0xff]);
}

/** Client helper: build the greeting [VER NMETHODS METHODS...]. */
export function socks5Greeting(methods: readonly Socks5Method[]): Uint8Array {
  return new Uint8Array([0x05, methods.length, ...methods]);
}
