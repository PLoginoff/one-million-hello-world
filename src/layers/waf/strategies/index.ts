export { WafDefaultStrategy } from './DefaultStrategy';
export { WafFastStrategy } from './FastStrategy';
export { WafReliableStrategy } from './ReliableStrategy';
export { WafCachedStrategy } from './CachedStrategy';
export { WafBatchStrategy } from './BatchStrategy';

// Real rule engine + matchers
export { WafRuleEngine } from './RuleEngine';
export { Waf } from './Waf';
export type { WafOptions } from './Waf';
export { IpAccessList } from './IpAccessList';
export type { AccessAction } from './IpAccessList';
export {
  applyTransform,
  safeUrlDecode,
  normalizePath,
  extractTarget,
  compileCondition,
  evidenceSnippet,
} from './Matchers';
export { SQLI_RULES, installSqlInjectionRules } from './SqlInjectionRules';
export { XSS_RULES, installXssRules } from './XssRules';
export { PATH_TRAVERSAL_RULES, installPathTraversalRules } from './PathTraversalRules';
export { RCE_RULES, installRceRules } from './RceRules';
export { HEADER_RULES, installHeaderRules } from './HeaderInspectionRules';
