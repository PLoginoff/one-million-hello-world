/**
 * ThreatRulesEngine — signature-based detection for SQLi, XSS, path
 * traversal, command injection and scanner probes.
 *
 * Design:
 *  - Rules are *compiled once* at construction: each `patterns[]`
 *    entry becomes a `RegExp` with `i` (or not). Pattern compile is
 *    O(pattern) per rule, not per request — a per-request compile is
 *    the classic rules-engine latency bug.
 *  - Rules are sorted by `priority` ascending: cheap rules run first,
 *    and a CRITICAL match short-circuits — there's no reason to keep
 *    spending regex cycles once we've decided to block.
 *  - Each rule declares `surfaces` — the engine materializes each
 *    surface's text once per request and applies the rule's patterns
 *    to only the requested surfaces (a body-scoped rule never sees
 *    the URL, so an attack in the URL can't trigger a body rule —
 *    that's not a miss, it's precision).
 *  - `all-text` is the union surface: every textual field joined
 *    with `\x1f` (unit separator — can't appear in headers) so a
 *    pattern can't match across field boundaries and produce
 *    impossible matches.
 *
 * Severity → action mapping is the caller's concern; the engine
 * reports `blocked` when any match >= `blockAt` (default HIGH).
 *
 * Complexity: O(rules × surfaces × pattern). Rule order is stable —
 * priorities equal → insertion order (Array.prototype.sort is
 * stable in V8/JSC).
 *
 * @module SecurityLayer/Engine
 */

import {
  SEVERITY_ORDER,
  ThreatCategory,
  ThreatEvaluation,
  ThreatMatch,
  ThreatRequest,
  ThreatRule,
  ThreatSeverity,
  ThreatSurface,
} from './types';

interface CompiledRule extends ThreatRule {
  readonly regexes: readonly RegExp[];
}

/** Request fields → the text the surface probes. */
function surfaceText(surface: ThreatSurface, req: ThreatRequest): string | null {
  switch (surface) {
    case ThreatSurface.PATH:
      return req.path ?? null;
    case ThreatSurface.QUERY:
      return req.query ?? null;
    case ThreatSurface.BODY:
      return req.body ?? null;
    case ThreatSurface.USER_AGENT:
      return req.userAgent ?? null;
    case ThreatSurface.HEADERS:
      return req.headers
        ? Object.entries(req.headers)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n')
        : null;
    case ThreatSurface.COOKIES:
      return req.cookies
        ? Object.entries(req.cookies)
            .map(([k, v]) => `${k}=${v}`)
            .join('; ')
        : null;
    case ThreatSurface.ALL_TEXT:
      return [
        req.path,
        req.query,
        req.body,
        req.userAgent,
        req.headers ? Object.values(req.headers).join('\x1f') : undefined,
        req.cookies ? Object.values(req.cookies).join('\x1f') : undefined,
      ]
        .filter((s): s is string => s !== undefined)
        .join('\x1f');
  }
}

/* ------------------------------------------------------------------ */
/* Built-in signature set                                              */
/* ------------------------------------------------------------------ */

/**
 * Default signatures — deliberately conservative (fewer regexes,
 * each well-motivated) rather than a ModSecurity-sized ruleset. The
 * point is the engine's ordering/short-circuit mechanics plus a
 * working baseline; deployments extend via `addRule`.
 */
export const DEFAULT_THREAT_RULES: readonly ThreatRule[] = [
  /* ----------------------- path traversal ------------------------ */
  {
    id: 'PT-001',
    category: ThreatCategory.PATH_TRAVERSAL,
    severity: ThreatSeverity.HIGH,
    priority: 10,
    surfaces: [ThreatSurface.PATH, ThreatSurface.QUERY],
    patterns: ['\\.\\./', '\\.\\.\\\\', '%2e%2e', '%252e', '..%2f', '..%5c'],
    description: 'Directory traversal sequences',
  },
  {
    id: 'PT-002',
    category: ThreatCategory.PATH_TRAVERSAL,
    severity: ThreatSeverity.HIGH,
    priority: 11,
    surfaces: [ThreatSurface.PATH],
    patterns: ['/(etc/passwd|windows/system32|proc/self/)'],
    description: 'Sensitive system path probe',
  },

  /* --------------------------- SQLi ------------------------------ */
  {
    id: 'SQ-001',
    category: ThreatCategory.SQL_INJECTION,
    severity: ThreatSeverity.HIGH,
    priority: 20,
    surfaces: [ThreatSurface.QUERY, ThreatSurface.BODY],
    patterns: [
      "('\\s*(or|and)\\s+['\"0-9])",        // ' OR '1'='1
      '(union\\s+(all\\s+)?select)',        // UNION SELECT
      '(;\\s*(drop|delete|update|insert)\\s+)',
      '(--\\s|#\\s*$)',                     // SQL comment terminators
      "(\\bor\\b\\s+\\d+\\s*=\\s*\\d+)",    // OR 1=1
    ],
    description: 'SQL injection syntax probes',
  },
  {
    id: 'SQ-002',
    category: ThreatCategory.SQL_INJECTION,
    severity: ThreatSeverity.CRITICAL,
    priority: 5, // expensive multi-alternation — but severity is max so it still early-outs only after cheap rules
    surfaces: [ThreatSurface.QUERY, ThreatSurface.BODY],
    patterns: [
      '(\\bbenchmark\\s*\\(|\\bsleep\\s*\\(|\\bpg_sleep\\s*\\()', // time-based
      '(\\bload_file\\s*\\(|\\binto\\s+outfile\\b)',              // file IO
      '(\\binformation_schema\\b)',                              // schema enum
    ],
    description: 'SQLi data-exfil / time-based probes',
  },

  /* ---------------------------- XSS ------------------------------ */
  {
    id: 'XS-001',
    category: ThreatCategory.XSS,
    severity: ThreatSeverity.HIGH,
    priority: 30,
    surfaces: [ThreatSurface.QUERY, ThreatSurface.BODY],
    patterns: [
      '<\\s*script',
      'javascript\\s*:',
      'on\\w+\\s*=\\s*["\']?\\s*[^\\s>]+',   // on*= handlers
      '<\\s*(iframe|object|embed|svg\\s+onload)',
      'document\\.(cookie|location|write)',
    ],
    description: 'XSS markup and handler injection',
  },
  {
    id: 'XS-002',
    category: ThreatCategory.XSS,
    severity: ThreatSeverity.MEDIUM,
    priority: 31,
    surfaces: [ThreatSurface.QUERY, ThreatSurface.BODY],
    patterns: [
      '(%3c|%253c)',                       // encoded < probes
      '(alert\\s*\\(|prompt\\s*\\(|confirm\\s*\\()',
    ],
    description: 'Encoded / probe XSS payloads',
  },

  /* ---------------------- command injection ---------------------- */
  {
    id: 'CI-001',
    category: ThreatCategory.COMMAND_INJECTION,
    severity: ThreatSeverity.CRITICAL,
    priority: 40,
    surfaces: [ThreatSurface.QUERY, ThreatSurface.BODY],
    patterns: [
      '(;|\\||&&|\\$\\(|`)\\s*(cat|ls|id|whoami|uname|wget|curl|nc)\\b',
      '(\\$\\(.*\\))',                     // $(cmd) substitution
    ],
    description: 'Shell command injection',
  },

  /* ------------------------- scanner probes ---------------------- */
  {
    id: 'SC-001',
    category: ThreatCategory.SCANNER,
    severity: ThreatSeverity.LOW,
    priority: 90,
    surfaces: [ThreatSurface.USER_AGENT],
    patterns: [
      '(nikto|nmap|sqlmap|masscan|acunetix|nessus|openvas|dirbuster|gobuster)',
    ],
    description: 'Known scanner user-agents',
  },
];

export class ThreatRulesEngine {
  private _rules: CompiledRule[];
  private readonly _blockAt: ThreatSeverity;
  private _evaluations: number;
  private _totalMatches: number;

  constructor(
    rules: readonly ThreatRule[] = DEFAULT_THREAT_RULES,
    options: { blockAt?: ThreatSeverity } = {}
  ) {
    this._blockAt = options.blockAt ?? ThreatSeverity.HIGH;
    this._rules = [];
    this._evaluations = 0;
    this._totalMatches = 0;
    for (const r of rules) {
      this.addRule(r);
    }
  }

  /**
   * Add (or replace, by id) a rule. Compile happens here — inserting
   * into the sorted slot keeps evaluation order = priority order.
   */
  addRule(rule: ThreatRule): void {
    const compiled: CompiledRule = {
      ...rule,
      regexes: rule.patterns.map(
        (p) => new RegExp(p, rule.caseInsensitive === false ? '' : 'i')
      ),
    };
    // Replace-by-id or insertion into priority order.
    const existing = this._rules.findIndex((r) => r.id === rule.id);
    if (existing >= 0) {
      this._rules.splice(existing, 1);
    }
    let i = this._rules.length;
    while (i > 0 && this._rules[i - 1].priority > rule.priority) {
      i--;
    }
    this._rules.splice(i, 0, compiled);
  }

  removeRule(id: string): boolean {
    const i = this._rules.findIndex((r) => r.id === id);
    if (i < 0) {
      return false;
    }
    this._rules.splice(i, 1);
    return true;
  }

  get ruleCount(): number {
    return this._rules.length;
  }

  get evaluations(): number {
    return this._evaluations;
  }

  /* ---------------------------------------------------------------- */
  /* Evaluation                                                        */
  /* ---------------------------------------------------------------- */

  /**
   * Run every rule against the request's surfaces.
   *
   * Short-circuit: a CRITICAL match ends evaluation immediately —
   * blocking decisions are already made; further matching only adds
   * forensic detail we don't need at decision time.
   */
  evaluate(req: ThreatRequest): ThreatEvaluation {
    const start = Date.now();
    const matches: ThreatMatch[] = [];
    let maxSeverity = ThreatSeverity.INFO;

    // Materialize each surface once — not once per rule.
    const surfaceCache = new Map<ThreatSurface, string | null>();
    const textFor = (s: ThreatSurface): string | null => {
      if (!surfaceCache.has(s)) {
        surfaceCache.set(s, surfaceText(s, req));
      }
      return surfaceCache.get(s) ?? null;
    };

    outer: for (const rule of this._rules) {
      const surfaces =
        rule.surfaces.length > 0 ? rule.surfaces : [ThreatSurface.ALL_TEXT];
      for (const surface of surfaces) {
        const text = textFor(surface);
        if (text === null) {
          continue;
        }
        for (const re of rule.regexes) {
          const m = re.exec(text);
          if (m) {
            matches.push({
              ruleId: rule.id,
              category: rule.category,
              severity: rule.severity,
              surface,
              evidence: m[0],
              description: rule.description,
            });
            if (SEVERITY_ORDER[rule.severity] > SEVERITY_ORDER[maxSeverity]) {
              maxSeverity = rule.severity;
            }
            if (rule.severity === ThreatSeverity.CRITICAL) {
              break outer; // decided — stop evaluating
            }
            // One hit per (rule, surface) is enough — the rule fired.
            break;
          }
        }
      }
    }

    this._evaluations++;
    this._totalMatches += matches.length;

    return {
      matches,
      maxSeverity,
      blocked: SEVERITY_ORDER[maxSeverity] >= SEVERITY_ORDER[this._blockAt],
      evaluatedInMs: Date.now() - start,
    };
  }
}
