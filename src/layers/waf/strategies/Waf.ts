/**
 * Waf — top-level facade
 *
 * Composes {@link IpAccessList} (cheap gate) with {@link WafRuleEngine}
 * (regex rule set). Pipeline:
 *
 *   1. IP access list — block/allow shortcuts.
 *   2. Smuggling guard: `Transfer-Encoding` + `Content-Length` together → block.
 *   3. Rule engine — first non-`log` match wins; `log` rules annotate.
 *
 * @module WafLayer/Strategies
 */

import { HttpRequest, WafRule, WafVerdict } from '../types/http';
import { IpAccessList } from './IpAccessList';
import { WafRuleEngine } from './RuleEngine';
import { installSqlInjectionRules } from './SqlInjectionRules';
import { installXssRules } from './XssRules';
import { installPathTraversalRules } from './PathTraversalRules';
import { installRceRules } from './RceRules';
import { installHeaderRules } from './HeaderInspectionRules';

export interface WafOptions {
  /** Install the built-in OWASP-ish rule packs. Default true. */
  withDefaultRules?: boolean;
  /** Optional preconfigured access list. */
  accessList?: IpAccessList;
}

export class Waf {
  readonly rules: WafRuleEngine;
  readonly acl: IpAccessList;

  constructor(options: WafOptions = {}) {
    this.rules = new WafRuleEngine();
    this.acl = options.accessList ?? new IpAccessList();
    if (options.withDefaultRules ?? true) {
      installSqlInjectionRules(this.rules);
      installXssRules(this.rules);
      installPathTraversalRules(this.rules);
      installRceRules(this.rules);
      installHeaderRules(this.rules);
    }
  }

  inspect(request: HttpRequest): WafVerdict {
    const acl = this.acl.check(request.clientIp);
    if (acl === 'block') {
      return {
        action: 'block',
        score: 1,
        matched: [{
          ruleId: 'acl-blacklist',
          ruleName: 'ACL blacklist',
          action: 'block',
          score: 1,
          location: 'clientIp',
          evidence: request.clientIp,
        }],
        reasons: ['client-ip-blacklisted'],
      };
    }
    if (acl === 'allow') {
      // Whitelisted clients bypass rules entirely — trusted network.
      return { action: 'allow', score: 0, matched: [], reasons: ['client-ip-whitelisted'] };
    }

    // Request-smuggling guard: presence of both headers is ambiguous per RFC.
    const hasTE = Object.keys(request.headers).some((k) => k.toLowerCase() === 'transfer-encoding');
    const hasCL = Object.keys(request.headers).some((k) => k.toLowerCase() === 'content-length');
    if (hasTE && hasCL) {
      return {
        action: 'block',
        score: 0.95,
        matched: [{
          ruleId: 'hdr-te-cl-smuggle',
          ruleName: 'TE+CL smuggling',
          action: 'block',
          score: 0.95,
          location: 'headers',
        }],
        reasons: ['ambiguous-framing'],
      };
    }

    return this.rules.inspect(request);
  }
}
