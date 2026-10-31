/**
 * Tests for AnchorRegistry: coverage lookups, gap analysis, conflict
 * detection and linkage verification.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { AuditStore } from '../../engine/AuditStore';
import { sealRecord, GENESIS_HASH } from '../../engine/HashChain';
import type { AuditRecord } from '../../engine/types';
import { Notarizer, InMemoryAnchorService } from '../Notarizer';
import { AnchorRegistry } from '../AnchorRegistry';
import { ManualAuditClock3, NotarizationAnchor } from '../types3';

function chain(n: number, startSeq = 1): AuditRecord[] {
  const out: AuditRecord[] = [];
  let prev = GENESIS_HASH;
  for (let i = 0; i < n; i++) {
    const seq = startSeq + i;
    const r = sealRecord(
      { actor: `u${seq}`, action: 'a', timestamp: seq * 10 },
      { seq, id: `r${seq}`, previousHash: prev, timestamp: seq * 10, tier: 'hot' }
    );
    out.push(r);
    prev = r.hash;
  }
  return out;
}

describe('AnchorRegistry', () => {
  let clock: ManualAuditClock3;
  let registry: AnchorRegistry;
  let notarizer: Notarizer;

  beforeEach(() => {
    clock = new ManualAuditClock3(0);
    registry = new AnchorRegistry({ clock });
    notarizer = new Notarizer({ clock, service: new InMemoryAnchorService() });
  });

  it('registers anchors and finds coverage by seq', async () => {
    const a1 = await notarizer.anchorRange(chain(10, 1));
    const a2 = await notarizer.anchorRange(chain(10, 11));
    registry.register(a1);
    registry.register(a2);
    expect(registry.covering(5).length).toBe(1);
    expect(registry.covering(15)[0]!.seq).toBe(2);
    expect(registry.covering(99)).toEqual([]);
  });

  it('re-registering the same anchor is idempotent', async () => {
    const a = await notarizer.anchorRange(chain(5));
    const r1 = registry.register(a);
    const r2 = registry.register(a);
    expect(r1).toBe(r2);
    expect(registry.stats().anchors).toBe(1);
  });

  it('same range different root is a conflict, not a rejection', async () => {
    const a = await notarizer.anchorRange(chain(5));
    registry.register(a);
    const forged: NotarizationAnchor = { ...a, merkleRoot: 'f'.repeat(64), anchorHash: 'e'.repeat(64) };
    registry.register(forged);
    expect(registry.conflictList().length).toBe(1);
    expect(registry.conflictList()[0]!.incoming.merkleRoot).toBe('f'.repeat(64));
    expect(registry.stats().anchors).toBe(2); // both registered — the conflict is evidence
  });

  it('gaps report unanchored ranges', async () => {
    const a1 = await notarizer.anchorRange(chain(10, 1));
    const a2 = await notarizer.anchorRange(chain(10, 20));
    registry.register(a1);
    registry.register(a2);
    expect(registry.gaps(40)).toEqual([
      { fromSeq: 11, toSeq: 19 },
      { fromSeq: 30, toSeq: 40 },
    ]);
  });

  it('overlapping anchors merge for gap analysis', async () => {
    const a1 = await notarizer.anchorRange(chain(10, 1));
    const a2 = await notarizer.anchorRange(chain(10, 5)); // overlaps
    registry.register(a1);
    registry.register(a2);
    expect(registry.gaps(20)).toEqual([{ fromSeq: 15, toSeq: 20 }]);
  });

  it('verifyLinkage flags anchors with missing predecessors', async () => {
    const a1 = await notarizer.anchorRange(chain(5, 1));
    const a2 = await notarizer.anchorRange(chain(5, 6));
    const a3 = await notarizer.anchorRange(chain(5, 11));
    registry.register(a1);
    registry.register(a2);
    registry.register(a3);
    expect(registry.verifyLinkage().ok).toBe(true);

    // Register a foreign anchor whose prev-hash matches nothing.
    const foreign: NotarizationAnchor = {
      ...a3,
      seq: 99,
      previousAnchorHash: 'f'.repeat(64),
      fromSeq: 100,
      toSeq: 105,
    };
    registry.register(foreign);
    const check = registry.verifyLinkage();
    expect(check.ok).toBe(false);
    expect(check.unlinked).toEqual([99]);
  });

  it('stats aggregate anchors, coverage and sources', async () => {
    const a = await notarizer.anchorRange(chain(10));
    registry.register(a, 'local');
    registry.register(a, 'witness-eu'); // idempotent — same key
    const forged: NotarizationAnchor = { ...a, merkleRoot: 'x'.repeat(64), anchorHash: 'y'.repeat(64), fromSeq: 20, toSeq: 30 };
    registry.register(forged, 'witness-eu');
    const s = registry.stats(30);
    expect(s.anchors).toBe(2);
    expect(s.sources).toEqual(['local', 'witness-eu']);
    expect(s.coveredSeqs).toBe(21); // [1..10] + [20..30]
    expect(s.fullyCovered).toBe(false); // gap 11..19
    expect(registry.stats(10).fullyCovered).toBe(true);
  });

  it('list returns anchors sorted by range', async () => {
    const a2 = await notarizer.anchorRange(chain(5, 10));
    const a1 = await notarizer.anchorRange(chain(5, 1));
    registry.register(a2);
    registry.register(a1);
    const list = registry.list();
    expect(list[0]!.anchor.fromSeq).toBe(1);
    expect(list[1]!.anchor.fromSeq).toBe(10);
  });
});
