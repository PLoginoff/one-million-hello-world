/**
 * StatefulTesting — model-based property testing
 *
 * Model-based (state-machine) property testing: a {@link Model} describes
 * a system's contract — commands, their preconditions, how they update an
 * abstract model state, and postconditions comparing system-vs-model
 * outcomes. The runner generates random command sequences and replays
 * them against the real System under test (SUT).
 *
 * Shrinking works on command sequences: remove commands (respecting
 * model-state precondition reachability) until the shortest failing
 * trace remains — the classic "drop commands" shrink of stateful PBT.
 *
 * Determinism: command draws use a seeded PRNG; replaying a seed
 * regenerates the identical sequence.
 *
 * @module PropertyTesting/Engine
 */

import { Arbitrary, mulberry32 } from './Arbitrary';

/* ------------------------------------------------------------------------ */
/* Model                                                                    */
/* ------------------------------------------------------------------------ */

/**
 * A command the model knows about.
 * @typeParam M model state
 * @typeParam S system state (the SUT's exposed handle)
 * @typeParam R command result
 * @typeParam C concrete command payload type
 */
export interface Command<M, S, R, C = unknown> {
  /** Command name for trace readability. */
  readonly name: string;
  /** Payload generator. */
  readonly argArbitrary: Arbitrary<C>;
  /** Whether the command is legal in model state `m`. */
  readonly precondition: (m: M, arg: C) => boolean;
  /**
   * Advance the model. Called *before* `run`; must return the expected
   * result so `postcondition` can compare.
   */
  readonly nextModel: (m: M, arg: C) => { model: M; expected: R };
  /** Execute against the real system. */
  readonly run: (s: S, arg: C) => R | Promise<R>;
  /**
   * Compare model expectation with actual result. Defaults to
   * deep-equality when omitted.
   */
  readonly postcondition?: (expected: R, actual: R) => boolean;
}

export interface Model<M, S> {
  /** Initial model state. */
  readonly initialModel: M;
  /** Initial system state (fresh SUT per sequence). */
  readonly createSystem: () => S;
  /** Available commands. */
  readonly commands: readonly Command<M, S, unknown, unknown>[];
}

/** One step in a generated trace. */
export interface TraceStep {
  readonly commandName: string;
  readonly arg: unknown;
}

export interface Trace {
  readonly steps: readonly TraceStep[];
}

/* ------------------------------------------------------------------------ */
/* Sequence generation                                                      */
/* ------------------------------------------------------------------------ */

export interface SequenceOptions {
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly seed?: number;
  /** attempts per step to find a precondition-satisfying command */
  readonly maxAttemptsPerStep?: number;
}

/**
 * Generate a random legal command sequence: at each step, pick a
 * command whose precondition holds in the current model state, draw
 * its argument, advance the model.
 */
export function generateSequence<M, S>(
  model: Model<M, S>,
  options: SequenceOptions = {}
): { trace: Trace; finalModel: M } {
  const rand = mulberry32(options.seed ?? 42);
  const minLen = options.minLength ?? 1;
  const maxLen = options.maxLength ?? 32;
  const maxAttempts = options.maxAttemptsPerStep ?? 50;

  const targetLen = minLen + Math.floor(rand() * (maxLen - minLen + 1));
  const steps: TraceStep[] = [];
  let m = model.initialModel;

  for (let i = 0; i < targetLen; i++) {
    // find a command with satisfiable precondition
    let picked: { cmd: Command<M, S, unknown, unknown>; arg: unknown; next: { model: M; expected: unknown } } | undefined;
    for (let attempt = 0; attempt < maxAttempts && !picked; attempt++) {
      const cmd = model.commands[Math.floor(rand() * model.commands.length)];
      const arg = cmd.argArbitrary.generate(rand).value;
      if (cmd.precondition(m, arg)) {
        picked = { cmd, arg, next: cmd.nextModel(m, arg) };
      }
    }
    if (!picked) break; // dead end — sequence ends early
    steps.push({ commandName: picked.cmd.name, arg: picked.arg });
    m = picked.next.model;
  }
  return { trace: { steps }, finalModel: m };
}

/* ------------------------------------------------------------------------ */
/* Replay                                                                   */
/* ------------------------------------------------------------------------ */

export interface StepResult {
  readonly index: number;
  readonly commandName: string;
  readonly arg: unknown;
  readonly ok: boolean;
  readonly expected?: unknown;
  readonly actual?: unknown;
  readonly error?: string;
}

export interface ReplayReport {
  readonly passed: boolean;
  readonly steps: readonly StepResult[];
  /** index of first failing step, -1 when all passed */
  readonly failureIndex: number;
  readonly finalModelState?: unknown;
}

/**
 * Replay a trace against a fresh system, checking each postcondition.
 * Stops at the first failure and reports the offending step.
 */
export async function replaySequence<M, S>(
  model: Model<M, S>,
  trace: Trace
): Promise<ReplayReport> {
  const sut = model.createSystem();
  let m = model.initialModel;
  const results: StepResult[] = [];
  let failureIndex = -1;

  for (let i = 0; i < trace.steps.length; i++) {
    const step = trace.steps[i];
    const cmd = model.commands.find((c) => c.name === step.commandName);
    if (!cmd) {
      results.push({
        index: i,
        commandName: step.commandName,
        arg: step.arg,
        ok: false,
        error: `unknown command "${step.commandName}"`,
      });
      failureIndex = i;
      break;
    }
    if (!cmd.precondition(m, step.arg)) {
      results.push({
        index: i,
        commandName: step.commandName,
        arg: step.arg,
        ok: false,
        error: `precondition violated in model state`,
      });
      failureIndex = i;
      break;
    }
    const { model: nextM, expected } = cmd.nextModel(m, step.arg);
    try {
      const actual = await cmd.run(sut, step.arg);
      const ok = cmd.postcondition
        ? cmd.postcondition(expected, actual)
        : deepEq(expected, actual);
      results.push({
        index: i,
        commandName: step.commandName,
        arg: step.arg,
        ok,
        expected,
        actual,
        error: ok ? undefined : `postcondition failed: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
      });
      if (!ok) {
        failureIndex = i;
        break;
      }
      m = nextM;
    } catch (e) {
      results.push({
        index: i,
        commandName: step.commandName,
        arg: step.arg,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
      failureIndex = i;
      break;
    }
  }
  return { passed: failureIndex === -1, steps: results, failureIndex, finalModelState: m };
}

function deepEq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/* ------------------------------------------------------------------------ */
/* Trace shrinking                                                          */
/* ------------------------------------------------------------------------ */

/**
 * Shrink a failing trace by removing steps.
 *
 * A removed step changes downstream model state, so naive deletion can
 * produce precondition-violating suffixes. The shrinker re-replays each
 * candidate trace and only accepts drops where the sequence remains
 * legal AND still fails — guaranteeing a minimal valid counterexample.
 *
 * Strategy: try removing contiguous chunks (halving), then single
 * steps — classic fast-check `commands` shrinking.
 */
export async function shrinkTrace<M, S>(
  model: Model<M, S>,
  trace: Trace,
  maxEvals = 500
): Promise<{ trace: Trace; evals: number }> {
  let evals = 0;
  const stillFails = async (t: Trace): Promise<boolean> => {
    evals++;
    const r = await replaySequence(model, t);
    // "still fails" = replay hits a real failure (postcondition/throw),
    // not merely a precondition violation from invalid shrinking
    if (r.passed) return false;
    const failingStep = r.steps[r.failureIndex];
    return failingStep?.error?.includes('postcondition failed') === true ||
           failingStep?.error !== undefined && !failingStep.error.includes('precondition') &&
           !failingStep.error.includes('unknown command');
  };

  let current = trace;
  let improved = true;
  // chunk-pass: try removing halves, quarters... then singles
  while (improved && evals < maxEvals) {
    improved = false;
    const n = current.steps.length;
    for (let chunk = Math.floor(n / 2); chunk >= 1 && !improved; chunk = Math.floor(chunk / 2)) {
      for (let start = 0; start + chunk <= n && evals < maxEvals; start++) {
        const candidate: Trace = {
          steps: [...current.steps.slice(0, start), ...current.steps.slice(start + chunk)],
        };
        if (candidate.steps.length === 0) continue;
        if (await stillFails(candidate)) {
          current = candidate;
          improved = true;
          break;
        }
      }
    }
  }
  return { trace: current, evals };
}

/* ------------------------------------------------------------------------ */
/* Stateful runner                                                          */
/* ------------------------------------------------------------------------ */

export interface StatefulCheckOptions extends SequenceOptions {
  /** number of sequences to try (default 50) */
  readonly sequences?: number;
}

export interface StatefulReport {
  readonly passed: boolean;
  readonly sequencesRun: number;
  readonly seed: number;
  /** minimal failing trace when found */
  readonly counterexample?: Trace;
  /** original failing trace before shrinking */
  readonly original?: Trace;
  readonly failure?: StepResult;
}

/**
 * Model-based property check: generate N command sequences, replay each
 * against a fresh SUT, shrink the first failing trace.
 */
export async function checkStateful<M, S>(
  model: Model<M, S>,
  options: StatefulCheckOptions = {}
): Promise<StatefulReport> {
  const sequences = options.sequences ?? 50;
  const masterSeed = options.seed ?? 1;

  for (let i = 0; i < sequences; i++) {
    const seqSeed = deriveSeedShim(masterSeed, i);
    const { trace } = generateSequence(model, { ...options, seed: seqSeed });
    const replay = await replaySequence(model, trace);
    if (!replay.passed) {
      const shrunk = await shrinkTrace(model, trace);
      return {
        passed: false,
        sequencesRun: i + 1,
        seed: seqSeed,
        counterexample: shrunk.trace,
        original: trace,
        failure: replay.steps[replay.failureIndex],
      };
    }
  }
  return { passed: true, sequencesRun: sequences, seed: masterSeed };
}

function deriveSeedShim(seed: number, i: number): number {
  let z = (seed + i * 0x9e3779b9) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  return (z ^ (z >>> 15)) >>> 0;
}

/* ------------------------------------------------------------------------ */
/* Fluent command builder                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Concise command definition helper:
 * ```ts
 * const push = cmd('push', arb.int({min:0,max:99}), {
 *   pre: () => true,
 *   model: (m, x) => ({ model: [...m, x], expected: m.length + 1 }),
 *   run: (s, x) => s.push(x),
 * });
 * ```
 */
export function cmd<M, S, R, C>(
  name: string,
  argArbitrary: Arbitrary<C>,
  spec: {
    pre?: (m: M, arg: C) => boolean;
    model: (m: M, arg: C) => { model: M; expected: R };
    run: (s: S, arg: C) => R | Promise<R>;
    post?: (expected: R, actual: R) => boolean;
  }
): Command<M, S, R, C> {
  return {
    name,
    argArbitrary,
    precondition: spec.pre ?? (() => true),
    nextModel: spec.model,
    run: spec.run,
    postcondition: spec.post,
  };
}
