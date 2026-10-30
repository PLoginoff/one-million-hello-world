/**
 * Workflow Engine — Version Registry
 *
 * Stores workflow definitions by (id, version) with pinned-resolution
 * semantics for running instances:
 *
 *  - `register(def)` — publish a definition. Same (id, version) cannot be
 *    republished; definitions are immutable once registered.
 *  - `start(workflowId)` — resolves the *default* version at start time
 *    and PINS it on the instance. Once an instance starts on v1, it runs
 *    v1 to completion even after v2 is published — the classic "running
 *    on old, new on new" behavior.
 *  - `setDefault(workflowId, version)` — new instances resolve to this
 *    version; in-flight instances are untouched.
 *  - `instances` — tracks which version each instance is pinned to, so
 *    `instancesByVersion(workflowId)` answers "how many runs still on
 *    the old version?" before deprecating it.
 *  - `deprecate(workflowId, version)` — refuses while in-flight
 *    instances pin that version, unless `force`.
 *
 * The registry stores definitions only — execution stays in whatever
 * runtime consumes {@link WorkflowDefinition}s.
 *
 * @module WorkflowEngine/Engine2
 */

import { WorkflowDefinition, validateDefinition } from '../domain/workflow-model';

export class WorkflowVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowVersionError';
  }
}

export interface InstancePin {
  readonly instanceId: string;
  readonly workflowId: string;
  readonly version: string;
  readonly startedAt: number;
  finishedAt?: number;
  status: 'running' | 'completed' | 'failed' | 'terminated';
}

export class WorkflowVersionRegistry {
  private readonly _clock: () => number;
  /** workflowId → version → definition */
  private readonly _defs = new Map<string, Map<string, WorkflowDefinition>>();
  /** workflowId → default version */
  private readonly _defaults = new Map<string, string>();
  /** instanceId → pin */
  private readonly _pins = new Map<string, InstancePin>();
  /** Deprecated (id@version) — can still finish in-flight, no new starts. */
  private readonly _deprecated = new Set<string>();

  constructor(clock: () => number = Date.now) {
    this._clock = clock;
  }

  private _key(workflowId: string, version: string): string {
    return `${workflowId}@${version}`;
  }

  /** Publish a definition. Validates shape; version must be new. */
  register(def: WorkflowDefinition): WorkflowDefinition {
    const problems = validateDefinition(def);
    if (problems.length > 0) {
      throw new WorkflowVersionError(`invalid definition ${def.id}@${def.version}: ${problems.join('; ')}`);
    }
    let versions = this._defs.get(def.id);
    if (!versions) {
      versions = new Map();
      this._defs.set(def.id, versions);
    }
    if (versions.has(def.version)) {
      throw new WorkflowVersionError(`${def.id}@${def.version} already registered`);
    }
    versions.set(def.version, Object.freeze({ ...def }) as WorkflowDefinition);
    // First registered version becomes default; later versions do not
    // silently change the default — setDefault is explicit.
    if (!this._defaults.has(def.id)) {
      this._defaults.set(def.id, def.version);
    }
    return def;
  }

  /** Default version for new instances of `workflowId`. */
  defaultVersion(workflowId: string): string | undefined {
    return this._defaults.get(workflowId);
  }

  /** Point new-instance resolution at `version`. */
  setDefault(workflowId: string, version: string): void {
    if (!this._defs.get(workflowId)?.has(version)) {
      throw new WorkflowVersionError(`unknown version ${workflowId}@${version}`);
    }
    this._defaults.set(workflowId, version);
  }

  /**
   * Resolve the definition for a NEW instance — the current default
   * unless `version` is given. Throws for deprecated/unknown versions.
   */
  resolveForStart(workflowId: string, version?: string): WorkflowDefinition {
    const v = version ?? this._defaults.get(workflowId);
    if (!v) throw new WorkflowVersionError(`no versions registered for '${workflowId}'`);
    if (this._deprecated.has(this._key(workflowId, v))) {
      throw new WorkflowVersionError(`${workflowId}@${v} is deprecated — no new instances`);
    }
    const def = this._defs.get(workflowId)?.get(v);
    if (!def) throw new WorkflowVersionError(`unknown version ${workflowId}@${v}`);
    return def;
  }

  /**
   * Resolve the definition for an EXISTING instance — returns the pinned
   * version, ignoring the current default. This is what keeps running
   * instances on their original version.
   */
  resolveForInstance(instanceId: string): WorkflowDefinition {
    const pin = this._pins.get(instanceId);
    if (!pin) throw new WorkflowVersionError(`unknown instance '${instanceId}'`);
    const def = this._defs.get(pin.workflowId)?.get(pin.version);
    if (!def) {
      throw new WorkflowVersionError(
        `pinned version ${pin.workflowId}@${pin.version} no longer registered`
      );
    }
    return def;
  }

  /** Pin a new instance to the resolved definition. Returns the pin. */
  pinInstance(instanceId: string, workflowId: string, version?: string): InstancePin {
    const def = this.resolveForStart(workflowId, version);
    if (this._pins.has(instanceId)) {
      throw new WorkflowVersionError(`instance '${instanceId}' already pinned`);
    }
    const pin: InstancePin = {
      instanceId,
      workflowId,
      version: def.version,
      startedAt: this._clock(),
      status: 'running',
    };
    this._pins.set(instanceId, pin);
    return pin;
  }

  /** Mark an instance finished (completed/failed/terminated). */
  finishInstance(instanceId: string, status: 'completed' | 'failed' | 'terminated'): void {
    const pin = this._pins.get(instanceId);
    if (!pin) throw new WorkflowVersionError(`unknown instance '${instanceId}'`);
    pin.status = status;
    pin.finishedAt = this._clock();
  }

  pinOf(instanceId: string): InstancePin | undefined {
    return this._pins.get(instanceId);
  }

  /** Instances (running or finished) pinned to a version — deprecation check. */
  instancesByVersion(workflowId: string, version: string): ReadonlyArray<InstancePin> {
    return [...this._pins.values()].filter(
      (p) => p.workflowId === workflowId && p.version === version
    );
  }

  /** In-flight instances still pinned to `version`. */
  runningOnVersion(workflowId: string, version: string): ReadonlyArray<InstancePin> {
    return this.instancesByVersion(workflowId, version).filter((p) => p.status === 'running');
  }

  /**
   * Deprecate a version: blocks new starts, lets in-flight finish.
   * Throws when running instances exist unless `force` (which orphans
   * them — resolveForInstance still works since defs aren't deleted).
   */
  deprecate(workflowId: string, version: string, force = false): void {
    if (!this._defs.get(workflowId)?.has(version)) {
      throw new WorkflowVersionError(`unknown version ${workflowId}@${version}`);
    }
    const running = this.runningOnVersion(workflowId, version);
    if (running.length > 0 && !force) {
      throw new WorkflowVersionError(
        `cannot deprecate ${workflowId}@${version}: ${running.length} instance(s) still running`
      );
    }
    this._deprecated.add(this._key(workflowId, version));
    // If the default was deprecated, promote the newest non-deprecated.
    if (this._defaults.get(workflowId) === version) {
      const candidates = [...(this._defs.get(workflowId)?.keys() ?? [])].filter(
        (v) => !this._deprecated.has(this._key(workflowId, v))
      );
      if (candidates.length > 0) {
        this._defaults.set(workflowId, candidates[candidates.length - 1]);
      }
    }
  }

  /** All registered versions of a workflow, in registration order. */
  versionsOf(workflowId: string): ReadonlyArray<string> {
    return [...(this._defs.get(workflowId)?.keys() ?? [])];
  }
}
