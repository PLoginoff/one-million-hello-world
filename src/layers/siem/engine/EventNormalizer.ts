/**
 * SIEM Event Normalization
 *
 * Parses raw log input (syslog-like, key=value, JSON) into a structured
 * `NormalizedEvent` with a canonical field set: timestamp, severity,
 * source host/process, source/destination IPs, user, action, outcome,
 * and arbitrary extracted fields.
 *
 * The parser is deliberately forgiving — real SIEM ingest deals with
 * partial and malformed records — but every parser annotates
 * `parseQuality` so downstream correlation can weight low-confidence
 * parses differently.
 *
 * @module SiemLayer/Engine
 */

export type EventOutcome = 'success' | 'failure' | 'unknown';

export interface NormalizedEvent {
  /** Assigned at ingest — monotonically increasing per collector. */
  readonly id: number;
  /** Epoch ms; falls back to ingest time when the record lacks a timestamp. */
  readonly timestampMs: number;
  /** Original raw record for forensic purposes. */
  readonly raw: string;
  /** Normalized severity string: emerg|alert|crit|err|warning|notice|info|debug. */
  readonly severity: string;
  readonly sourceHost?: string;
  readonly sourceProcess?: string;
  readonly sourceIp?: string;
  readonly destIp?: string;
  readonly user?: string;
  /** Canonical action, e.g. 'login', 'logout', 'file-read', 'network-connect'. */
  readonly action?: string;
  readonly outcome: EventOutcome;
  /** All fields extracted by the parser (raw key → value). */
  readonly fields: Record<string, string>;
  /** Parse diagnostics — empty means a clean parse. */
  readonly parseQuality: 'full' | 'partial' | 'failed';
}

/** RFC 3164 syslog severity names indexed by PRI & 7. */
const SYSLOG_SEVERITIES = [
  'emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug',
] as const;

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Map a PRI value (0-191) to facility + severity. */
export function decodePri(pri: number): { facility: number; severity: string } {
  return { facility: pri >> 3, severity: SYSLOG_SEVERITIES[pri & 7] ?? 'info' };
}

/**
 * Parser interface — one parse attempt per registered parser, in order.
 * Return `null` to pass to the next parser.
 */
export interface IEventParser {
  readonly name: string;
  parse(raw: string, ingestMs: number, id: number): NormalizedEvent | null;
}

// RFC 3164: <PRI>Mmm dd HH:mm:ss host process[pid]: message
const RFC3164_RE =
  /^<(\d{1,3})>([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+(\S+)\s+([\w./-]+)(?:\[(\d+)\])?:\s?(.*)$/;

// RFC 5424: <PRI>1 TIMESTAMP HOST APP PID MSGID SD MSG  (minimal subset)
const RFC5424_RE = /^<(\d{1,3})>1\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.*)$/;

const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
// Match "user <name>" or "for <name>" phrasing plus explicit key=value forms.
const USER_KEY_RE = /(?:user|username|acct|account)[=:]\s*"?([A-Za-z0-9_.@-]+)"?/i;
const USER_FOR_RE = /\bfor (?:invalid user )?([A-Za-z0-9_.@-]+) (?:from|on|by)\b/i;
const FAILED_LOGIN_RE = /failed (?:password|login|authentication)|authentication failure|invalid user/i;
const SUCCESS_LOGIN_RE = /accepted (?:password|publickey)|session opened|login successful/i;

function extractUser(msg: string): string | undefined {
  const kv = USER_KEY_RE.exec(msg);
  if (kv) return kv[1];
  const fr = USER_FOR_RE.exec(msg);
  if (fr) return fr[1];
  return undefined;
}

function extractIp(msg: string): { src?: string; dst?: string } {
  const ips = msg.match(new RegExp(IPV4_RE.source, 'g')) ?? [];
  return { src: ips[0], dst: ips[1] };
}

function classifyAction(msg: string): { action?: string; outcome: EventOutcome } {
  if (FAILED_LOGIN_RE.test(msg)) return { action: 'login', outcome: 'failure' };
  if (SUCCESS_LOGIN_RE.test(msg)) return { action: 'login', outcome: 'success' };
  if (/\blogout|session closed/i.test(msg)) return { action: 'logout', outcome: 'success' };
  if (/\bdenied|blocked|dropped|reject/i.test(msg)) return { action: 'network', outcome: 'failure' };
  if (/\bsudo|privilege|escalat/i.test(msg)) return { action: 'privilege-escalation', outcome: 'unknown' };
  return { outcome: 'unknown' };
}

/**
 * RFC 3164 ("BSD syslog") parser. Produces a `full` parse when the
 * header matches; timestamps without a year are assigned to the ingest
 * year (standard syslog behaviour).
 */
export class SyslogParser implements IEventParser {
  readonly name = 'syslog-rfc3164';
  private readonly _defaultYear: number;

  constructor(defaultYear?: number) {
    this._defaultYear = defaultYear ?? new Date().getUTCFullYear();
  }

  parse(raw: string, ingestMs: number, id: number): NormalizedEvent | null {
    const m = RFC3164_RE.exec(raw);
    if (!m) return null;
    const [, priStr, monStr, dayStr, hh, mm, ss, host, process, , msg] = m;
    const pri = parseInt(priStr, 10);
    const { severity } = decodePri(pri);
    const month = MONTHS[monStr.toLowerCase()];
    const ts =
      month !== undefined
        ? Date.UTC(this._defaultYear, month, parseInt(dayStr, 10), parseInt(hh, 10), parseInt(mm, 10), parseInt(ss, 10))
        : ingestMs;
    const { src, dst } = extractIp(msg);
    const { action, outcome } = classifyAction(msg);
    return {
      id,
      timestampMs: ts,
      raw,
      severity,
      sourceHost: host,
      sourceProcess: process,
      sourceIp: src,
      destIp: dst,
      user: extractUser(msg),
      action,
      outcome,
      fields: { pri: priStr, message: msg },
      parseQuality: 'full',
    };
  }
}

/** Minimal RFC 5424 parser — timestamp and structured fields only. */
export class Syslog5424Parser implements IEventParser {
  readonly name = 'syslog-rfc5424';

  parse(raw: string, ingestMs: number, id: number): NormalizedEvent | null {
    const m = RFC5424_RE.exec(raw);
    if (!m) return null;
    const [, priStr, ts, host, app, , , msg] = m;
    const { severity } = decodePri(parseInt(priStr, 10));
    const parsed = Date.parse(ts);
    const { src, dst } = extractIp(msg);
    const { action, outcome } = classifyAction(msg);
    return {
      id,
      timestampMs: Number.isNaN(parsed) ? ingestMs : parsed,
      raw,
      severity,
      sourceHost: host === '-' ? undefined : host,
      sourceProcess: app === '-' ? undefined : app,
      sourceIp: src,
      destIp: dst,
      user: extractUser(msg),
      action,
      outcome,
      fields: { pri: priStr, message: msg },
      parseQuality: 'full',
    };
  }
}

/** key=value pair extraction (fortinet/paloalto-style logs). */
const KV_RE = /([A-Za-z_][\w.-]*)=((?:"[^"]*")|(?:'[^']*')|\S+)/g;

export class KeyValueParser implements IEventParser {
  readonly name = 'key-value';

  parse(raw: string, ingestMs: number, id: number): NormalizedEvent | null {
    KV_RE.lastIndex = 0;
    const fields: Record<string, string> = {};
    let match: RegExpExecArray | null;
    let count = 0;
    while ((match = KV_RE.exec(raw)) !== null) {
      const v = match[2];
      fields[match[1]] =
        (v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))
          ? v.slice(1, -1)
          : v;
      count++;
    }
    if (count < 2) return null; // require at least two pairs
    const tsField = fields['time'] ?? fields['timestamp'] ?? fields['date'];
    const ts = tsField ? Date.parse(tsField) : NaN;
    const msg = fields['msg'] ?? fields['message'] ?? raw;
    const { action, outcome } = classifyAction(msg);
    return {
      id,
      timestampMs: Number.isNaN(ts) ? ingestMs : ts,
      raw,
      severity: (fields['severity'] ?? fields['level'] ?? 'info').toLowerCase(),
      sourceHost: fields['host'] ?? fields['hostname'],
      sourceIp: fields['srcip'] ?? fields['src'] ?? fields['source_ip'],
      destIp: fields['dstip'] ?? fields['dst'] ?? fields['dest_ip'],
      user: fields['user'] ?? fields['username'] ?? fields['acct'],
      action: fields['action'] ?? action,
      outcome: fields['outcome'] === 'failure' || fields['result'] === 'fail' ? 'failure'
        : fields['outcome'] === 'success' || fields['result'] === 'success' ? 'success'
        : outcome,
      fields,
      parseQuality: 'full',
    };
  }
}

/** JSON line parser — expects a flat-ish object. */
export class JsonEventParser implements IEventParser {
  readonly name = 'json';

  parse(raw: string, ingestMs: number, id: number): NormalizedEvent | null {
    const trimmed = raw.trim();
    if (!trimmed.startsWith('{')) return null;
    let obj: unknown;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      return null;
    }
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return null;
    const rec = obj as Record<string, unknown>;
    const str = (k: string): string | undefined =>
      typeof rec[k] === 'string' ? (rec[k] as string) : undefined;
    const ts = str('timestamp') ?? str('time') ?? str('@timestamp');
    const parsed = ts ? Date.parse(ts) : NaN;
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(rec)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        fields[k] = String(v);
      }
    }
    const msg = str('message') ?? str('msg') ?? '';
    const { action, outcome } = classifyAction(msg);
    return {
      id,
      timestampMs: Number.isNaN(parsed) ? ingestMs : parsed,
      raw,
      severity: (str('severity') ?? str('level') ?? 'info').toLowerCase(),
      sourceHost: str('host') ?? str('hostname'),
      sourceIp: str('source_ip') ?? str('srcip') ?? str('src'),
      destIp: str('dest_ip') ?? str('dstip') ?? str('dst'),
      user: str('user') ?? str('username'),
      action: str('action') ?? action,
      outcome: str('outcome') === 'failure' ? 'failure' : str('outcome') === 'success' ? 'success' : outcome,
      fields,
      parseQuality: 'full',
    };
  }
}

/** Fallback: treat the whole line as a message. */
export class PlainTextParser implements IEventParser {
  readonly name = 'plain-text';

  parse(raw: string, ingestMs: number, id: number): NormalizedEvent {
    const { src, dst } = extractIp(raw);
    const { action, outcome } = classifyAction(raw);
    return {
      id,
      timestampMs: ingestMs,
      raw,
      severity: 'info',
      sourceIp: src,
      destIp: dst,
      user: extractUser(raw),
      action,
      outcome,
      fields: { message: raw },
      parseQuality: 'partial',
    };
  }
}

/**
 * Normalization pipeline: try registered parsers in order, take the
 * first non-null result, fall back to plain text.
 */
export class EventNormalizer {
  private readonly _parsers: IEventParser[];
  private _nextId = 1;
  private _clock: () => number;

  constructor(parsers?: IEventParser[], clock: () => number = Date.now) {
    this._clock = clock;
    this._parsers = parsers ?? [
      new SyslogParser(),
      new Syslog5424Parser(),
      new JsonEventParser(),
      new KeyValueParser(),
      new PlainTextParser(),
    ];
  }

  normalize(raw: string): NormalizedEvent {
    const ingest = this._clock();
    const id = this._nextId++;
    for (const p of this._parsers) {
      const evt = p.parse(raw, ingest, id);
      if (evt) return evt;
    }
    // Unreachable — PlainTextParser always returns — but keeps the
    // invariant explicit if someone removes the fallback.
    return new PlainTextParser().parse(raw, ingest, id);
  }

  normalizeBatch(raws: ReadonlyArray<string>): NormalizedEvent[] {
    return raws.map((r) => this.normalize(r));
  }
}
