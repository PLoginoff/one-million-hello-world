/**
 * MessageTracer — correlation/causation tracking through the broker chain.
 *
 * In an event-driven system a single user action fans out into dozens of
 * messages across queues. Without tracing you can't answer "which messages
 * came from request X?" — the core observability primitive distributed
 * tracing (OpenTelemetry `traceparent`) exists to provide.
 *
 * Model (same convention as the event engine):
 *   - `correlationId` — the whole request chain shares one ID, propagated
 *     from the triggering message to every message it causes.
 *   - `causationId` — the immediate parent's message id: a message that
 *     caused this one.
 *   - `spans` — a per-message journal appended at each broker hop
 *     (enqueued/dequeued/acked/nacked/expired/preempted).
 *
 * `stamp` is called at enqueue: it either inherits the parent's context
 * (continuing a chain) or mints a new correlationId (starting one).
 * `record` appends spans on each lifecycle event so `trace(messageId)`
 * reconstructs the full journey.
 *
 * @module MessageQueueLayer/Engine/Advanced
 */

import { TraceContext, TraceSpan, TracedMessage } from './types';
import type { EngineMessage } from '../types';

export interface TracerOptions {
  readonly clock?: () => number;
  /** Correlation id generator. Default: `corr-<counter>`. */
  readonly correlationIdGen?: () => string;
}

export class MessageTracer<T = unknown> {
  private readonly clock: () => number;
  private readonly correlationIdGen: () => string;
  /** messageId → context + span journal. */
  private readonly contexts = new Map<string, TraceContext>();
  private readonly spans = new Map<string, TraceSpan[]>();

  constructor(options: TracerOptions = {}) {
    this.clock = options.clock ?? Date.now;
    let c = 0;
    this.correlationIdGen = options.correlationIdGen ?? (() => `corr-${++c}`);
  }

  /**
   * Stamps a message at enqueue. Pass `parent` (the TracedMessage that
   * caused this send) to continue a chain — its correlationId flows down
   * and its message id becomes this message's causationId.
   */
  stamp(
    message: EngineMessage<T>,
    parent?: TracedMessage<T>,
    producerId?: string
  ): TraceContext {
    const ctx: TraceContext = parent
      ? {
          correlationId: parent.context.correlationId,
          causationId: parent.message.id,
          producerId: producerId ?? parent.context.producerId,
          enqueuedAt: this.clock(),
        }
      : {
          correlationId: this.correlationIdGen(),
          producerId,
          enqueuedAt: this.clock(),
        };
    this.contexts.set(message.id, ctx);
    this.record(message, 'enqueued', `producer=${producerId ?? '?'}`);
    return ctx;
  }

  /** Appends a lifecycle span to a message's journal. */
  record(
    message: EngineMessage<T>,
    action: TraceSpan['action'],
    detail?: string
  ): void {
    const queue = (message as { queue?: string }).queue ?? '?';
    const list = this.spans.get(message.id) ?? [];
    list.push({ queue, action, at: this.clock(), detail });
    this.spans.set(message.id, list);
  }

  /** Reconstructs a message's full trace. */
  trace(message: EngineMessage<T>): TracedMessage<T> | null {
    const ctx = this.contexts.get(message.id);
    if (!ctx) return null;
    return { message, trace: this.spans.get(message.id) ?? [], context: ctx };
  }

  /** Every message in a correlation chain (for "trace request X" queries). */
  byCorrelation(correlationId: string): string[] {
    const out: string[] = [];
    for (const [mid, ctx] of this.contexts) {
      if (ctx.correlationId === correlationId) out.push(mid);
    }
    return out;
  }

  /** Direct children of a message (what it caused). */
  childrenOf(messageId: string): string[] {
    const out: string[] = [];
    for (const [mid, ctx] of this.contexts) {
      if (ctx.causationId === messageId) out.push(mid);
    }
    return out;
  }

  /** Full descendant tree of a root message (BFS over causation links). */
  descendantsOf(messageId: string): string[] {
    const out: string[] = [];
    const queue = [messageId];
    const seen = new Set([messageId]);
    while (queue.length > 0) {
      const cur = queue.shift() as string;
      for (const child of this.childrenOf(cur)) {
        if (!seen.has(child)) {
          seen.add(child);
          out.push(child);
          queue.push(child);
        }
      }
    }
    return out;
  }
}
