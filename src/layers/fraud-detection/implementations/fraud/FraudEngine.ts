/**
 * FraudEngine
 *
 * Aggregates rule signals into a weighted risk score, applies
 * blocklist/allowlist overrides, and returns approve/review/decline
 * decisions.
 */

import {
  IFraudRule,
  FraudRuleContext,
  RiskAssessment,
  RiskDecision,
  RiskSignal,
  Transaction,
  UserProfile,
} from './Types';

export interface DecisionThresholds {
  /** score >= reviewAt -> 'review'; >= declineAt -> 'decline' */
  readonly reviewAt: number;
  readonly declineAt: number;
}

export const DEFAULT_THRESHOLDS: DecisionThresholds = {
  reviewAt: 40,
  declineAt: 70,
};

export type ListMode = 'blocklist' | 'allowlist';

export interface EntityLists {
  readonly blockedUsers?: ReadonlySet<string>;
  readonly blockedDevices?: ReadonlySet<string>;
  readonly blockedIps?: ReadonlySet<string>;
  readonly blockedMerchants?: ReadonlySet<string>;
  readonly allowedUsers?: ReadonlySet<string>;
  readonly allowedDevices?: ReadonlySet<string>;
}

export interface FraudEngineOptions {
  readonly thresholds?: Partial<DecisionThresholds>;
  readonly lists?: EntityLists;
  /** cap for aggregate score */
  readonly maxScore?: number;
}

export class FraudEngine {
  private readonly rules: IFraudRule[] = [];
  private readonly thresholds: DecisionThresholds;
  private readonly lists: EntityLists;
  private readonly maxScore: number;

  constructor(rules: readonly IFraudRule[] = [], options: FraudEngineOptions = {}) {
    this.rules = [...rules];
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds };
    this.lists = options.lists ?? {};
    this.maxScore = options.maxScore ?? 100;
  }

  addRule(rule: IFraudRule): this {
    this.rules.push(rule);
    return this;
  }

  /** Blocklist hit = automatic decline. */
  private checkBlocklist(tx: Transaction): string | null {
    if (this.lists.blockedUsers?.has(tx.userId)) return `blocked user ${tx.userId}`;
    if (tx.deviceId !== undefined && this.lists.blockedDevices?.has(tx.deviceId)) {
      return `blocked device ${tx.deviceId}`;
    }
    if (tx.ipAddress !== undefined && this.lists.blockedIps?.has(tx.ipAddress)) {
      return `blocked ip ${tx.ipAddress}`;
    }
    if (tx.merchantId !== undefined && this.lists.blockedMerchants?.has(tx.merchantId)) {
      return `blocked merchant ${tx.merchantId}`;
    }
    return null;
  }

  /** Allowlist hit = automatic approve (skip rules). */
  private checkAllowlist(tx: Transaction): string | null {
    if (this.lists.allowedUsers?.has(tx.userId)) return `allowed user ${tx.userId}`;
    if (tx.deviceId !== undefined && this.lists.allowedDevices?.has(tx.deviceId)) {
      return `allowed device ${tx.deviceId}`;
    }
    return null;
  }

  assess(transaction: Transaction, profile?: UserProfile): RiskAssessment {
    const blocked = this.checkBlocklist(transaction);
    if (blocked !== null) {
      return {
        transactionId: transaction.id,
        score: this.maxScore,
        decision: 'decline',
        signals: [],
        explanations: [`blocklist: ${blocked}`],
      };
    }
    const allowed = this.checkAllowlist(transaction);
    if (allowed !== null) {
      return {
        transactionId: transaction.id,
        score: 0,
        decision: 'approve',
        signals: [],
        explanations: [`allowlist: ${allowed}`],
      };
    }

    const context: FraudRuleContext = { transaction, profile };
    const signals: RiskSignal[] = this.rules.map((r) => r.evaluate(context));
    // weighted sum normalized to maxScore; non-triggered signals contribute
    // their (usually small) partial score too.
    let totalWeight = 0;
    let weighted = 0;
    for (const s of signals) {
      weighted += s.score * s.weight;
      totalWeight += s.weight;
    }
    const score =
      totalWeight > 0 ? Math.min(this.maxScore, (weighted / totalWeight) * 4) : 0;
    const decision = this.decide(score);
    return {
      transactionId: transaction.id,
      score,
      decision,
      signals,
      explanations: signals
        .filter((s) => s.triggered)
        .map((s) => `${s.name}: ${s.explanation}`),
    };
  }

  private decide(score: number): RiskDecision {
    if (score >= this.thresholds.declineAt) return 'decline';
    if (score >= this.thresholds.reviewAt) return 'review';
    return 'approve';
  }

  assessBatch(
    transactions: readonly Transaction[],
    profiles?: ReadonlyMap<string, UserProfile>
  ): RiskAssessment[] {
    return transactions.map((t) => this.assess(t, profiles?.get(t.userId)));
  }
}

/**
 * Sliding-window transaction tracker: builds UserProfile incrementally
 * as transactions stream through. Keeps a bounded per-user history.
 */
export class TransactionHistory {
  private readonly byUser: Map<string, Transaction[]> = new Map();
  private readonly maxHistory: number;

  constructor(maxHistory = 500) {
    this.maxHistory = maxHistory;
  }

  record(tx: Transaction): void {
    let list = this.byUser.get(tx.userId);
    if (list === undefined) {
      list = [];
      this.byUser.set(tx.userId, list);
    }
    list.push(tx);
    if (list.length > this.maxHistory) {
      list.splice(0, list.length - this.maxHistory);
    }
  }

  profileFor(userId: string): UserProfile | undefined {
    const list = this.byUser.get(userId);
    if (list === undefined || list.length === 0) return undefined;
    const devices = new Set<string>();
    for (const t of list) {
      if (t.deviceId !== undefined) devices.add(t.deviceId);
    }
    const amounts = list.map((t) => t.amount);
    const typicalAmount = amounts.reduce((s, v) => s + v, 0) / amounts.length;
    // home = most recent location (simple heuristic)
    const lastWithLoc = [...list].reverse().find((t) => t.location !== undefined);
    return {
      userId,
      priorTransactions: [...list],
      typicalAmount,
      homeLocation: lastWithLoc?.location,
      knownDevices: devices,
    };
  }

  /** Assess a transaction against rolling history, then record it. */
  assessAndRecord(
    engine: FraudEngine,
    tx: Transaction
  ): ReturnType<FraudEngine['assess']> {
    const profile = this.profileFor(tx.userId);
    const result = engine.assess(tx, profile);
    this.record(tx);
    return result;
  }
}
