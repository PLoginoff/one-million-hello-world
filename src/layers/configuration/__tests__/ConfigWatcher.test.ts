/**
 * Configuration Engine — ConfigWatcher tests.
 */

import { describe, it, expect } from 'bun:test';
import { ConfigEngine, ConfigPrecedence, ConfigWatcher } from '../engine';
import type { ConfigSource } from '../engine';

class PollableSource implements ConfigSource {
  readonly name = 'pollable';
  readonly precedence = ConfigPrecedence.REMOTE;
  entries: Record<string, string> = {};
  failTimes = 0;
  private _calls = 0;

  load(): Record<string, string> {
    this._calls++;
    if (this.failTimes > 0) {
      this.failTimes--;
      throw new Error('remote unavailable');
    }
    return this.entries;
  }

  fingerprint(): string {
    if (this.failTimes > 0) throw new Error('remote unavailable');
    return JSON.stringify(this.entries);
  }
}

describe('ConfigWatcher', () => {
  it('triggers reload only when fingerprint changes', async () => {
    const engine = new ConfigEngine();
    engine.addLayer('defaults', ConfigPrecedence.DEFAULTS, { k: 'v0' });
    const src = new PollableSource();
    src.entries = { k: 'v1' };
    engine.registerSource(src);
    await engine.reload();

    const watcher = new ConfigWatcher(engine);
    watcher.watchSource(src);

    // First poll: baseline fingerprint, no reload.
    expect(await watcher.pollOnce(1000)).toBe(false);

    src.entries = { k: 'v2' };
    expect(await watcher.pollOnce(2000)).toBe(true);
    expect(engine.effective.getString('k')).toBe('v2');
    expect(watcher.reloadCount).toBe(1);

    // Same fingerprint → no reload.
    expect(await watcher.pollOnce(3000)).toBe(false);
    expect(watcher.reloadCount).toBe(1);
  });

  it('backs off failing sources and keeps last fingerprint', async () => {
    const engine = new ConfigEngine();
    engine.addLayer('defaults', ConfigPrecedence.DEFAULTS, { k: 'v0' });
    const src = new PollableSource();
    src.entries = { k: 'v1' };
    engine.registerSource(src);
    await engine.reload();

    const errors: Array<[string, number]> = [];
    const watcher = new ConfigWatcher(engine, {
      pollIntervalMs: 100,
      onSourceError: (name, _e, n) => errors.push([name, n]),
    });
    watcher.watchSource(src);
    await watcher.pollOnce(1000); // baseline

    src.failTimes = 2;
    src.entries = { k: 'v2' };
    // Fingerprint call fails → no change detected, retry deferred.
    await watcher.pollOnce(2000);
    expect(engine.effective.getString('k')).toBe('v1');
    expect(errors.length).toBe(1);

    // Still in backoff window at 2000+100 → skipped (no new error recorded).
    await watcher.pollOnce(2050);
    expect(errors.length).toBe(1);
  });
});
