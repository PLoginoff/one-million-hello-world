/**
 * Production rule engine.
 *
 * Implements the classic match → conflict-resolve → act cycle (OPS5/CLIPS
 * lineage) over an explicit agenda:
 *
 *  1. **Match.** Every enabled rule whose condition evaluates true against
 *     the current fact object produces an *activation* — a (rule, bindings)
 *     pair pushed onto the agenda.
 *  2. **Conflict resolution.** The agenda picks one activation per cycle
 *     using a composable strategy chain (priority → specificity → recency).
 *  3. **Act.** The rule's action runs. Actions may assert/retract facts
 *     (feeding forward-chaining), set output values (feeding rule-chaining),
 *     or emit arbitrary events.
 *  4. Repeat until the agenda is empty, a halt is requested, a rule marked
 *     `shortCircuit` fires, or `maxCycles` is hit.
 *
 * Rules may also be *chained* declaratively: `rule.provides = 'x'` and
 * `rule.requires = 'x'` — a rule only activates once all of its `requires`
 * keys have been produced by earlier firings (or pre-seeded). This is
 * distinct from general forward chaining: `requires` is a data-flow edge,
 * conditions still gate evaluation.
 *
 * Truth maintenance: assertions made inside an action via
 * `ctx.assertFact`/`ctx.assertDerived` are tracked by the {@link WorkingMemory}
 * TMS; retracting a premise cascades through derived facts.
 *
 * @module RulesEngine/Implementations
 */

import {
  Condition,
  conditionFields,
  conditionSpecificity,
  evaluateCondition,
} from '../domain/dsl';
import { WorkingMemory } from '../domain/WorkingMemory';

/* ------------------------------------------------------------------ */
/* Public model                                                        */
/* ------------------------------------------------------------------ */

/**
 * The action context handed to rule actions. All mutations of memory and the
 * shared blackboard go through this object so the engine can track supports
 * for truth maintenance.
 */
export interface RuleActionContext {
  /** Merged view of all facts (fact ids → data, plus spread record fields). */
  readonly facts: Record<string, unknown>;
  /** Convenience accessor for `facts` — same object. */
  readonly input: Record<string, unknown>;
  /** Shared blackboard for rule outputs. `provides` keys land here too. */
  readonly output: Record<string, unknown>;
  /** Asserts a premise fact. */
  assertFact(id: string, data: unknown): void;
  /** Asserts a derived fact justified by this firing + the matched fact ids. */
  assertDerived(id: string, data: unknown): void;
  /** Retracts a fact, cascading through the TMS. */
  retractFact(id: string): string[];
  /** Stops the whole inference loop after this action completes. */
  halt(reason?: string): void;
  /** Engine-run metadata. */
  readonly cycle: number;
  readonly ruleId: string;
}

/** A rule's effect. Return value is ignored — mutate via `ctx`. */
export type RuleAction = (ctx: RuleActionContext) => void | Promise<void>;

export interface Rule {
  readonly id: string;
  /** Higher fires first under the `priority` strategy. Default 0. */
  readonly priority?: number;
  readonly condition: Condition;
  readonly action: RuleAction;
  /**
   * Data-flow keys this rule produces. Recorded on the blackboard and made
   * available to downstream rules via `requires`.
   */
  readonly provides?: readonly string[];
  /**
   * Data-flow keys that must be produced before this rule can activate.
   * Missing keys suppress activation regardless of the condition.
   */
  readonly requires?: readonly string[];
  /**
   * When true, firing this rule immediately terminates the inference loop.
   * Used for terminal decisions (e.g. "deny").
   */
  readonly shortCircuit?: boolean;
  /** Salience group tag for observability only. */
  readonly group?: string;
  /** Disabled rules are skipped during matching. */
  readonly enabled?: boolean;
}

/** One pending rule firing on the agenda. */
export interface Activation {
  readonly rule: Rule;
  /** Fact ids present (recency-ordered) at match time — used by recency CS. */
  readonly matchedFactIds: readonly string[];
  /** The newest fact recency among matched facts (0 if none matched a fact). */
  readonly maxRecency: number;
  /** Specificity score = leaf count in the condition tree. */
  readonly specificity: number;
  /** Agenda insertion sequence — final deterministic tie-breaker. */
  readonly sequence: number;
}

/** Conflict-resolution strategy names, applied left-to-right as a cascade. */
export type ConflictStrategy = 'priority' | 'specificity' | 'recency' | 'fifo' | 'lifo';

export interface RuleEngineOptions {
  /** Safety bound on inference cycles. Default 1000. */
  readonly maxCycles?: number;
  /**
   * Ordered cascade of conflict-resolution strategies. The first strategy
   * that produces a unique winner decides; ties fall through to the next.
   * Default `['priority', 'specificity', 'recency']`.
   */
  readonly conflictResolution?: readonly ConflictStrategy[];
  /** Injectable clock for fact timestamps and tracing. Default `Date.now`. */
  readonly clock?: () => number;
  /** When true, an activation may fire only once per match (refraction). Default true. */
  readonly refraction?: boolean;
}

/** Per-fire trace entry — the audit trail of an inference run. */
export interface FireRecord {
  readonly ruleId: string;
  readonly cycle: number;
  readonly factsAsserted: readonly string[];
  readonly factsRetracted: readonly string[];
  readonly providedKeys: readonly string[];
  readonly firedAt: number;
}

export interface EngineRunResult {
  /** Rules that fired, in order. */
  readonly fired: readonly FireRecord[];
  readonly halted: boolean;
  readonly haltReason?: string;
  readonly cycles: number;
  /** Blackboard contents after the run. */
  readonly output: Record<string, unknown>;
  /** Whether maxCycles was reached before quiescence. */
  readonly truncated: boolean;
}

interface EngineEvents {
  ruleFired?: (rec: FireRecord) => void;
  ruleActivated?: (ruleId: string) => void;
  halted?: (reason: string) => void;
  maxCyclesReached?: (cycles: number) => void;
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

export class ProductionRuleEngine {
  private readonly _rules = new Map<string, Rule>();
  private readonly _memory: WorkingMemory;
  private readonly _options: Required<Omit<RuleEngineOptions, 'clock'>> & { clock: () => number };
  private readonly _listeners: EngineEvents;
  /** Field-path → rule ids index, maintained for selective re-match. */
  private readonly _fieldIndex = new Map<string, Set<string>>();
  /** Rules with no field dependencies — always re-matched. */
  private readonly _unindexedRuleIds = new Set<string>();
  /** Refraction set: `ruleId` pairs already fired for an identical agenda state. */
  private readonly _firedKeys = new Set<string>();

  constructor(options: RuleEngineOptions = {}, listeners: EngineEvents = {}) {
    this._options = {
      maxCycles: options.maxCycles ?? 1000,
      conflictResolution: options.conflictResolution ?? ['priority', 'specificity', 'recency'],
      refraction: options.refraction ?? true,
      clock: options.clock ?? Date.now,
    };
    this._listeners = listeners;
    this._memory = new WorkingMemory(this._options.clock);
  }

  get memory(): WorkingMemory {
    return this._memory;
  }

  addRule(rule: Rule): void {
    if (this._rules.has(rule.id)) {
      throw new Error(`Duplicate rule id: ${rule.id}`);
    }
    this._rules.set(rule.id, rule);
    const fields = conditionFields(rule.condition);
    if (fields.size === 0) {
      this._unindexedRuleIds.add(rule.id);
    }
    for (const f of fields) {
      // Index on the root segment only — nested changes still hit the rule.
      const root = f.split('.')[0];
      let bucket = this._fieldIndex.get(root);
      if (!bucket) {
        bucket = new Set();
        this._fieldIndex.set(root, bucket);
      }
      bucket.add(rule.id);
    }
  }

  removeRule(ruleId: string): boolean {
    const removed = this._rules.delete(ruleId);
    if (removed) {
      this._unindexedRuleIds.delete(ruleId);
      for (const bucket of this._fieldIndex.values()) {
        bucket.delete(ruleId);
      }
    }
    return removed;
  }

  ruleCount(): number {
    return this._rules.size;
  }

  /** Seeds a premise fact outside of a run. */
  assertFact(id: string, data: unknown): void {
    this._memory.assert(id, data);
  }

  /**
   * Runs the inference loop until quiescence/halt.
   *
   * `initialFacts` (optional) are asserted as premises before the first cycle.
   * `seedProvides` pre-populates the `requires` blackboard.
   */
  async run(
    initialFacts: Record<string, unknown> = {},
    seedProvides: readonly string[] = []
  ): Promise<EngineRunResult> {
    for (const [id, data] of Object.entries(initialFacts)) {
      this._memory.assert(id, data);
    }

    const blackboard: Record<string, unknown> = {};
    const provided = new Set<string>(seedProvides);
    const fired: FireRecord[] = [];
    let halted = false;
    let haltReason: string | undefined;
    let cycles = 0;

    // The set of "dirty" root fields — rules depending on them are
    // re-matched. Initially everything is dirty.
    const dirty = new Set<string>(this._fieldIndex.keys());

    while (cycles < this._options.maxCycles && !halted) {
      const agenda = this._match(dirty, provided);
      dirty.clear();
      if (agenda.length === 0) {
        break;
      }
      const activation = this._resolve(agenda);
      const rec = await this._fire(activation, {
        memory: this._memory,
        blackboard,
        provided,
        cycle: cycles,
        onHalt: (reason) => {
          halted = true;
          haltReason = reason;
        },
        onFieldTouched: (rootField) => {
          dirty.add(rootField);
        },
        onAnyChange: () => {
          // Fact ids are themselves root fields.
          for (const k of this._fieldIndex.keys()) {
            dirty.add(k);
          }
        },
      });
      fired.push(rec);
      this._listeners.ruleFired?.(rec);
      cycles++;
      if (activation.rule.shortCircuit) {
        halted = true;
        haltReason = haltReason ?? `short-circuit:${activation.rule.id}`;
      }
    }

    if (cycles >= this._options.maxCycles && !halted) {
      this._listeners.maxCyclesReached?.(cycles);
    }

    return {
      fired,
      halted,
      haltReason,
      cycles,
      output: blackboard,
      truncated: cycles >= this._options.maxCycles && !halted,
    };
  }

  /* ----------------------- internals ------------------------------ */

  /**
   * Builds the agenda: for each candidate rule, evaluate its condition
   * against the flattened fact object and record an activation.
   *
   * `dirty` restricts which indexed rules are re-evaluated; unindexed rules
   * (conditions with no field references — e.g. `cond.always()`) are always
   * candidates but rely on refraction to avoid re-firing.
   */
  private _match(dirty: ReadonlySet<string>, provided: ReadonlySet<string>): Activation[] {
    const factsObj = this._memory.toFactObject();
    const recencyByFactId = new Map<string, number>();
    for (const f of this._memory.facts()) {
      recencyByFactId.set(f.id, f.recency);
    }

    const candidates = new Set<string>(this._unindexedRuleIds);
    for (const root of dirty) {
      const bucket = this._fieldIndex.get(root);
      if (bucket) {
        for (const id of bucket) {
          candidates.add(id);
        }
      }
    }
    // When dirty is empty but we still need a first pass, match everything.
    if (dirty.size === 0 && candidates.size === 0) {
      for (const id of this._rules.keys()) {
        candidates.add(id);
      }
    }

    const agenda: Activation[] = [];
    let seq = 0;
    for (const ruleId of candidates) {
      const rule = this._rules.get(ruleId);
      if (!rule || rule.enabled === false) {
        continue;
      }
      // Data-flow gating.
      if (rule.requires && !rule.requires.every((r) => provided.has(r))) {
        continue;
      }
      if (!evaluateCondition(rule.condition, factsObj)) {
        continue;
      }
      const matchedFactIds = this._memory.facts().map((f) => f.id);
      const maxRecency = matchedFactIds.reduce(
        (m, id) => Math.max(m, recencyByFactId.get(id) ?? 0),
        0
      );
      const activation: Activation = {
        rule,
        matchedFactIds,
        maxRecency,
        specificity: conditionSpecificity(rule.condition),
        sequence: seq++,
      };
      if (this._options.refraction) {
        const key = this._activationKey(activation);
        if (this._firedKeys.has(key)) {
          continue;
        }
      }
      this._listeners.ruleActivated?.(rule.id);
      agenda.push(activation);
    }
    // Refraction keys are session-scoped; clear when a run starts a fresh
    // agenda. We keep them for the duration of the run — engine instances
    // that run repeatedly should call `resetRefraction()` or be recreated.
    return agenda;
  }

  /**
   * Picks the winning activation using the configured strategy cascade.
   * Each strategy produces a partial order; when it yields a tie the next
   * strategy breaks it. Final fall-through: lowest agenda sequence (FIFO).
   */
  private _resolve(agenda: Activation[]): Activation {
    let pool = agenda;
    for (const strategy of this._options.conflictResolution) {
      if (pool.length <= 1) {
        break;
      }
      pool = this._applyStrategy(pool, strategy);
    }
    // Deterministic final tie-break: lowest sequence number.
    let winner = pool[0];
    for (const a of pool) {
      if (a.sequence < winner.sequence) {
        winner = a;
      }
    }
    return winner;
  }

  private _applyStrategy(pool: Activation[], strategy: ConflictStrategy): Activation[] {
    switch (strategy) {
      case 'priority': {
        const max = Math.max(...pool.map((a) => a.rule.priority ?? 0));
        return pool.filter((a) => (a.rule.priority ?? 0) === max);
      }
      case 'specificity': {
        const max = Math.max(...pool.map((a) => a.specificity));
        return pool.filter((a) => a.specificity === max);
      }
      case 'recency': {
        const max = Math.max(...pool.map((a) => a.maxRecency));
        return pool.filter((a) => a.maxRecency === max);
      }
      case 'fifo': {
        const min = Math.min(...pool.map((a) => a.sequence));
        return pool.filter((a) => a.sequence === min);
      }
      case 'lifo': {
        const max = Math.max(...pool.map((a) => a.sequence));
        return pool.filter((a) => a.sequence === max);
      }
    }
  }

  private _activationKey(a: Activation): string {
    // Refraction key: a rule may refire when the fact *population* changes.
    const factSig = this._memory
      .facts()
      .map((f) => `${f.id}@${f.recency}`)
      .sort()
      .join(',');
    return `${a.rule.id}|${factSig}`;
  }

  /** Clears the refraction set so rules can fire again on identical facts. */
  resetRefraction(): void {
    this._firedKeys.clear();
  }

  private async _fire(
    activation: Activation,
    io: {
      memory: WorkingMemory;
      blackboard: Record<string, unknown>;
      provided: Set<string>;
      cycle: number;
      onHalt: (reason?: string) => void;
      onFieldTouched: (rootField: string) => void;
      onAnyChange: () => void;
    }
  ): Promise<FireRecord> {
    const asserted: string[] = [];
    const retracted: string[] = [];
    const providedKeys: string[] = [];

    const ctx: RuleActionContext = {
      facts: io.memory.toFactObject(),
      input: io.memory.toFactObject(),
      output: io.blackboard,
      cycle: io.cycle,
      ruleId: activation.rule.id,
      assertFact: (id, data) => {
        io.memory.assert(id, data);
        asserted.push(id);
        io.onFieldTouched(id.split('.')[0]);
        io.onAnyChange();
      },
      assertDerived: (id, data) => {
        io.memory.assertDerived(id, data, activation.rule.id, activation.matchedFactIds);
        asserted.push(id);
        io.onFieldTouched(id.split('.')[0]);
        io.onAnyChange();
      },
      retractFact: (id) => {
        const gone = io.memory.retract(id);
        retracted.push(...gone);
        if (gone.length > 0) {
          io.onAnyChange();
        }
        return gone;
      },
      halt: (reason) => io.onHalt(reason),
    };

    await activation.rule.action(ctx);

    for (const key of activation.rule.provides ?? []) {
      io.provided.add(key);
      providedKeys.push(key);
      // Materialise provides onto the blackboard if the action wrote a value
      // under the same key — otherwise record `true`.
      if (!(key in io.blackboard)) {
        io.blackboard[key] = true;
      }
      io.onAnyChange();
    }

    if (this._options.refraction) {
      this._firedKeys.add(this._activationKey(activation));
    }

    return {
      ruleId: activation.rule.id,
      cycle: io.cycle,
      factsAsserted: asserted,
      factsRetracted: retracted,
      providedKeys,
      firedAt: this._options.clock(),
    };
  }
}
