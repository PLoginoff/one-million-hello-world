/**
 * WafRuleEngine
 *
 * Compiles the full {@link WafRule} list into an executable decision tree
 * and runs it per request. Semantics:
 *
 *  - Rules evaluated in priority order (high → low).
 *  - Each rule's `ast` is a boolean tree over atomic conditions:
 *    `and`/`or`/`not` compose conditions, `condition` evaluates a matcher.
 *  - The first matching rule's action wins — "first match" semantics like
 *    iptables, mod_security with `chain`, and AWS WAF's default ordering.
 *  - Rules with action `log` don't terminate the chain (they observe,
 *    the next rules still run).
 *  - If only `log` rules matched, the request is `allow`ed with the log
 *    annotations attached.
 *
 * Short-circuit evaluation: `and` returns false on first failing child,
 * `or` returns true on first succeeding child, `not` inverts.
 *
 * @module WafLayer/Strategies
 */

import {
  CompiledMatcher,
  HttpRequest,
  IWafEngine,
  MatchedRule,
  RuleAst,
  WafRule,
  WafVerdict,
} from '../types/http';
import { compileCondition as compile } from './Matchers';

interface CompiledRule {
  rule: WafRule;
  compiled: CompiledAstNode;
}

type CompiledAstNode =
  | { type: 'condition'; matcher: CompiledMatcher }
  | { type: 'and'; children: CompiledAstNode[] }
  | { type: 'or'; children: CompiledAstNode[] }
  | { type: 'not'; child: CompiledAstNode };

interface EvalOutcome {
  hit: boolean;
  location: string;
  evidence?: string;
}

export class WafRuleEngine implements IWafEngine {
  private readonly _rules: Map<string, CompiledRule>;
  private _ordered: CompiledRule[];
  private _evaluations: number;

  constructor(initial: WafRule[] = []) {
    this._rules = new Map();
    this._ordered = [];
    this._evaluations = 0;
    for (const r of initial) {
      this.addRule(r);
    }
  }

  addRule(rule: WafRule): void {
    const compiled: CompiledRule = { rule, compiled: compileAst(rule.ast) };
    this._rules.set(rule.id, compiled);
    this._ordered = Array.from(this._rules.values()).sort(
      (a, b) => b.rule.priority - a.rule.priority
    );
  }

  removeRule(ruleId: string): boolean {
    const ok = this._rules.delete(ruleId);
    if (ok) {
      this._ordered = this._ordered.filter((c) => c.rule.id !== ruleId);
    }
    return ok;
  }

  rules(): readonly WafRule[] {
    return this._ordered.map((c) => c.rule);
  }

  /** Number of compiled rules. */
  get size(): number {
    return this._rules.size;
  }

  /** Total inspect() calls so far. */
  get evaluations(): number {
    return this._evaluations;
  }

  /**
   * Inspect a request. Returns the first matching rule's verdict; if only
   * `log` rules matched, returns `allow` with their annotations attached.
   */
  inspect(request: HttpRequest): WafVerdict {
    this._evaluations += 1;
    const matched: MatchedRule[] = [];
    const reasons: string[] = [];
    let winningAction: WafVerdict['action'] = 'allow';
    let winningScore = 0;

    for (const { rule, compiled } of this._ordered) {
      if (rule.disabled) {
        continue;
      }
      const outcome = evalAst(compiled, request);
      if (!outcome.hit) {
        continue;
      }
      matched.push({
        ruleId: rule.id,
        ruleName: rule.name,
        action: rule.action,
        score: rule.score,
        location: outcome.location,
        evidence: outcome.evidence,
      });
      reasons.push(`${rule.name} [${rule.action}] @${outcome.location}`);

      if (rule.action !== 'log') {
        winningAction = rule.action;
        winningScore = Math.max(winningScore, rule.score);
        break; // first non-log match wins
      }
      // log rules accumulate but don't stop the chain.
      winningScore = Math.max(winningScore, rule.score);
    }

    return { action: winningAction, score: winningScore, matched, reasons };
  }
}

// ---------------------------------------------------------------------------

function compileAst(ast: RuleAst): CompiledAstNode {
  switch (ast.type) {
    case 'condition':
      return { type: 'condition', matcher: compile(ast.condition) };
    case 'and':
      return { type: 'and', children: ast.children.map(compileAst) };
    case 'or':
      return { type: 'or', children: ast.children.map(compileAst) };
    case 'not':
      return { type: 'not', child: compileAst(ast.child) };
  }
}

function evalAst(node: CompiledAstNode, request: HttpRequest): EvalOutcome {
  switch (node.type) {
    case 'condition': {
      const m = node.matcher.match(request);
      return { hit: m.hit, location: m.location, evidence: m.evidence };
    }
    case 'and': {
      for (const child of node.children) {
        const r = evalAst(child, request);
        if (!r.hit) {
          return { hit: false, location: r.location };
        }
      }
      return { hit: true, location: 'and', evidence: undefined };
    }
    case 'or': {
      let lastLocation = 'or';
      for (const child of node.children) {
        const r = evalAst(child, request);
        if (r.hit) {
          return { hit: true, location: r.location, evidence: r.evidence };
        }
        lastLocation = r.location;
      }
      return { hit: false, location: lastLocation };
    }
    case 'not': {
      const r = evalAst(node.child, request);
      return { hit: !r.hit, location: `not(${r.location})` };
    }
  }
}
