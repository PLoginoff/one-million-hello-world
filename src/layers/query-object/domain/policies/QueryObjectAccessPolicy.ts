/**
 * QueryObjectAccessPolicy
 */

export type AccessDecision = 'allow' | 'deny' | 'challenge';

export interface AccessContext {
  userId: string;
  resource: string;
  action: string;
  roles: string[];
  attributes: Record<string, unknown>;
}

export interface AccessRule {
  name: string;
  evaluate: (ctx: AccessContext) => AccessDecision;
  priority: number;
}

export class QueryObjectAccessPolicy {
  private _rules: AccessRule[];
  private _defaultDecision: AccessDecision;

  constructor(defaultDecision: AccessDecision = 'deny') {
    this._rules = [];
    this._defaultDecision = defaultDecision;
  }

  addRule(name: string, evaluate: (ctx: AccessContext) => AccessDecision, priority: number = 0): this {
    this._rules.push({ name, evaluate, priority });
    this._rules.sort((a, b) => b.priority - a.priority);
    return this;
  }

  allowIfRole(role: string, priority: number = 10): this {
    return this.addRule('role-' + role, (ctx) => (ctx.roles.includes(role) ? 'allow' : 'deny'), priority);
  }

  denyIfRole(role: string, priority: number = 20): this {
    return this.addRule('deny-' + role, (ctx) => (ctx.roles.includes(role) ? 'deny' : 'allow'), priority);
  }

  evaluate(ctx: AccessContext): AccessDecision {
    for (const rule of this._rules) {
      const decision = rule.evaluate(ctx);
      if (decision !== 'deny' || rule.priority >= 100) {
        return decision;
      }
    }
    return this._defaultDecision;
  }

  isAllowed(ctx: AccessContext): boolean {
    return this.evaluate(ctx) === 'allow';
  }
  isDenied(ctx: AccessContext): boolean {
    return this.evaluate(ctx) === 'deny';
  }

  getRules(): string[] {
    return this._rules.map((r) => r.name);
  }
  clearRules(): void {
    this._rules = [];
  }
}
