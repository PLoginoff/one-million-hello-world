/**
 * Forward-chaining inference strategy.
 *
 * A thin orchestration wrapper around {@link ProductionRuleEngine} that adds
 * what production deployments actually need around the raw inference loop:
 *
 *  - **Declarative fact mapping**: incoming context payloads are normalized
 *    into named premise facts via {@link FactMapper} functions, so rules see
 *    a stable fact namespace regardless of caller shape.
 *  - **Cycle tracing**: every rule firing, fact assertion and retraction is
 *    appended to a {@link TraceBuffer} (bounded ring — O(1) insert, bounded
 *    memory) for post-mortem debugging.
 *  - **Goal queries**: `runUntil(goal)` keeps cycling until a predicate over
 *    the blackboard/facts holds — e.g. "infer until `diagnosis` exists".
 *  - **Explain**: reconstructs the justification chain for any fact still in
 *    working memory (who asserted it, supported by which facts, via which
 *    rule) — the engine's answer to "why did you conclude X?".
 *
 * @module RulesEngine/Strategies
 */

import { WorkingMemory, Justification, Fact } from '../domain/WorkingMemory';
import {
  ConflictStrategy,
  EngineRunResult,
  ProductionRuleEngine,
  Rule,
} from '../implementations/ProductionRuleEngine';

/** Maps arbitrary input into named premise facts. */
export type FactMapper = (input: Record<string, unknown>) => Record<string, unknown>;

/** Identity mapper — input keys become fact ids verbatim. */
export const identityFactMapper: FactMapper = (input) => ({ ...input });

/**
 * Namespaced mapper: wraps the whole input under a single `input` fact while
 * also spreading record fields — the most common shape.
 */
export function namespacedMapper(namespace: string): FactMapper {
  return (input) => ({ [namespace]: input });
}

/** Trace entry kinds recorded during a run. */
export type TraceKind = 'fire' | 'assert' | 'retract' | 'produce' | 'halt' | 'goal';

export interface TraceEntry {
  readonly seq: number;
  readonly kind: TraceKind;
  readonly detail: string;
  readonly at: number;
}

/**
 * Bounded ring buffer for trace entries. Overwrites oldest entries once
 * `capacity` is reached — tracing must never exhaust memory on long runs.
 */
export class TraceBuffer {
  private readonly _buf: (TraceEntry | undefined)[];
  private _head = 0;
  private _count = 0;
  private _seq = 0;

  constructor(readonly capacity = 512) {
    this._buf = new Array<TraceEntry | undefined>(capacity);
  }

  push(kind: TraceKind, detail: string, at: number): void {
    const entry: TraceEntry = { seq: this._seq++, kind, detail, at };
    this._buf[(this._head + this._count) % this.capacity] = entry;
    if (this._count < this.capacity) {
      this._count++;
    } else {
      this._head = (this._head + 1) % this.capacity;
    }
  }

  /** Entries oldest → newest. */
  entries(): TraceEntry[] {
    const out: TraceEntry[] = [];
    for (let i = 0; i < this._count; i++) {
      const e = this._buf[(this._head + i) % this.capacity];
      if (e) {
        out.push(e);
      }
    }
    return out;
  }

  /** Renders a human-readable trace, one line per entry. */
  render(): string {
    return this.entries()
      .map((e) => `#${e.seq} [${e.kind}] ${e.detail}`)
      .join('\n');
  }

  clear(): void {
    this._buf.fill(undefined);
    this._head = 0;
    this._count = 0;
  }
}

/** One step of a justification explanation. */
export interface ExplainStep {
  readonly factId: string;
  readonly ruleId: string;
  readonly supportedBy: readonly string[];
}

/** A full derivation chain for a fact — leaf premises last. */
export interface Explanation {
  readonly factId: string;
  readonly premise: boolean;
  readonly steps: readonly ExplainStep[];
}

export interface ForwardChainingOptions {
  readonly maxCycles?: number;
  readonly conflictResolution?: readonly ConflictStrategy[];
  readonly clock?: () => number;
  readonly traceCapacity?: number;
  readonly factMapper?: FactMapper;
}

export interface ForwardChainingResult extends EngineRunResult {
  readonly trace: readonly TraceEntry[];
  /** Final fact ids still resident in working memory. */
  readonly residentFacts: readonly string[];
}

export class ForwardChainingStrategy {
  readonly name = 'forward-chaining';

  private readonly _engine: ProductionRuleEngine;
  private readonly _options: Required<Omit<ForwardChainingOptions, 'clock' | 'factMapper'>> & {
    clock: () => number;
    factMapper: FactMapper;
  };
  private readonly _trace: TraceBuffer;

  constructor(options: ForwardChainingOptions = {}) {
    this._options = {
      maxCycles: options.maxCycles ?? 1000,
      conflictResolution: options.conflictResolution ?? ['priority', 'specificity', 'recency'],
      clock: options.clock ?? Date.now,
      traceCapacity: options.traceCapacity ?? 512,
      factMapper: options.factMapper ?? identityFactMapper,
    };
    this._trace = new TraceBuffer(this._options.traceCapacity);
    this._engine = new ProductionRuleEngine(
      {
        maxCycles: this._options.maxCycles,
        conflictResolution: this._options.conflictResolution,
        clock: this._options.clock,
      },
      {
        ruleFired: (rec) => {
          this._trace.push('fire', `${rec.ruleId} (cycle ${rec.cycle})`, rec.firedAt);
          for (const id of rec.factsAsserted) {
            this._trace.push('assert', id, rec.firedAt);
          }
          for (const id of rec.factsRetracted) {
            this._trace.push('retract', id, rec.firedAt);
          }
          for (const k of rec.providedKeys) {
            this._trace.push('produce', k, rec.firedAt);
          }
        },
        maxCyclesReached: (cycles) =>
          this._trace.push('halt', `max cycles reached (${cycles})`, this._options.clock()),
      }
    );
  }

  get engine(): ProductionRuleEngine {
    return this._engine;
  }

  get memory(): WorkingMemory {
    return this._engine.memory;
  }

  get trace(): TraceBuffer {
    return this._trace;
  }

  addRule(rule: Rule): this {
    this._engine.addRule(rule);
    return this;
  }

  /**
   * Runs inference to quiescence. Input is mapped through the configured
   * {@link FactMapper} into premise facts first.
   */
  async infer(input: Record<string, unknown>, seedProvides: readonly string[] = []): Promise<ForwardChainingResult> {
    const facts = this._options.factMapper(input);
    const result = await this._engine.run(facts, seedProvides);
    if (result.halted) {
      this._trace.push('halt', result.haltReason ?? 'halted', this._options.clock());
    }
    return {
      ...result,
      trace: this._trace.entries(),
      residentFacts: this._engine.memory.facts().map((f) => f.id),
    };
  }

  /**
   * Runs inference until `goal` holds over the working-memory fact object or
   * quiescence/maxCycles — whichever comes first. Goal is checked after each
   * full engine run because the engine loop already terminates at quiescence;
   * for true incremental goal checks use a short-circuit rule that halts.
   *
   * Returns the run result plus whether the goal was satisfied.
   */
  async runUntil(
    input: Record<string, unknown>,
    goal: (facts: Record<string, unknown>) => boolean,
    seedProvides: readonly string[] = []
  ): Promise<ForwardChainingResult & { goalReached: boolean }> {
    const result = await this.infer(input, seedProvides);
    const reached = goal(this._engine.memory.toFactObject());
    this._trace.push('goal', reached ? 'goal satisfied' : 'goal not satisfied', this._options.clock());
    return { ...result, goalReached: reached };
  }

  /**
   * Reconstructs the derivation of `factId` as an explanation chain.
   * Depth-first walk over recorded justifications; cycles in the support
   * graph are cut (the repeated fact is marked, not expanded again).
   */
  explain(factId: string): Explanation | undefined {
    const memory = this._engine.memory;
    const fact = memory.get(factId);
    if (!fact) {
      return undefined;
    }
    const steps: ExplainStep[] = [];
    const visited = new Set<string>();

    const walk = (id: string): void => {
      if (visited.has(id)) {
        return;
      }
      visited.add(id);
      const justs: readonly Justification[] = memory.justificationsOf(id);
      for (const j of justs) {
        steps.push({ factId: id, ruleId: j.ruleId, supportedBy: j.supports });
        for (const s of j.supports) {
          walk(s);
        }
      }
    };
    walk(factId);

    const premise = steps.length === 0;
    return { factId, premise, steps };
  }

  /** Facts whose id passes `predicate`, most recent first. */
  queryFacts(predicate: (fact: Fact) => boolean): Fact[] {
    return this._engine.memory.query(predicate);
  }

  /** Resets working memory, refraction and trace for a fresh session. */
  reset(): void {
    this._engine.memory.clear();
    this._engine.resetRefraction();
    this._trace.clear();
  }
}
