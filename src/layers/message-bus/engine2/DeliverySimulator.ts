/**
 * Delivery Simulator
 *
 * Ties the topology and the routing table together: what actually
 * reaches a consumer when a publisher sends to an exchange that fans
 * out through content-based routes? `trace` walks one message end to
 * end — exchange → matched bindings → queue copy → (optionally) the
 * routing table's verdict — and reports every hop so route debugging
 * is "show me the hops", not "read the table and guess".
 *
 * Also models the two ordering questions operators ask:
 *   - `perQueueOrder` — the order a single queue sees a batch of
 *     publishes (FIFO per queue, interleaved across queues).
 *   - `redeliveries` — when a consumer nacks with requeue, which
 *     messages return to the head of the queue.
 *
 * @module MessageBusLayer/Engine2
 */

import { BusTopology } from './BusTopology';
import { QueuedMessage, RoutedMessage } from './types';

export interface TraceHop {
  readonly stage: 'exchange' | 'binding' | 'queue';
  readonly detail: string;
}

export interface TraceResult {
  readonly routedTo: readonly string[];
  readonly unrouted: boolean;
  readonly hops: readonly TraceHop[];
}

/** Walk one message through the topology's bindings. */
export function trace(
  topology: BusTopology,
  exchange: string,
  message: RoutedMessage
): TraceResult {
  const hops: TraceHop[] = [{ stage: 'exchange', detail: `publish to ${exchange}` }];
  const snap = topology.snapshot();
  const ex = snap.exchanges.find((e) => e.name === exchange);
  if (!ex) {
    hops.push({ stage: 'exchange', detail: `unknown exchange '${exchange}'` });
    return { routedTo: [], unrouted: true, hops };
  }
  hops.push({ stage: 'exchange', detail: `kind=${ex.kind}` });
  const routedTo = topology.publish(exchange, message);
  for (const q of routedTo) {
    hops.push({ stage: 'queue', detail: `delivered copy to '${q}'` });
  }
  if (routedTo.length === 0) {
    hops.push({ stage: 'binding', detail: 'no binding matched — unrouted' });
  }
  return { routedTo, unrouted: routedTo.length === 0, hops };
}

/**
 * Fan-out delivery order for a batch: the order each queue sees is
 * publish order; this helper enumerates the per-queue view for a
 * batch publish.
 */
export function perQueueOrder(
  topology: BusTopology,
  exchange: string,
  messages: readonly RoutedMessage[]
): Map<string, QueuedMessage[]> {
  for (const m of messages) topology.publish(exchange, m);
  const out = new Map<string, QueuedMessage[]>();
  const snap = topology.snapshot();
  for (const q of snap.queues) {
    const msgs = topology.peek(q.name, Number.MAX_SAFE_INTEGER);
    if (msgs.length > 0) out.set(q.name, [...msgs]);
  }
  return out;
}

/**
 * Nack-with-requeue on the topology's own queue primitive: rewinds the
 * head cursor so the last dequeued messages return ahead of anything
 * still queued — matching AMQP `basic.nack(requeue=true)`, where the
 * message is redelivered to the next consumer before newer arrivals.
 */
export function requeue(
  topology: BusTopology,
  queue: string,
  n: number
): QueuedMessage[] {
  return topology.requeue(queue, n);
}
