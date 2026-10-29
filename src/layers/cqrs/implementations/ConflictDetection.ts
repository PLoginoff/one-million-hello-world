/**
 * ConflictDetection — detect interfering in-flight commands before they
 * commit. Useful in front of optimistic-concurrency aggregates: rather
 * than letting two competing commands race a version check, the detector
 * can reject or serialize the second one at dispatch time.
 *
 * A "conflict" is defined by a `ConflictPolicy`: a function that decides
 * whether two commands interfere. Policies compose with AND/OR. Common
 * predicates:
 *  - same-aggregate: two commands targeting the same aggregate id
 *  - mutex-by-type: two commands of the same type are mutually exclusive
 *  - field-overlap: commands that write overlapping declared fields
 *
 * Detection modes:
 *  - REJECT: second conflicting command immediately fails (fail-fast)
 *  - QUEUE:  second waits until the first completes (serializes)
 *
 * Implementation: a Map<resourceKey, inFlight[]>. Lookup is O(m) in the
 * number of in-flight commands on the same resource — typically 0-3.
 *
 * @module CqrsLayer/Implementations
 */

import { Command, CommandContext, MiddlewareFn } from './CqrsCore';

// ------------------------------------------------------------------ types

/** A resource the command targets. The policy keys conflicts by this. */
export interface CommandTarget {
  /** Resource category, e.g. 'aggregate', 'tenant', 'global'. */
  readonly kind: string;
  /** Resource id within the kind, e.g. aggregate id. */
  readonly id: string;
}

/** Extract the resource(s) a command touches. */
export type TargetExtractor = (command: Command) => CommandTarget[];

/** Decide whether two commands on the same target conflict. */
export type ConflictPolicy = (a: Command, b: Command, target: CommandTarget) => boolean;

/** What to do when a conflict is detected. */
export type ConflictMode = 'reject' | 'queue';

/** Error thrown when a queued/rejected command times out or is refused. */
export class CommandConflictError extends Error {
  readonly command: Command;
  readonly conflicting: Command;
  readonly target: CommandTarget;
  constructor(command: Command, conflicting: Command, target: CommandTarget) {
    super(
      `Command '${command.type}' conflicts with in-flight '${conflicting.type}' ` +
        `on ${target.kind}:${target.id}`,
    );
    this.name = 'CommandConflictError';
    this.command = command;
    this.conflicting = conflicting;
    this.target = target;
  }
}

// ------------------------------------------------------ built-in policies

/** Two commands conflict if they share a type. */
export function sameTypePolicy(a: Command, b: Command): boolean {
  return a.type === b.type;
}

/** Always-conflict — used to serialize all writes to a resource. */
export function alwaysConflict(): boolean {
  return true;
}

/** Never-conflict — opt-out policy. */
export function neverConflict(): boolean {
  return false;
}

/**
 * Aggregate-target policy: extract `payload.aggregateId` (or
 * `payload.id`) and treat commands on the same aggregate as conflicting.
 */
export function aggregateIdExtractor(command: Command): CommandTarget[] {
  const p = command.payload;
  if (typeof p !== 'object' || p === null) return [];
  const rec = p as Record<string, unknown>;
  const id = rec['aggregateId'] ?? rec['id'];
  if (typeof id !== 'string' || id.length === 0) return [];
  return [{ kind: 'aggregate', id }];
}

/**
 * Combine multiple policies with OR semantics — conflict if ANY policy
 * reports a conflict.
 */
export function orPolicies(...policies: ConflictPolicy[]): ConflictPolicy {
  return (a, b, target) => policies.some((p) => p(a, b, target));
}

/** AND semantics — conflict only if ALL policies agree. */
export function andPolicies(...policies: ConflictPolicy[]): ConflictPolicy {
  return (a, b, target) => policies.every((p) => p(a, b, target));
}

// --------------------------------------------------------------- detector

interface InFlight {
  command: Command;
  context: CommandContext;
  targets: CommandTarget[];
  startedAt: number;
  resolve: () => void;
  promise: Promise<void>;
}

export interface ConflictDetectorOptions {
  /** How commands map to resources. */
  readonly extract: TargetExtractor;
  /** Whether two commands on the same target conflict. */
  readonly policy: ConflictPolicy;
  /** Behaviour on detection. */
  readonly mode: ConflictMode;
  /** Queue-mode timeout (ms) — how long a queued command waits. */
  readonly queueTimeoutMs?: number;
}

export class ConflictDetector {
  private readonly _opts: ConflictDetectorOptions;
  private readonly _inFlight: InFlight[] = [];
  private _detectedCount = 0;
  private _rejectedCount = 0;
  private _queuedCount = 0;
  private _queueTimeoutCount = 0;

  constructor(options: ConflictDetectorOptions) {
    this._opts = options;
  }

  stats(): { detected: number; rejected: number; queued: number; queueTimeouts: number; inFlight: number } {
    return {
      detected: this._detectedCount,
      rejected: this._rejectedCount,
      queued: this._queuedCount,
      queueTimeouts: this._queueTimeoutCount,
      inFlight: this._inFlight.length,
    };
  }

  /**
   * Middleware-form for CommandBus. Wraps the handler so the command's
   * targets are marked in-flight for the duration of the handler.
   */
  middleware(): MiddlewareFn {
    return async (message, context, next) => {
      const command = message as Command;
      const targets = this._opts.extract(command);

      // Find first conflicting in-flight entry on any shared target.
      let blocker: InFlight | undefined;
      let blockerTarget: CommandTarget | undefined;
      for (const inflight of this._inFlight) {
        for (const t of targets) {
          for (const it of inflight.targets) {
            if (t.kind === it.kind && t.id === it.id && this._opts.policy(inflight.command, command, t)) {
              blocker = inflight;
              blockerTarget = t;
              break;
            }
          }
          if (blocker) break;
        }
        if (blocker) break;
      }

      if (blocker && blockerTarget) {
        this._detectedCount += 1;
        if (this._opts.mode === 'reject') {
          this._rejectedCount += 1;
          throw new CommandConflictError(command, blocker.command, blockerTarget);
        }
        // queue mode — await the blocker, with a bounded timeout.
        this._queuedCount += 1;
        const timeout = this._opts.queueTimeoutMs ?? 30_000;
        const winner = await Promise.race([
          blocker.promise.then(() => 'released' as const),
          new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), timeout)),
        ]);
        if (winner === 'timeout') {
          this._queueTimeoutCount += 1;
          throw new CommandConflictError(command, blocker.command, blockerTarget);
        }
      }

      // Register self, run handler, unregister.
      let resolveFn!: () => void;
      const promise = new Promise<void>((resolve) => {
        resolveFn = resolve;
      });
      const entry: InFlight = {
        command,
        context,
        targets,
        startedAt: Date.now(),
        resolve: resolveFn,
        promise,
      };
      this._inFlight.push(entry);
      try {
        return await next();
      } finally {
        const idx = this._inFlight.indexOf(entry);
        if (idx >= 0) this._inFlight.splice(idx, 1);
        resolveFn();
      }
    };
  }
}
