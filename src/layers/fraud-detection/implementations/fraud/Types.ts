/**
 * Types
 *
 * Transaction model, risk signals, and the rule-engine contract for the
 * fraud detection subsystem.
 */

export interface GeoLocation {
  readonly latitude: number;
  readonly longitude: number;
  readonly country?: string;
}

export interface Transaction {
  readonly id: string;
  readonly userId: string;
  readonly amount: number;
  readonly currency: string;
  /** epoch millis */
  readonly timestamp: number;
  readonly merchantId?: string;
  readonly merchantCategory?: string;
  readonly location?: GeoLocation;
  readonly deviceId?: string;
  readonly ipAddress?: string;
  readonly channel?: 'card-present' | 'online' | 'atm' | 'transfer';
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface RiskSignal {
  /** machine-readable signal name, e.g. 'velocity' */
  readonly name: string;
  /** raw score contribution before weighting */
  readonly score: number;
  /** normalized [0,1] severity */
  readonly severity: number;
  readonly weight: number;
  readonly explanation: string;
  readonly triggered: boolean;
}

export type RiskDecision = 'approve' | 'review' | 'decline';

export interface RiskAssessment {
  readonly transactionId: string;
  /** aggregated score, 0..100 */
  readonly score: number;
  readonly decision: RiskDecision;
  readonly signals: readonly RiskSignal[];
  readonly explanations: readonly string[];
}

/** Historical context available to rules. */
export interface UserProfile {
  readonly userId: string;
  readonly priorTransactions: readonly Transaction[];
  readonly typicalAmount?: number;
  readonly homeLocation?: GeoLocation;
  readonly knownDevices?: ReadonlySet<string>;
}

export interface FraudRuleContext {
  readonly transaction: Transaction;
  readonly profile?: UserProfile;
}

/** A composable fraud rule. */
export interface IFraudRule {
  readonly name: string;
  /** weight applied in the aggregate score */
  readonly weight: number;
  evaluate(context: FraudRuleContext): RiskSignal;
}

/** Compose rules with AND/OR logic. */
export abstract class CompositeRule implements IFraudRule {
  abstract readonly name: string;
  abstract readonly weight: number;
  protected readonly rules: readonly IFraudRule[];
  constructor(rules: readonly IFraudRule[]) {
    this.rules = rules;
  }
  abstract evaluate(context: FraudRuleContext): RiskSignal;
}

export class AndRule extends CompositeRule {
  readonly name = 'and';
  readonly weight: number;

  constructor(rules: readonly IFraudRule[], weight = 1) {
    super(rules);
    this.weight = weight;
  }

  evaluate(context: FraudRuleContext): RiskSignal {
    const signals = this.rules.map((r) => r.evaluate(context));
    const allTriggered = signals.every((s) => s.triggered);
    const score = allTriggered
      ? signals.reduce((sum, s) => sum + s.score, 0) / Math.max(1, signals.length)
      : 0;
    return {
      name: this.name,
      score,
      severity: allTriggered ? Math.max(...signals.map((s) => s.severity), 0) : 0,
      weight: this.weight,
      triggered: allTriggered,
      explanation: allTriggered
        ? `all ${signals.length} sub-rules triggered: ${signals.map((s) => s.name).join(', ')}`
        : 'not all sub-rules triggered',
    };
  }
}

export class OrRule extends CompositeRule {
  readonly name = 'or';
  readonly weight: number;

  constructor(rules: readonly IFraudRule[], weight = 1) {
    super(rules);
    this.weight = weight;
  }

  evaluate(context: FraudRuleContext): RiskSignal {
    const signals = this.rules.map((r) => r.evaluate(context));
    const triggered = signals.filter((s) => s.triggered);
    const any = triggered.length > 0;
    const score = any ? Math.max(...triggered.map((s) => s.score), 0) : 0;
    return {
      name: this.name,
      score,
      severity: any ? Math.max(...triggered.map((s) => s.severity), 0) : 0,
      weight: this.weight,
      triggered: any,
      explanation: any
        ? `${triggered.length} sub-rule(s) triggered: ${triggered.map((s) => s.name).join(', ')}`
        : 'no sub-rules triggered',
    };
  }
}

/** Invert a rule (triggered -> not triggered). */
export class NotRule implements IFraudRule {
  readonly name = 'not';
  readonly weight: number;
  private readonly inner: IFraudRule;

  constructor(inner: IFraudRule, weight = 1) {
    this.inner = inner;
    this.weight = weight;
  }

  evaluate(context: FraudRuleContext): RiskSignal {
    const s = this.inner.evaluate(context);
    return {
      name: `not(${s.name})`,
      score: s.triggered ? 0 : s.score,
      severity: s.triggered ? 0 : s.severity,
      weight: this.weight,
      triggered: !s.triggered,
      explanation: `inverted ${s.name}`,
    };
  }
}
