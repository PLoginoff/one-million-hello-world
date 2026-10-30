/**
 * Process Version Registry
 *
 * Versioned deployment of process definitions where *running instances
 * stay pinned to the definition version they started on* — the standard
 * BPMN semantic ("long-running instances must not be yanked onto a new
 * flow mid-execution").
 *
 * The registry assigns each publish a monotonically increasing
 * `version` and a derived `definitionId` (`processId@version`), deploys
 * it to the underlying {@link BpmnEngine}, and keeps a map from
 * instance -> pinned version so {@link definitionFor} always returns
 * the definition the instance is actually running — even after newer
 * versions are published.
 *
 * Publishing a new version never mutates or replaces the old entry:
 * instances started on v1 keep executing v1 forever; only NEW starts
 * (via {@link start} or explicit `startOn`) pick up the latest version.
 *
 * @module BpmnLayer/Engine2
 */

import type { BpmnEngine } from '../engines/BpmnEngine';
import { InstanceState, ProcessDefinition, ProcessInstance } from '../engines/types';
import { DefinitionVersion, IClock, SystemClock } from './types';

export class ProcessVersionRegistry {
  private readonly _engine: BpmnEngine;
  private readonly _clock: IClock;
  /** processId -> ordered version list (index = version-1). */
  private readonly _versions: Map<string, DefinitionVersion[]>;
  /** definitionId -> definition (for inspection). */
  private readonly _defs: Map<string, ProcessDefinition>;
  /** instanceId -> pinned definitionId. */
  private readonly _pinned: Map<string, string>;

  constructor(engine: BpmnEngine, clock: IClock = new SystemClock()) {
    this._engine = engine;
    this._clock = clock;
    this._versions = new Map();
    this._defs = new Map();
    this._pinned = new Map();
  }

  /**
   * Publish a new version of `processId`. The `definitionId` in `def`
   * is overridden to `processId@v{n}` so every version is a distinct
   * deployable unit on the shared engine.
   */
  publish(processId: string, def: ProcessDefinition): DefinitionVersion {
    const list = this._versions.get(processId) ?? [];
    const version = list.length + 1;
    const definitionId = `${processId}@v${version}`;
    const deployed: ProcessDefinition = { ...def, id: definitionId };
    this._engine.deploy(deployed);
    this._defs.set(definitionId, deployed);
    const rec: DefinitionVersion = {
      processId,
      version,
      definitionId,
      publishedAt: this._clock.now(),
    };
    list.push(rec);
    this._versions.set(processId, list);
    return rec;
  }

  /** Latest published version record for `processId`, or null. */
  latest(processId: string): DefinitionVersion | null {
    const list = this._versions.get(processId);
    return list && list.length > 0 ? list[list.length - 1]! : null;
  }

  /** All published versions for `processId`, oldest first. */
  versions(processId: string): DefinitionVersion[] {
    return [...(this._versions.get(processId) ?? [])];
  }

  /**
   * Start an instance on the latest version of `processId`.
   * The instance is pinned to that version's `definitionId` forever.
   */
  async start(processId: string, variables: Record<string, unknown> = {}): Promise<ProcessInstance> {
    const latest = this.latest(processId);
    if (!latest) throw new Error(`No versions published for ${processId}`);
    return this.startOn(latest.version, processId, variables);
  }

  /** Start an instance on a SPECIFIC version (explicit pin). */
  async startOn(
    version: number,
    processId: string,
    variables: Record<string, unknown> = {}
  ): Promise<ProcessInstance> {
    const list = this._versions.get(processId);
    const rec = list?.[version - 1];
    if (!rec) throw new Error(`No version ${version} for ${processId}`);
    const instance = await this._engine.start(rec.definitionId, variables);
    this._pinned.set(instance.id, rec.definitionId);
    return instance;
  }

  /** The definitionId an instance is pinned to. */
  pinnedDefinition(instanceId: string): string | null {
    return this._pinned.get(instanceId) ?? null;
  }

  /** The definition an instance is actually running on. */
  definitionFor(instanceId: string): ProcessDefinition | null {
    const did = this._pinned.get(instanceId);
    return did ? this._defs.get(did) ?? null : null;
  }

  /**
   * Live (running) instance count per version — used to check whether
   * a version can be safely retired.
   */
  instancesByVersion(processId: string): Map<number, number> {
    const out = new Map<number, number>();
    for (const [instId, did] of this._pinned.entries()) {
      if (!did.startsWith(`${processId}@v`)) continue;
      const inst = this._engine.getInstance(instId);
      if (!inst || inst.state !== InstanceState.Running) continue;
      const v = parseInt(did.slice(did.lastIndexOf('@v') + 2), 10);
      out.set(v, (out.get(v) ?? 0) + 1);
    }
    return out;
  }

  /**
   * True when no *running* instance pins `version` — safe to retire.
   * Completed/failed instances keep their pin for audit but don't
   * block retirement.
   */
  canRetire(processId: string, version: number): boolean {
    const rec = this._versions.get(processId)?.[version - 1];
    if (!rec) return false;
    for (const [instId, did] of this._pinned.entries()) {
      if (did !== rec.definitionId) continue;
      const inst = this._engine.getInstance(instId);
      if (inst && inst.state === InstanceState.Running) return false;
    }
    return true;
  }
}
