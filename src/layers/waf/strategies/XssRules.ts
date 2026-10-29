/**
 * XssRules
 *
 * Cross-site scripting rules targeting common injection vectors:
 *  - `<script>` tags and friends (img/iframe/object/embed/svg/onload)
 *  - Event-handler attributes (`onerror=`, `onclick=`, ...)
 *  - `javascript:` and `data:` URIs
 *  - `document.cookie` / `document.write` DOM sinks
 *  - HTML entity / unicode-escape obfuscation
 *
 * @module WafLayer/Strategies
 */

import { RuleCondition, WafRule } from '../types/http';

function xss(id: string, name: string, pattern: string | RegExp, target: 'body' | 'query' = 'body', priority = 100): WafRule {
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
    score: 0.85,
    ast: { type: 'condition', condition },
    tags: ['owasp-a03', 'xss'],
  };
}

export const XSS_RULES: WafRule[] = [
  xss('xss-script-tag', 'script tag', /<\s*script[\s>]/i),
  xss('xss-iframe', 'iframe injection', /<\s*iframe[\s>]/i),
  xss('xss-object-embed', 'object/embed tag', /<\s*(object|embed)[\s>]/i),
  xss('xss-svg-onload', 'svg onload', /<\s*svg[^>]*\bon(load|error|click)\s*=/i),
  xss('xss-img-onerror', 'img onerror', /<\s*img[^>]*\bonerror\s*=/i),
  xss(
    'xss-event-handler',
    'any on* attribute with quotes',
    /\bon(click|error|load|focus|blur|mouseover|mouseout|keydown|keyup|submit)\s*=\s*['"`]/i
  ),
  xss('xss-javascript-uri', 'javascript: URI', /\bjavascript\s*:/i),
  xss('xss-data-uri', 'data: URI in HTML context', /\bdata\s*:\s*(text\/html|image\/svg)/i),
  xss('xss-document-cookie', 'document.cookie read', /\bdocument\s*\.\s*cookie/i),
  xss('xss-document-write', 'document.write sink', /\bdocument\s*\.\s*write(ln)?\s*\(/i),
  xss('xss-eval', 'eval() with string literal', /\beval\s*\(\s*['"`]/i, 'body', 95),
  xss('xss-innerhtml', 'innerHTML assignment', /\.innerHTML\s*=/i, 'body', 85),
  xss('xss-fromCharCode', 'String.fromCharCode obfuscation', /\bString\s*\.\s*fromCharCode/i),
  xss('xss-atob', 'atob() base64 decode', /\batob\s*\(/i, 'body', 80),
  xss(
    'xss-entity-encoded',
    'HTML-entity-encoded <script>',
    /(&#x?3c|&lt;|\x3c)\s*(script|img|iframe|svg|body)/i
  ),
  xss(
    'xss-query-script',
    'script tag in query',
    /<\s*script[\s>]|\bon(error|load|click)\s*=/i,
    'query',
    110
  ),
];

export function installXssRules(engine: { addRule: (r: WafRule) => void }): void {
  for (const r of XSS_RULES) {
    engine.addRule(r);
  }
}
