/**
 * Fraud-Detection Engine — shared types.
 *
 * Vocabulary:
 * - `VelocityTracker`     — exact sliding-window counters for
 *                            transactions per card/user/device at
 *                            1min/1h/1d scales.
 * - `FraudGraph`          — entity-linkage graph with fraud-ring
 *                            traversal depth scoring.
 * - `CaseManager`         — investigation queue with open →
 *                            investigating → closed lifecycle.
 * - `ModelRegistry`       — A/B model versions with shadow scoring.
 *
 * @module FraudDetectionLayer/Engine
 */

import { Transaction } from '../implementations/fraud/Types';

/* ------------------------------------------------------------------ */
/* Clock                                                               */
/* ------------------------------------------------------------------ */

export interface FraudClock {
  now(): number;
}

export class SystemFraudClock implements FraudClock {
  now(): number {
    return Date.now();
  }
}

export class ManualFraudClock implements FraudClock {
  private _t = 0;
  now(): number {
    return this._t;
  }
  advance(ms: number): void {
    this._t += ms;
  }
  set(ms: number): void {
    this._t = ms;
  }
}

/* ------------------------------------------------------------------ */
/* Velocity                                                            */
/* ------------------------------------------------------------------ */

/** Entity kinds velocity is tracked over. */
export type VelocityDimension = 'card' | 'user' | 'device' | 'ip';

/** Named rolling windows. */
export type VelocityWindow = '1m' | '1h' | '1d';

export interface VelocityFeatures {
  readonly dimension: VelocityDimension;
  readonly key: string;
  readonly count1m: number;
  readonly count1h: number;
  readonly count1d: number;
  readonly sum1m: number;
  readonly sum1h: number;
  readonly sum1d: number;
  /** distinct counterparties (merchants/users) in the 1d window */
  readonly distinct1d: number;
  /** ms since the previous transaction on this key; -1 if none */
  readonly interArrivalMs: number;
}

/* ------------------------------------------------------------------ */
/* Graph                                                               */
/* ------------------------------------------------------------------ */

/** Node kinds in the entity-linkage graph. */
export type GraphNodeKind = 'user' | 'card' | 'device' | 'ip' | 'address';

export interface GraphNode {
  readonly kind: GraphNodeKind;
  readonly id: string;
}

export interface FraudRingResult {
  /** member user ids of the connected component. */
  readonly userIds: readonly string[];
  /** total nodes in the component (users + shared attrs). */
  readonly componentSize: number;
  /** attributes shared by ≥2 users in the component. */
  readonly sharedAttributes: readonly GraphNode[];
  /** 0..1 — scales with ring size and attribute overlap. */
  readonly riskScore: number;
  /** longest shortest-path between two users in the ring. */
  readonly maxDepth: number;
}

/* ------------------------------------------------------------------ */
/* Case management                                                     */
/* ------------------------------------------------------------------ */

export type CaseState = 'open' | 'investigating' | 'closed';
export type CaseResolution = 'fraud' | 'legitimate' | 'inconclusive';

export interface FraudCase {
  readonly id: string;
  readonly transactionId: string;
  readonly userId: string;
  readonly state: CaseState;
  readonly openedAt: number;
  readonly assignee?: string;
  readonly notes: readonly CaseNote[];
  readonly resolution?: CaseResolution;
  readonly closedAt?: number;
}

export interface CaseNote {
  readonly author: string;
  readonly text: string;
  readonly at: number;
}

/* ------------------------------------------------------------------ */
/* Model versioning                                                    */
/* ------------------------------------------------------------------ */

/** Scoring contract a model version implements. */
export interface ScoringModel {
  readonly modelId: string;
  score(tx: Transaction): number;
}

export interface ShadowComparison {
  readonly transactionId: string;
  readonly primaryScore: number;
  readonly shadowScore: number;
  /** |primary − shadow| — disagreement magnitude. */
  readonly divergence: number;
  readonly primaryDecision: 'flag' | 'pass';
  readonly shadowDecision: 'flag' | 'pass';
  /** decisions disagreed */
  readonly disagree: boolean;
}

export interface ShadowStats {
  readonly comparisons: number;
  readonly disagreements: number;
  /** disagreement rate 0..1 */
  readonly disagreementRate: number;
  /** mean absolute score divergence */
  readonly meanDivergence: number;
}
