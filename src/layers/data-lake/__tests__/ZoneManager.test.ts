/**
 * Zone manager tests.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { LakeObjectStore, ZoneManager, zoneOfPath } from '../engine/ZoneManager';

function bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe('zoneOfPath', () => {
  it('parses zone prefix', () => {
    expect(zoneOfPath('raw/a/b')).toBe('raw');
    expect(zoneOfPath('curated/x')).toBe('curated');
    expect(zoneOfPath('nope/x')).toBeNull();
  });
});

describe('LakeObjectStore', () => {
  it('put/get/list', () => {
    const s = new LakeObjectStore();
    s.put({ path: 'raw/a', zone: 'raw', data: bytes('x'), contentType: 'text', tags: {}, createdAt: 0, updatedAt: 0, sizeBytes: 1 });
    s.put({ path: 'raw/b/c', zone: 'raw', data: bytes('y'), contentType: 'text', tags: {}, createdAt: 0, updatedAt: 0, sizeBytes: 1 });
    s.put({ path: 'staged/a', zone: 'staged', data: bytes('z'), contentType: 'text', tags: {}, createdAt: 0, updatedAt: 0, sizeBytes: 1 });
    expect(s.list('raw/').length).toBe(2);
    expect(s.listZone('staged').length).toBe(1);
    expect(s.get('raw/a')?.data[0]).toBe(120);
  });
});

describe('ZoneManager', () => {
  let store: LakeObjectStore;
  let zm: ZoneManager;

  beforeEach(() => {
    store = new LakeObjectStore();
    zm = new ZoneManager(store);
  });

  it('ingest lands valid objects in the zone', () => {
    const r = zm.ingest('raw/events/e1', bytes('{"a":1}'), 'application/json');
    expect(r.ok).toBe(true);
    expect(store.get('raw/events/e1')).toBeDefined();
  });

  it('rejects paths outside zones', () => {
    const r = zm.ingest('nowhere/x', bytes('x'));
    expect(r.ok).toBe(false);
  });

  it('promotes raw → staged → curated in order', () => {
    zm.ingest('raw/events/e1', bytes('d'));
    expect(zm.promote('raw/events/e1').ok).toBe(true);
    expect(store.get('staged/events/e1')).toBeDefined();
    expect(store.get('raw/events/e1')).toBeUndefined(); // source removed
    expect(zm.promote('staged/events/e1').ok).toBe(true);
    expect(store.get('curated/events/e1')).toBeDefined();
  });

  it('forbids skipping zones by default', () => {
    zm.ingest('raw/events/e1', bytes('d'));
    const r = zm.promote('raw/events/e1', 'curated');
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('Skipping intermediate zones');
  });

  it('allows skip when policy permits', () => {
    zm.setPolicy('raw', { validators: [], allowSkip: true });
    zm.ingest('raw/events/e1', bytes('d'));
    const r = zm.promote('raw/events/e1', 'curated');
    expect(r.ok).toBe(true);
    expect(store.get('curated/events/e1')).toBeDefined();
  });

  it('validators quarantine bad objects on ingest', () => {
    zm.setPolicy('raw', {
      validators: [
        (obj) => (obj.sizeBytes > 3 ? { ok: true, errors: [] } : { ok: false, errors: ['too small'] }),
      ],
    });
    const r = zm.ingest('raw/events/e1', bytes('ab'));
    expect(r.ok).toBe(false);
    expect(zm.quarantine.length).toBe(1);
    expect(store.get('raw/events/e1')).toBeUndefined(); // never landed
  });

  it('validators quarantine on promotion, keeping source', () => {
    zm.setPolicy('staged', {
      validators: [(obj) => (obj.contentType === 'application/json' ? { ok: true, errors: [] } : { ok: false, errors: ['not json'] })],
    });
    zm.ingest('raw/events/e1', bytes('x'), 'text/plain');
    const r = zm.promote('raw/events/e1');
    expect(r.ok).toBe(false);
    expect(store.get('raw/events/e1')).toBeDefined(); // source retained
    expect(zm.quarantine.length).toBe(1);
    expect(zm.journal[zm.journal.length - 1].ok).toBe(false);
  });

  it('enforces max object size per zone', () => {
    zm.setPolicy('staged', { validators: [], maxObjectBytes: 2 });
    zm.ingest('raw/events/e1', bytes('1234'));
    const r = zm.promote('raw/events/e1');
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('max size');
  });

  it('cannot promote from terminal zone', () => {
    zm.ingest('curated/x', bytes('d'));
    const r = zm.promote('curated/x');
    expect(r.ok).toBe(false);
  });

  it('journal records successful transitions', () => {
    zm.ingest('raw/a', bytes('d'));
    zm.promote('raw/a');
    const j = zm.journal;
    expect(j.length).toBe(1);
    expect(j[0].from).toBe('raw');
    expect(j[0].to).toBe('staged');
    expect(j[0].ok).toBe(true);
  });
});
