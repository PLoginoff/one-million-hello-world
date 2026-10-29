/**
 * LinkAnalysis
 *
 * Fraud-ring detection over shared attributes: builds a bipartite graph
 * of users <-> devices/IPs/addresses and finds communities of users
 * sharing infrastructure — a classic mule/account-takeover signal.
 */

import { Transaction } from '../fraud/Types';

export type LinkAttribute = 'deviceId' | 'ipAddress' | 'merchantId';

export interface SharedAttributeCluster {
  readonly attribute: LinkAttribute;
  readonly value: string;
  readonly userIds: readonly string[];
}

export interface FraudRing {
  /** users connected by sharing at least `minShared` attributes */
  readonly userIds: readonly string[];
  readonly sharedAttributes: readonly SharedAttributeCluster[];
  /** risk score: scales with ring size and shared attributes */
  readonly riskScore: number;
}

export class LinkAnalyzer {
  private readonly transactions: Transaction[] = [];

  addTransaction(tx: Transaction): void {
    this.transactions.push(tx);
  }

  addTransactions(txs: readonly Transaction[]): void {
    this.transactions.push(...txs);
  }

  /** Groups of users sharing the same attribute value. */
  sharedAttributeClusters(
    attribute: LinkAttribute,
    minUsers = 2
  ): SharedAttributeCluster[] {
    const byValue = new Map<string, Set<string>>();
    for (const tx of this.transactions) {
      const value = tx[attribute];
      if (value === undefined) continue;
      let users = byValue.get(value);
      if (users === undefined) {
        users = new Set();
        byValue.set(value, users);
      }
      users.add(tx.userId);
    }
    const out: SharedAttributeCluster[] = [];
    for (const [value, users] of byValue) {
      if (users.size >= minUsers) {
        out.push({ attribute, value, userIds: [...users].sort() });
      }
    }
    return out;
  }

  /**
   * Find connected components in the user-user graph where edges = shared
   * attribute values. Each component of size >= minSize is a ring.
   */
  detectRings(minSize = 3, attributes: readonly LinkAttribute[] = ['deviceId', 'ipAddress']): FraudRing[] {
    // user -> set of attribute keys
    const userAttrs = new Map<string, Set<string>>();
    const attrToUsers = new Map<string, Set<string>>();
    for (const tx of this.transactions) {
      for (const attr of attributes) {
        const v = tx[attr];
        if (v === undefined) continue;
        const key = `${attr}:${v}`;
        let ua = userAttrs.get(tx.userId);
        if (ua === undefined) {
          ua = new Set();
          userAttrs.set(tx.userId, ua);
        }
        ua.add(key);
        let au = attrToUsers.get(key);
        if (au === undefined) {
          au = new Set();
          attrToUsers.set(key, au);
        }
        au.add(tx.userId);
      }
    }
    // adjacency via shared attributes
    const adjacency = new Map<string, Set<string>>();
    for (const users of attrToUsers.values()) {
      for (const u of users) {
        let adj = adjacency.get(u);
        if (adj === undefined) {
          adj = new Set();
          adjacency.set(u, adj);
        }
        for (const other of users) {
          if (other !== u) adj.add(other);
        }
      }
    }
    // connected components via BFS
    const visited = new Set<string>();
    const rings: FraudRing[] = [];
    for (const start of adjacency.keys()) {
      if (visited.has(start)) continue;
      const component: string[] = [];
      const queue = [start];
      visited.add(start);
      while (queue.length > 0) {
        const u = queue.shift()!;
        component.push(u);
        for (const v of adjacency.get(u) ?? []) {
          if (!visited.has(v)) {
            visited.add(v);
            queue.push(v);
          }
        }
      }
      if (component.length >= minSize) {
        // collect attributes shared by >= 2 members
        const memberSet = new Set(component);
        const shared: SharedAttributeCluster[] = [];
        for (const [key, users] of attrToUsers) {
          const inRing = [...users].filter((u) => memberSet.has(u));
          if (inRing.length >= 2) {
            const [attr, value] = key.split(':');
            shared.push({
              attribute: attr as LinkAttribute,
              value,
              userIds: inRing.sort(),
            });
          }
        }
        rings.push({
          userIds: component.sort(),
          sharedAttributes: shared,
          riskScore: Math.min(100, component.length * 15 + shared.length * 10),
        });
      }
    }
    return rings;
  }

  /** Risk score for a user = max ring score they belong to. */
  userRisk(userId: string, rings: readonly FraudRing[]): number {
    let max = 0;
    for (const ring of rings) {
      if (ring.userIds.includes(userId)) max = Math.max(max, ring.riskScore);
    }
    return max;
  }
}
