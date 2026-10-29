/**
 * PathTraversalRules
 *
 * Detects attempts to escape the web root via:
 *  - `../` sequences (raw or URL-encoded `%2e%2e%2f`, double-encoded
 *    `%252e%252e%252f`, unicode `..%c0%af`)
 *  - Absolute paths to sensitive files (`/etc/passwd`, `c:\windows\system32`,
 *    `/proc/self/environ`)
 *  - `file://` and `php://` wrapper URIs
 *
 * The `normalize-path` transform runs first so the matcher sees the lexical
 * resolution; if it still contains `..`, the request tried to break out.
 *
 * @module WafLayer/Strategies
 */

import { RuleCondition, WafRule } from '../types/http';

function traversal(id: string, name: string, pattern: string | RegExp, target: 'path' | 'body' | 'query', priority = 110): WafRule {
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
    score: 0.95,
    ast: { type: 'condition', condition },
    tags: ['owasp-a01', 'path-traversal'],
  };
}

export const PATH_TRAVERSAL_RULES: WafRule[] = [
  traversal(
    'pt-dot-dot-slash',
    '../ path traversal',
    /(\.\.[\/\\]){2,}/,
    'path'
  ),
  traversal(
    'pt-encoded-dot',
    'URL-encoded ../',
    /%2e%2e(%2f|%5c|\/)|\.\.%2f|%2e%2e\//i,
    'path'
  ),
  traversal(
    'pt-double-encoded',
    'Traversal surviving double urldecode',
    /\.\.[\\/]/,
    'path'
  ),
  traversal(
    'pt-unicode-traversal',
    'Unicode traversal (..\\u00c0\\u00af)',
    /\.\.[%\\]c0[%\\]af|\.\.[%\\]c1[%\\]9c/i,
    'path'
  ),
  traversal(
    'pt-etc-passwd',
    '/etc/passwd access',
    /\/etc\/(passwd|shadow|group|hosts|issue|motd)/i,
    'path'
  ),
  traversal(
    'pt-proc-self',
    '/proc/self access',
    /\/proc\/self\/(environ|fd|cmdline|maps|status)/i,
    'path'
  ),
  traversal(
    'pt-windows-paths',
    'Windows system paths',
    /[a-z]:[\\\/](windows|winnt|boot\.ini|system32)/i,
    'path'
  ),
  traversal(
    'pt-file-uri',
    'file:// URI scheme',
    /\bfile:\/\//i,
    'path'
  ),
  traversal(
    'pt-php-wrappers',
    'php:// filter wrapper',
    /\bphp:\/\/(filter|input|data)/i,
    'body'
  ),
  traversal(
    'pt-null-byte',
    'Null byte injection',
    /%00|\x00/,
    'path'
  ),
  traversal(
    'pt-query-traversal',
    '../ in query params',
    /(\.\.[\/\\]){2,}|%2e%2e(%2f|\/)/i,
    'query',
    115
  ),
];

export function installPathTraversalRules(engine: { addRule: (r: WafRule) => void }): void {
  for (const r of PATH_TRAVERSAL_RULES) {
    engine.addRule(r);
  }
}
