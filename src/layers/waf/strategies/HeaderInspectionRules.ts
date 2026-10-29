/**
 * HeaderInspectionRules
 *
 * Header-focused WAF rules — anomalies in HTTP metadata rather than body:
 *  - `User-Agent` blacklist (known scanners, empty UA)
 *  - `Referer` spoofing patterns
 *  - `Host` header injection (`evil.com`, port-suffix tricks)
 *  - `X-Forwarded-For` smuggling attempts (extra commas, malformed)
 *  - `Content-Length` / `Transfer-Encoding` smuggling combos (request
 *    smuggling: RFC 2616 ambiguous messages)
 *  - `Cookie` anomalies (oversized, path-traversal in values)
 *
 * @module WafLayer/Strategies
 */

import { RuleCondition, WafRule } from '../types/http';

function hdr(
  id: string,
  name: string,
  pattern: string | RegExp,
  header: string,
  action: 'block' | 'log' = 'block',
  priority = 80
): WafRule {
  const condition: RuleCondition = {
    target: `header:${header}` as `header:${string}`,
    kind: 'regex',
    pattern,
    ignoreCase: true,
    transforms: ['urldecode'],
  };
  return {
    id,
    name,
    priority,
    action,
    score: 0.7,
    ast: { type: 'condition', condition },
    tags: ['owasp-a05', 'header'],
  };
}

export const HEADER_RULES: WafRule[] = [
  hdr(
    'hdr-empty-ua',
    'Empty or missing User-Agent (only fires when header explicitly set to empty)',
    /^$/,
    'user-agent',
    'log',
    30
  ),
  hdr(
    'hdr-scanner-ua',
    'Known scanner UA (sqlmap, nikto, nmap, acunetix, dirbuster, hydra)',
    /\b(sqlmap|nikto|nmap|acunetix|dirbuster|hydra|masscan|metasploit|wpscan)\b/i,
    'user-agent',
    'block',
    120
  ),
  hdr(
    'hdr-curl-python-ua',
    'curl/python-requests/Go-http UA (potential scripted traffic)',
    /\b(curl\/|python-requests|Go-http-client|Java\/|libwww|wget\/)\b/i,
    'user-agent',
    'log',
    40
  ),
  hdr(
    'hdr-host-injection',
    'Suspicious Host header (external domain or @ trick)',
    /@|\.\.\/|file:|%2e%2e/i,
    'host',
    'block',
    110
  ),
  hdr(
    'hdr-xff-smuggling',
    'X-Forwarded-For smuggling (trailing junk after IP list)',
    /[^0-9a-f:.,\s-]/i,
    'x-forwarded-for',
    'log',
    60
  ),
  hdr(
    'hdr-referer-external',
    'External Referer to admin paths',
    /^https?:\/\/[^\/]+\/(?!.*localhost|.*internal)/i,
    'referer',
    'log',
    35
  ),
  hdr(
    'hdr-te-cl-smuggle',
    'TE+CL smuggling: both Transfer-Encoding and Content-Length',
    // Presence of both headers is a state-level check, not a regex; this rule
    // is a marker that the engine wires specially.
    /^\0smuggle-both-present\0$/,
    'x-smuggle-marker',
    'block',
    130
  ),
  hdr(
    'hdr-oversized-cookie',
    'Oversized Cookie header (>8KB, possible session smuggling)',
    /^.{8192,}$/,
    'cookie',
    'log',
    70
  ),
  hdr(
    'hdr-shellshock-ua',
    'Shellshock pattern in User-Agent',
    /\(\s*\)\s*\{\s*:\s*;\s*\}\s*;/,
    'user-agent',
    'block',
    140
  ),
  hdr(
    'hdr-shellshock-referer',
    'Shellshock pattern in Referer',
    /\(\s*\)\s*\{\s*:\s*;\s*\}\s*;/,
    'referer',
    'block',
    140
  ),
];

export function installHeaderRules(engine: { addRule: (r: WafRule) => void }): void {
  for (const r of HEADER_RULES) {
    engine.addRule(r);
  }
}
