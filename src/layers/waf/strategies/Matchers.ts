/**
 * Matcher primitives for the WAF rule engine.
 *
 * Compiles a {@link RuleCondition} into a {@link CompiledMatcher}: a closure
 * that efficiently evaluates one atomic check against an {@link HttpRequest}.
 * Compilation happens once at rule-install time; evaluation is per-request.
 *
 * @module WafLayer/Strategies
 */

import {
  CompiledMatcher,
  HttpRequest,
  MatchTarget,
  RuleCondition,
} from '../types/http';

/** Apply a named transform to a raw string. */
export function applyTransform(value: string, transform: string): string {
  switch (transform) {
    case 'lowercase':
      return value.toLowerCase();
    case 'uppercase':
      return value.toUpperCase();
    case 'urldecode':
      return safeUrlDecode(value);
    case 'normalize-path':
      return normalizePath(value);
    case 'strip-whitespace':
      return value.replace(/\s+/g, '');
    default:
      return value;
  }
}

/**
 * Decode `%XX` and `+` (form-encoding) sequences; tolerates malformed input.
 */
export function safeUrlDecode(input: string): string {
  let prev = input;
  // Repeated decoding handles double-encoded payloads (`%2527` → `'`).
  for (let i = 0; i < 3; i++) {
    const decoded = decodeURIComponentSafe(prev);
    if (decoded === prev) {
      break;
    }
    prev = decoded;
  }
  return prev;
}

function decodeURIComponentSafe(s: string): string {
  try {
    // Replace '+' before decode — this is form encoding.
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s;
  }
}

/**
 * Path normalization: collapse `//`, `/./`, resolve `/../` lexically.
 * Never escapes above root (extra `..` are dropped, not sanitized away).
 */
export function normalizePath(path: string): string {
  const segments = path.split('/');
  const out: string[] = [];
  for (const seg of segments) {
    if (seg === '' || seg === '.') {
      continue;
    }
    if (seg === '..') {
      out.pop(); // Drop parent; if none, this `..` is dropped too.
      continue;
    }
    out.push(seg);
  }
  return '/' + out.join('/');
}

/** Pull the string a condition targets from the request. */
export function extractTarget(request: HttpRequest, target: MatchTarget): string {
  if (target === 'path') {
    return request.path;
  }
  if (target === 'method') {
    return request.method;
  }
  if (target === 'clientIp') {
    return request.clientIp;
  }
  if (target === 'body') {
    return request.body ?? '';
  }
  if (target === 'query') {
    return Object.entries(request.query)
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
  }
  if (target.startsWith('header:')) {
    const name = target.slice('header:'.length).toLowerCase();
    for (const [k, v] of Object.entries(request.headers)) {
      if (k.toLowerCase() === name) {
        return v;
      }
    }
    return '';
  }
  return '';
}

/** Truncate evidence for safe logging. */
export function evidenceSnippet(s: string, max = 80): string {
  if (s.length <= max) {
    return s;
  }
  return s.slice(0, max - 3) + '...';
}

/**
 * Compile a {@link RuleCondition} into a {@link CompiledMatcher}.
 *
 * Throws on an invalid regex so bad rules fail loudly at install time
 * instead of silently at match time.
 */
export function compileCondition(condition: RuleCondition): CompiledMatcher {
  const transforms = condition.transforms ?? [];
  const ignoreCase = condition.ignoreCase ?? false;

  // Pre-compile the pattern where possible.
  const predicate = buildPredicate(condition, ignoreCase);

  return {
    match(request: HttpRequest) {
      let raw = extractTarget(request, condition.target);
      for (const t of transforms) {
        raw = applyTransform(raw, t);
      }
      if (ignoreCase) {
        raw = raw.toLowerCase();
      }
      const result = predicate(raw);
      return {
        hit: result.hit,
        location: condition.target,
        evidence: result.hit ? evidenceSnippet(raw) : undefined,
      };
    },
  };
}

function buildPredicate(
  condition: RuleCondition,
  ignoreCase: boolean
): (input: string) => { hit: boolean } {
  switch (condition.kind) {
    case 'regex': {
      let re: RegExp;
      if (condition.pattern instanceof RegExp) {
        // Re-flag if the caller asked for case-insensitivity and the source
        // regex didn't already include it.
        re = ignoreCase && !condition.pattern.ignoreCase
          ? new RegExp(condition.pattern.source, condition.pattern.flags + 'i')
          : condition.pattern;
      } else {
        const flags = ignoreCase ? 'i' : '';
        re = new RegExp(String(condition.pattern), flags);
      }
      return (input) => ({ hit: re.test(input) });
    }
    case 'contains': {
      const needle = ignoreCase ? String(condition.pattern).toLowerCase() : String(condition.pattern);
      return (input) => ({ hit: input.includes(needle) });
    }
    case 'equals': {
      const needle = ignoreCase ? String(condition.pattern).toLowerCase() : String(condition.pattern);
      return (input) => ({ hit: input === needle });
    }
    case 'startsWith': {
      const needle = ignoreCase ? String(condition.pattern).toLowerCase() : String(condition.pattern);
      return (input) => ({ hit: input.startsWith(needle) });
    }
    case 'endsWith': {
      const needle = ignoreCase ? String(condition.pattern).toLowerCase() : String(condition.pattern);
      return (input) => ({ hit: input.endsWith(needle) });
    }
    case 'ip-in-list': {
      const set = new Set(
        (condition.pattern as readonly string[]).map((s) => s.trim().toLowerCase())
      );
      return (input) => ({ hit: set.has(input.toLowerCase()) });
    }
  }
}
