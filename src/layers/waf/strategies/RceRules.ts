/**
 * RceRules — Remote Code Execution patterns
 *
 * Shell metachars, command substitution, deserialization gadgets, and
 * known exploit strings (log4shell, shellshock, Struts2 OGNL).
 *
 * @module WafLayer/Strategies
 */

import { RuleCondition, WafRule } from '../types/http';

function rce(
  id: string,
  name: string,
  pattern: string | RegExp,
  target: 'body' | 'query' | 'path' | `header:${string}` = 'body',
  priority = 120
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
    score: 0.95,
    ast: { type: 'condition', condition },
    tags: ['owasp-a03', 'rce'],
  };
}

export const RCE_RULES: WafRule[] = [
  rce(
    'rce-shell-metachar',
    'Shell metachar chain (; | ` $( > < &)',
    /[;&|`]\s*(ls|cat|id|whoami|uname|wget|curl|nc|bash|sh|python|perl|ruby|php)\b/i
  ),
  rce(
    'rce-command-subst',
    'Command substitution $(...) or `...`',
    /\$\([^)]{1,80}\)|`[^`]{1,80}`/
  ),
  rce(
    'rce-curl-wget-pipe',
    'curl|wget piped to shell',
    /\b(curl|wget)\b[^|;]{0,80}\|\s*(bash|sh|python|perl|php)\b/i
  ),
  rce(
    'rce-log4shell',
    'Log4Shell JNDI lookup',
    /\$\{jndi:(ldap|rmi|dns|corba|iiop|nds|nis):\/\//i
  ),
  rce(
    'rce-shellshock',
    'Shellshock () { :;};',
    /\(\s*\)\s*\{\s*:\s*;\s*\}\s*;/
  ),
  rce(
    'rce-struts-ognl',
    'Struts2 OGNL payload',
    /%7b.*ognl|%7b.*context|\.getClass\(\)|new\s+java\.lang\.ProcessBuilder/i
  ),
  rce(
    'rce-deserialize-java',
    'Java deserialization gadget',
    /\b(ac ed 00 05|java\.lang\.Runtime|javax\.script\.ScriptEngineManager)\b/i
  ),
  rce(
    'rce-template-injection',
    'Server-side template injection ({{...}} / ${...})',
    /\{\{\s*7\s*\*\s*7\s*\}\}|\$\{T\s*\(|#\{7\*7\}/i
  ),
  rce(
    'rce-php-tags',
    'PHP open tag in body',
    /<\?php\b|<\?=/,
    'body'
  ),
  rce(
    'rce-aspnet-viewstate',
    'ASP.NET ViewState MAC bypass attempt',
    /__VIEWSTATE.*FF[FE]?[0-9A-Fa-f]/i,
    'body',
    90
  ),
  rce(
    'rce-powershell-enc',
    'powershell -enc / -e / base64',
    /\bpowershell\b[^&|;]{0,80}(-enc|-e|-ec|-en|--encodedcommand)\s+[A-Za-z0-9+/=]{8,}/i
  ),
  rce(
    'rce-user-agent-shellshock',
    'Shellshock in User-Agent',
    /\(\s*\)\s*\{\s*:\s*;\s*\}\s*;/,
    'header:user-agent',
    130
  ),
];

export function installRceRules(engine: { addRule: (r: WafRule) => void }): void {
  for (const r of RCE_RULES) {
    engine.addRule(r);
  }
}
