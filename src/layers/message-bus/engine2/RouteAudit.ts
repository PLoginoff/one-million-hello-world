/**
 * Route Audit & Dry-Run Simulation
 *
 * The "what would this change do?" tool for routing tables — the
 * difference between editing a firewall rule and hoping versus
 * simulating it first. Given a replay corpus of messages (real traffic
 * samples or a synthetic probe suite), `diff()` answers:
 *
 *   - which messages change destination under the proposed table;
 *   - which become unrouted (the dangerous case — silently dead
 *     traffic); and
 *   - which destinations gain/lose volume.
 *
 * It also detects shadowed rules: a rule that can never match because
 * an earlier, broader rule claims every message it could see — the
 * routing-table equivalent of dead code.
 *
 * Cost: O(M × R) for M corpus messages against R rules (routeAll is
 * the inner call); shadowing detection is O(R²) but rule counts are
 * small enough that exactness beats cleverness.
 *
 * @module MessageBusLayer/Engine2
 */

import { RouteDecision, RoutedMessage, RoutingRule } from './types';
import { RoutingTable } from './RoutingTable';

export interface RouteMove {
  readonly routingKey: string;
  readonly headers: Readonly<Record<string, string>>;
  /** Destinations under the old table (empty = was unrouted). */
  readonly from: readonly RouteDecision[];
  /** Destinations under the new table (empty = now unrouted). */
  readonly to: readonly RouteDecision[];
}

export interface RouteDiffReport {
  readonly messagesChecked: number;
  /** Messages whose destination set changed. */
  readonly moved: readonly RouteMove[];
  /** Messages that lose all routing under the new table. */
  readonly nowUnrouted: readonly RouteMove[];
  /** Per-queue destination deltas: gained − lost message copies. */
  readonly queueDelta: ReadonlyMap<string, number>;
}

function destinationsEqual(a: readonly RouteDecision[], b: readonly RouteDecision[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((d, i) => b[i] !== undefined && d.ruleId === b[i].ruleId && d.queue === b[i].queue);
}

/**
 * Replay a corpus through two tables and diff the results.
 * `old` may be an empty table — useful to preview an initial ruleset.
 */
export function diff(
  oldTable: RoutingTable,
  newTable: RoutingTable,
  corpus: readonly RoutedMessage[]
): RouteDiffReport {
  const moved: RouteMove[] = [];
  const nowUnrouted: RouteMove[] = [];
  const queueDelta = new Map<string, number>();

  for (const m of corpus) {
    const from = oldTable.routeAll(m);
    const to = newTable.routeAll(m);
    if (destinationsEqual(from, to)) continue;
    const move: RouteMove = { routingKey: m.routingKey, headers: m.headers, from, to };
    moved.push(move);
    if (to.length === 0) nowUnrouted.push(move);
    for (const d of from) queueDelta.set(d.queue, (queueDelta.get(d.queue) ?? 0) - 1);
    for (const d of to) queueDelta.set(d.queue, (queueDelta.get(d.queue) ?? 0) + 1);
  }

  return {
    messagesChecked: corpus.length,
    moved,
    nowUnrouted,
    queueDelta,
  };
}

/**
 * Detect shadowed rules: rules that cannot match any message a
 * higher-priority, equal-or-broader rule already claims.
 *
 * Detection is heuristic-but-honest: a rule is *provably* shadowed when
 * an earlier rule has an equal-or-broader key pattern AND no predicates
 * (the earlier rule then matches every message the later one could).
 * Key-pattern coverage itself is decided by language inclusion —
 * approximated here by checking that the narrow pattern's literals all
 * appear in the broad pattern's literal positions. Conservative: a
 * rule is only reported shadowed when the proof holds; genuine
 * overlaps that need the corpus stay invisible rather than guessed.
 */
export function shadowed(table: RoutingTable): readonly RoutingRule[] {
  const rules = table.describe();
  const out: RoutingRule[] = [];
  for (let i = 0; i < rules.length; i++) {
    const narrow = rules[i];
    if (narrow === undefined) continue;
    for (let j = 0; j < i; j++) {
      const broad = rules[j];
      if (broad === undefined) continue;
      if (broad.predicates.length > 0) continue; // can't prove coverage with predicates
      if (patternCovers(broad.keyPattern, narrow.keyPattern)) {
        out.push(narrow);
        break;
      }
    }
  }
  return out;
}

/**
 * Conservative topic-pattern coverage: true only when every message
 * matching `narrow` certainly matches `broad`. Decided syntactically:
 * each broad word must be `#`, `*`, or the literal equal to the narrow
 * word in the same position; a broad `#` absorbs any remaining words.
 */
function patternCovers(broad: string, narrow: string): boolean {
  const b = broad.split('.');
  const n = narrow.split('.');
  let bi = 0;
  let ni = 0;
  while (bi < b.length) {
    const bw = b[bi];
    if (bw === '#') return true; // absorbs the rest unconditionally
    if (ni >= n.length) return false;
    const nw = n[ni];
    if (bw === '*') {
      // `*` matches any single word — fine as long as narrow has one there.
      if (nw === '#') return false; // narrow's `#` can mean zero words — not covered
    } else if (bw !== nw) {
      // broad literal must equal the narrow word; a narrow `*` or `#`
      // can produce other words → not covered.
      return false;
    }
    bi++;
    ni++;
  }
  return ni === n.length;
}

/**
 * Build a synthetic probe corpus: one message per routing key a
 * ruleset can produce — every literal path expansion up to `depth`
 * wildcard fills, plus a header sweep over predicate values. Cheap
 * coverage for diff() when real traffic samples are unavailable.
 */
export function probeCorpus(
  rules: readonly RoutingRule[],
  opts?: { wildcardFill?: string; depth?: number }
): RoutedMessage[] {
  const fill = opts?.wildcardFill ?? 'probe';
  const out: RoutedMessage[] = [];
  const seen = new Set<string>();
  for (const r of rules) {
    const words = r.keyPattern.split('.');
    // Expand each word: literals stay; `*`/`#` fill with `fill` (and `#` also empties).
    const expansions: string[][] = [[]];
    for (const w of words) {
      const variants = w === '*' ? [fill] : w === '#' ? [fill, ''] : [w];
      const next: string[][] = [];
      for (const e of expansions) {
        for (const v of variants) {
          next.push(v === '' ? e : [...e, v]);
        }
      }
      expansions.length = 0;
      expansions.push(...next);
    }
    // Header sweep: every distinct predicate value gets a probe.
    const headerSets: Array<Record<string, string>> = [{}];
    for (const p of r.predicates) {
      const values =
        p.kind === 'equals' ? [p.value]
        : p.kind === 'in' ? [...p.values]
        : p.kind === 'match' ? [p.pattern.replace(/\*/g, fill).replace(/\?/g, 'x')]
        : ['present']; // exists
      const next: Array<Record<string, string>> = [];
      for (const h of headerSets) {
        for (const v of values) {
          next.push({ ...h, [p.header]: v });
        }
      }
      headerSets.length = 0;
      headerSets.push(...next);
    }
    for (const e of expansions) {
      const key = e.join('.');
      for (const headers of headerSets) {
        const sig = `${key}\n${JSON.stringify(headers)}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        out.push({ routingKey: key, headers, payload: {} });
      }
    }
  }
  return out;
}
