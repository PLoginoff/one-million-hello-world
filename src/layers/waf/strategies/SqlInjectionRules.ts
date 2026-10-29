/**
 * SqlInjectionRules
 *
 * Curated set of regex-driven rules for common SQL-injection payloads.
 * Patterns target the *syntactic* markers of SQLi rather than trying to be a
 * full SQL parser — union-select probes, comment-tail truncation, stacked
 * queries, tautology-based auth bypass, benchmark/sleep time-delay, and
 * common DBMS function names.
 *
 * Rule IDs are stable (`sqli-<name>`) and tagged with OWASP A03.
 *
 * @module WafLayer/Strategies
 */

import { RuleCondition, WafRule } from '../types/http';

/** Build a regex-driven body/query rule. */
function sqli(
  id: string,
  name: string,
  pattern: string | RegExp,
  target: 'body' | 'query' | 'path',
  priority: number = 100
): WafRule {
  const condition: RuleCondition = {
    target,
    kind: 'regex',
    pattern,
    ignoreCase: true,
    transforms: ['urldecode'],
  };
  return {
    id,
    name,
    priority,
    action: 'block',
    score: 0.9,
    ast: { type: 'condition', condition },
    tags: ['owasp-a03', 'sqli'],
  };
}

/** All SQLi rules. Add to the engine with `forEach(e.addRule)`. */
export const SQLI_RULES: WafRule[] = [
  sqli(
    'sqli-union-select',
    'UNION SELECT probe',
    /\bunion\b[\s\S]{0,80}?\bselect\b/i,
    'body'
  ),
  sqli(
    'sqli-union-all',
    'UNION ALL probe',
    /\bunion\s+all\b[\s\S]{0,80}?\bselect\b/i,
    'body'
  ),
  sqli(
    'sqli-comment-tail',
    'Comment-truncated statement',
    /('|"|`|\))\s*(--|#|\/\*)/,
    'body'
  ),
  sqli(
    'sqli-stacked-query',
    'Stacked query (semicolon + SELECT/DROP/INSERT/UPDATE)',
    /;\s*(select|insert|update|delete|drop|truncate|alter|create|exec|execute)\b/i,
    'body'
  ),
  sqli(
    'sqli-tautology-or',
    "Tautology: ' OR '1'='1",
    /('|")\s*or\s*\1?\s*\d+\s*=\s*\d+/i,
    'body'
  ),
  sqli(
    'sqli-tautology-like',
    "Tautology: OR 'a' LIKE 'a'",
    /('|")\s*(or|and)\s+('|")?\w+\1\s+(like|=)\s+\1?\w+\3/i,
    'body'
  ),
  sqli(
    'sqli-time-delay',
    'Time-delay: SLEEP / BENCHMARK / pg_sleep / WAITFOR',
    /\b(sleep|benchmark|pg_sleep|waitfor\s+delay)\s*\(/i,
    'body'
  ),
  sqli(
    'sqli-extract-data',
    'Data extraction via LOAD_FILE / INTO OUTFILE / UTL_HTTP',
    /\b(load_file|into\s+(out|dump)file|utl_http|xp_cmdshell|sp_executesql)\b/i,
    'body'
  ),
  sqli(
    'sqli-information-schema',
    'Information schema enumeration',
    /\binformation_schema\.(tables|columns|schemata|table_constraints)\b/i,
    'body'
  ),
  sqli(
    'sqli-dbms-fns',
    'DBMS fingerprinting functions',
    /\b(version|database|user|current_user|system_user|session_user)\s*\(\s*\)/i,
    'body'
  ),
  sqli(
    'sqli-hex-encode',
    'Hex-encoded literal (0x...) in query',
    /\b0x[0-9a-f]{8,}\b/i,
    'body',
    90
  ),
  sqli(
    'sqli-char-chr',
    'CHAR()/CHR() obfuscation',
    /\b(char|chr|ascii)\s*\(\s*\d+\s*\)/i,
    'body',
    85
  ),
  // Query-param focused variants (higher priority — more targeted).
  sqli(
    'sqli-query-tautology',
    "Query-param tautology ' OR 1=1 (quoted or bare)",
    /('|")?\s*(or|and)\s*('|")?\d+('|")?\s*=\s*('|")?\d+/i,
    'query',
    110
  ),
  sqli(
    'sqli-query-union',
    'Query-param UNION SELECT',
    /\bunion\b[\s\S]{0,60}?\bselect\b/i,
    'query',
    110
  ),
  sqli(
    'sqli-query-comment',
    'Query-param comment-tail',
    /('|"|`)\s*(--|#|\/\*)/,
    'query',
    110
  ),
  sqli(
    'sqli-path-comment',
    'Path contains SQL comment markers',
    /(%27|%22|'|")\s*(%2d%2d|%23|--|#)/i,
    'path',
    95
  ),
];

/** Install all SQLi rules on an engine. */
export function installSqlInjectionRules(engine: { addRule: (r: WafRule) => void }): void {
  for (const r of SQLI_RULES) {
    engine.addRule(r);
  }
}
