/**
 * Process Instance Persistence Engine (stub)
 *
 * Snapshots running process instances so they can survive an engine
 * restart — the interface a real implementation would back with a
 * database. Stores a serializable form: tokens, variables, trace,
 * instance state.
 *
 * Restore returns a *hydrated* ProcessInstance that the engine can
 * resume; timers resume at their absolute `resumeAt`, not a shifted
 * schedule, so a restore doesn't extend waits.
 *
 * @module BpmnLayer/Engines
 */

import {
  InstanceState,
  ProcessInstance,
  Token,
  TokenState,
} from './types';

/** Serializable snapshot of one instance. */
export interface InstanceSnapshot {
  id: string;
  definitionId: string;
  state: InstanceState;
  variables: Record<string, unknown>;
  tokens: Array<{
    id: string;
    nodeId: string;
    scopeId: string | null;
    parentTokenId: string | null;
    state: TokenState;
    resumeAt: number | null;
  }>;
  trace: string[];
  startedAt: number;
  completedAt: number | null;
  errorCode: string | null;
  savedAt: number;
}

export class ProcessPersistenceEngine {
  private readonly _snapshots: Map<string, InstanceSnapshot>;

  constructor() {
    this._snapshots = new Map();
  }

  /** Persist an instance (upsert by id). Returns the snapshot written. */
  save(instance: ProcessInstance, savedAt: number): InstanceSnapshot {
    const snap: InstanceSnapshot = {
      id: instance.id,
      definitionId: instance.definitionId,
      state: instance.state,
      variables: Object.fromEntries(instance.variables),
      tokens: instance.tokens.map((t) => ({ ...t })),
      trace: [...instance.trace],
      startedAt: instance.startedAt,
      completedAt: instance.completedAt,
      errorCode: instance.errorCode,
      savedAt,
    };
    this._snapshots.set(instance.id, snap);
    return snap;
  }

  /** Load a snapshot without mutating the store. */
  load(instanceId: string): InstanceSnapshot | null {
    const s = this._snapshots.get(instanceId);
    return s ? { ...s, tokens: s.tokens.map((t) => ({ ...t })) } : null;
  }

  /** Hydrate a snapshot back into a live ProcessInstance. */
  hydrate(instanceId: string): ProcessInstance | null {
    const s = this._snapshots.get(instanceId);
    if (!s) return null;
    const tokens: Token[] = s.tokens.map((t) => ({ ...t }));
    return {
      id: s.id,
      definitionId: s.definitionId,
      state: s.state,
      variables: new Map(Object.entries(s.variables)),
      tokens,
      trace: [...s.trace],
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      errorCode: s.errorCode,
    };
  }

  delete(instanceId: string): boolean {
    return this._snapshots.delete(instanceId);
  }

  /** All snapshots in a given instance state. */
  findByState(state: InstanceState): InstanceSnapshot[] {
    return [...this._snapshots.values()].filter((s) => s.state === state);
  }

  count(): number {
    return this._snapshots.size;
  }
}
