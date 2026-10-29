/**
 * WAF Types
 *
 * Shared HTTP request model, rule AST, and verdict type for the Web
 * Application Firewall layer.
 *
 * @module WafLayer/Types
 */

/** A normalized inbound HTTP request the WAF inspects. */
export interface HttpRequest {
  readonly method: string;
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly headers: Readonly<Record<string, string>>;
  /** Decoded request body (already parsed by upstream middleware). */
  readonly body?: string;
  readonly clientIp: string;
}

/** WAF action on a rule match. */
export type WafAction = 'allow' | 'log' | 'block' | 'redirect' | 'captcha';

/** The outcome of evaluating the full rule set. */
export interface WafVerdict {
  readonly action: WafAction;
  /** 0..1 risk score (highest of all matched rules). */
  readonly score: number;
  /** Rules that fired, in priority order. */
  readonly matched: MatchedRule[];
  /** Human-readable summary. */
  readonly reasons: string[];
}

export interface MatchedRule {
  readonly ruleId: string;
  readonly ruleName: string;
  readonly action: WafAction;
  readonly score: number;
  /** Where the match was found (e.g. `body`, `path`, `header:user-agent`). */
  readonly location: string;
  /** The matched text fragment (truncated for logs). */
  readonly evidence?: string;
}

/** The atomic match targets a rule can inspect. */
export type MatchTarget =
  | 'path'
  | 'query'
  | 'body'
  | 'method'
  | 'clientIp'
  | `header:${string}`;

/** Atomic condition — what a single rule inspects. */
export interface RuleCondition {
  readonly target: MatchTarget;
  /** Match kind. */
  readonly kind: 'regex' | 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'ip-in-list';
  /** Pattern/list payload. `regex` accepts string or RegExp; list kinds accept string[]. */
  readonly pattern: string | RegExp | readonly string[];
  /** Case-insensitive match. Default false. */
  readonly ignoreCase?: boolean;
  /** Optional transform applied before matching (e.g. lowercase, urldecode). */
  readonly transforms?: Array<'lowercase' | 'uppercase' | 'urldecode' | 'normalize-path' | 'strip-whitespace'>;
}

/** A compiled atomic matcher. */
export interface CompiledMatcher {
  match(request: HttpRequest): { hit: boolean; location: string; evidence?: string };
}

/** Rule AST node — leaves are conditions, branches are boolean combinators. */
export type RuleAst =
  | { type: 'condition'; condition: RuleCondition }
  | { type: 'and'; children: RuleAst[] }
  | { type: 'or'; children: RuleAst[] }
  | { type: 'not'; child: RuleAst };

/** A declarative rule. */
export interface WafRule {
  readonly id: string;
  readonly name: string;
  /** Higher priority runs first and wins ties. */
  readonly priority: number;
  readonly action: WafAction;
  /** 0..1 risk score contribution when matched. */
  readonly score: number;
  readonly ast: RuleAst;
  /** Optional list of tags (e.g. 'owasp-a03', 'sqli'). */
  readonly tags?: string[];
  /** If true the rule is disabled. */
  readonly disabled?: boolean;
}

/** Public WAF engine contract. */
export interface IWafEngine {
  inspect(request: HttpRequest): WafVerdict;
  addRule(rule: WafRule): void;
  removeRule(ruleId: string): boolean;
  rules(): readonly WafRule[];
}
