/**
 * In-Memory Live Store
 *
 * The "cluster" the GitOps engine reconciles against — a stand-in for a
 * real K8s API / cloud control plane. Specs are deep-copied on write so
 * later mutations of the desired revision can't alias into live state.
 *
 * @module GitopsLayer/Engines
 */

import { LiveStore, ResourceSpec } from './types';

export class InMemoryLiveStore implements LiveStore {
  private readonly _store: Map<string, ResourceSpec>;

  constructor() {
    this._store = new Map();
  }

  get(key: string): ResourceSpec | null {
    const r = this._store.get(key);
    return r ? { ...r, spec: structuredClone(r.spec), dependsOn: [...r.dependsOn] } : null;
  }

  set(key: string, spec: ResourceSpec): void {
    this._store.set(key, {
      kind: spec.kind,
      name: spec.name,
      spec: structuredClone(spec.spec),
      dependsOn: [...spec.dependsOn],
      wave: spec.wave,
    });
  }

  delete(key: string): boolean {
    return this._store.delete(key);
  }

  keys(): string[] {
    return [...this._store.keys()];
  }

  /** Direct mutation for simulating out-of-band drift in tests. */
  seed(spec: ResourceSpec): void {
    this.set(`${spec.kind}/${spec.name}`, spec);
  }
}
