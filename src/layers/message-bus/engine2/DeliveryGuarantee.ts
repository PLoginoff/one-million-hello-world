/**
 * Delivery Guarantee Analysis
 *
 * Reasoning about *what a consumer can depend on* from a topology +
 * routing table — the contract documentation derived from the actual
 * configuration rather than a README somebody wrote once.
 *
 * For a queue, the guarantee answers:
 *   - Which exchanges feed it (through which bindings)?
 *   - Could a message arrive twice on the same queue (two bindings on
 *     the same exchange both matching — a real AMQP at-least-once
 *     subtlety)?
 *   - Is there a path where a published message lands nowhere
 *     (unrouted)?
 *   - What's the effective ordering: strict FIFO only when exactly one
 *     exchange feeds the queue AND that exchange is direct/topic with
 *     a single binding — fanout merges interleave and reordering
 *     becomes possible.
 *
 * This is static analysis over the declaration snapshot — O(E×B).
 *
 * @module MessageBusLayer/Engine2
 */

import { BusTopology } from './BusTopology';

export interface FeedPath {
  readonly exchange: string;
  readonly kind: string;
  readonly bindKey: string;
  readonly headerPredicates: number;
}

export interface GuaranteeReport {
  readonly queue: string;
  readonly feeds: readonly FeedPath[];
  /**
   * True when two different bindings on the SAME exchange can both
   * deliver the same message — dedup-required consumption.
   */
  readonly duplicateRisk: boolean;
  /**
   * True when some published key could match no binding — traffic can
   * be silently lost (unrouted).
   */
  readonly unroutedRisk: boolean;
  /** Human ordering story: strict, best-effort, or none. */
  readonly ordering: 'strict-fifo' | 'merged-fifo' | 'unknown';
  readonly notes: readonly string[];
}

export function analyze(queue: string, topology: BusTopology): GuaranteeReport {
  const snap = topology.snapshot();
  const feeds: FeedPath[] = [];
  const notes: string[] = [];
  let unroutedRisk = false;
  let duplicateRisk = false;

  for (const ex of snap.exchanges) {
    const toUs = ex.bindings.filter((b) => b.queue === queue);
    for (const b of toUs) {
      feeds.push({
        exchange: ex.name,
        kind: ex.kind,
        bindKey: b.bindKey,
        headerPredicates: b.headerArgs.length,
      });
    }
    if (toUs.length > 1) {
      duplicateRisk = true;
      notes.push(
        `exchange '${ex.name}' has ${toUs.length} bindings to this queue — one publish can fan-in twice`
      );
    }
    if (toUs.length > 0 && (ex.kind === 'direct' || ex.kind === 'topic' || ex.kind === 'headers')) {
      // A key that matches no binding on a feeding exchange is unrouted.
      unroutedRisk = true;
      notes.push(`exchange '${ex.name}' (${ex.kind}) can publish keys matching no binding`);
    }
  }

  const ordering =
    feeds.length === 0 ? 'unknown'
    : feeds.length === 1 ? 'strict-fifo'
    : 'merged-fifo';
  if (ordering === 'merged-fifo') {
    notes.push('multiple feed paths interleave — cross-path ordering is not guaranteed');
  }
  if (feeds.length === 0) {
    notes.push('no bindings feed this queue — it can never receive a message');
  }

  return { queue, feeds, duplicateRisk, unroutedRisk, ordering, notes };
}
