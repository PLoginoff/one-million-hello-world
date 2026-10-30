/**
 * DecoratorRegistry — central catalog of decorators plus dynamic
 * attach/detach bookkeeping for decorated targets.
 *
 * Two maps do the work:
 * - `_decorators`: name → decorator definition (the catalog).
 * - `_registrations`: registrationId → live registration holding the
 *   raw target, the proxied object, member → chain, and the decorator
 *   name list in effective order.
 *
 * Attaching rebuilds chains via `orderDecorators` so each registration
 * sees a consistent ordering snapshot; decorators registered *after*
 * attach do not retroactively appear (explicit `reattach`/`attach`
 * rebuilds). Detaching drops the registration — the proxy object
 * remains usable (its closures keep the last chains) but is no longer
 * tracked; callers should discard proxies on detach. For true
 * "unwrapping", `unwrap` returns the raw target.
 *
 * Usage statistics (invocations/skips/hook errors per decorator) are
 * fed by telemetry callbacks injected into chains at attach time.
 *
 * Complexity: attach/detach/describe are O(d) in decorator count for the
 * registration; lookups are O(1) via Map.
 *
 * @module DecoratorLayer/Engine
 */

import { DecoratorChain, orderDecorators } from './DecoratorChain';
import { ChainTelemetry, TransparentProxyFactory } from './TransparentProxyFactory';
import {
  DecoratorClock,
  DecorationMetadata,
  DecoratorUsageStats,
  IEngineDecorator,
  SystemDecoratorClock,
} from './types';
import { DecoratorError } from '../utils/DecoratorError';

export interface DecoratorRegistryOptions {
  readonly clock?: DecoratorClock;
  readonly tolerateMissingDependencies?: boolean;
}

interface Registration {
  readonly id: string;
  readonly targetLabel: string;
  readonly target: object;
  readonly proxy: object;
  readonly decoratorNames: string[];
  readonly members: Record<string, readonly string[]>;
  readonly attachedAt: number;
}

/**
 * Catalog of decorators + live attachment state.
 */
export class DecoratorRegistry {
  private readonly _clock: DecoratorClock;
  private readonly _tolerateMissing: boolean;
  private readonly _decorators: Map<string, IEngineDecorator>;
  private readonly _registrations: Map<string, Registration>;
  private readonly _stats: Map<string, { invocations: number; skipped: number; hookErrors: number }>;
  private _seq: number;

  constructor(options: DecoratorRegistryOptions = {}) {
    this._clock = options.clock ?? new SystemDecoratorClock();
    this._tolerateMissing = options.tolerateMissingDependencies ?? true;
    this._decorators = new Map();
    this._registrations = new Map();
    this._stats = new Map();
    this._seq = 0;
  }

  /* ---------------------------------------------------------------- */
  /* Catalog                                                           */
  /* ---------------------------------------------------------------- */

  /** Add a decorator to the catalog. Throws on duplicate names. */
  register(decorator: IEngineDecorator): void {
    if (this._decorators.has(decorator.name)) {
      throw new DecoratorError(
        'DUPLICATE_DECORATOR',
        `Decorator '${decorator.name}' is already registered`,
        409
      );
    }
    this._decorators.set(decorator.name, decorator);
    this._stats.set(decorator.name, { invocations: 0, skipped: 0, hookErrors: 0 });
  }

  /** Idempotent variant of {@link register}. Returns true if added. */
  registerIfAbsent(decorator: IEngineDecorator): boolean {
    if (this._decorators.has(decorator.name)) {
      return false;
    }
    this.register(decorator);
    return true;
  }

  /**
   * Remove a decorator from the catalog. Existing registrations keep
   * their built chains (ordering snapshot semantics); call
   * {@link reattach} to rebuild them without the removed decorator.
   * Returns false if the decorator was in use or unknown.
   */
  unregister(name: string): boolean {
    for (const reg of this._registrations.values()) {
      if (reg.decoratorNames.includes(name)) {
        return false; // still attached somewhere
      }
    }
    this._stats.delete(name);
    return this._decorators.delete(name);
  }

  has(name: string): boolean {
    return this._decorators.has(name);
  }

  get(name: string): IEngineDecorator | undefined {
    return this._decorators.get(name);
  }

  /** Catalog names, in registration order. */
  listNames(): string[] {
    return [...this._decorators.keys()];
  }

  /** `dependsOn` names referenced by `name` but absent from catalog. */
  listMissing(name: string): string[] {
    const d = this._decorators.get(name);
    if (!d) {
      return [];
    }
    return (d.dependsOn ?? []).filter((dep) => !this._decorators.has(dep));
  }

  /* ---------------------------------------------------------------- */
  /* Attach / detach                                                   */
  /* ---------------------------------------------------------------- */

  /**
   * Decorate `target`'s methods with the named decorators.
   *
   * @param target    object whose methods get wrapped
   * @param names     catalog names to apply; effective order computed
   *                  by priority+dependency sort
   * @param members   restrict decoration to these member names; omit to
   *                  decorate every method
   * @param label     introspection label (defaults to constructor name)
   * @returns the transparent proxy — same interface as `target`
   */
  attach<T extends object>(
    target: T,
    names: readonly string[],
    members?: readonly string[],
    label?: string
  ): T {
    const decorators = names.map((n) => {
      const d = this._decorators.get(n);
      if (!d) {
        throw DecoratorError.notFound(`Decorator '${n}' is not registered`);
      }
      return d;
    });
    const ordered = orderDecorators(decorators, this._tolerateMissing);

    const telemetry: ChainTelemetry = {
      onApplied: (n) => this._bump(n, 'invocations'),
      onSkipped: (n) => this._bump(n, 'skipped'),
      onHookError: (n) => this._bump(n, 'hookErrors'),
    };
    const factory = new TransparentProxyFactory(this._clock, telemetry);

    // Build one chain per decorated member. When `members` is omitted we
    // decorate every function property reachable on the target.
    const memberNames = members ?? this._discoverMethods(target);
    const chains = new Map<string, DecoratorChain>();
    const memberRecord: Record<string, readonly string[]> = {};
    for (const m of memberNames) {
      const chain = new DecoratorChain(m, ordered);
      chains.set(m, chain);
      memberRecord[m] = chain.decoratorNames;
    }

    const proxy = factory.wrap(target, chains, {
      members: memberNames,
      metadata: { registrationLabel: label ?? target.constructor?.name ?? 'object' },
      telemetry,
    });

    const id = `reg-${++this._seq}`;
    this._registrations.set(id, {
      id,
      targetLabel: label ?? target.constructor?.name ?? 'object',
      target,
      proxy,
      decoratorNames: ordered.map((d) => d.name),
      members: memberRecord,
      attachedAt: this._clock.now(),
    });
    // Remember which registration id owns this proxy for detach(proxy).
    this._proxyIds.set(proxy, id);
    return proxy;
  }

  /**
   * Detach by proxy (or registration id via {@link detachById}).
   * Returns the raw target so callers can continue undecorated, or
   * undefined if the proxy isn't tracked.
   */
  detach<T extends object>(proxy: T): T | undefined {
    const id = this._proxyIds.get(proxy);
    if (!id) {
      return undefined;
    }
    const reg = this._registrations.get(id);
    this._registrations.delete(id);
    this._proxyIds.delete(proxy);
    return reg?.target as T | undefined;
  }

  /** Detach by registration id. Returns the raw target or undefined. */
  detachById<T extends object>(registrationId: string): T | undefined {
    const reg = this._registrations.get(registrationId);
    if (!reg) {
      return undefined;
    }
    this._registrations.delete(registrationId);
    this._proxyIds.delete(reg.proxy);
    return reg.target as T;
  }

  /** Number of live registrations. */
  get registrationCount(): number {
    return this._registrations.size;
  }

  private readonly _proxyIds: Map<object, string> = new Map();

  /* ---------------------------------------------------------------- */
  /* Introspection                                                     */
  /* ---------------------------------------------------------------- */

  /** Metadata for every live registration. */
  describe(): DecorationMetadata[] {
    return [...this._registrations.values()].map((r) => ({
      registrationId: r.id,
      targetLabel: r.targetLabel,
      decorators: r.decoratorNames,
      members: r.members,
      attachedAt: r.attachedAt,
    }));
  }

  /** Which registrations currently use decorator `name`. */
  usedBy(name: string): string[] {
    const out: string[] = [];
    for (const reg of this._registrations.values()) {
      if (reg.decoratorNames.includes(name)) {
        out.push(reg.id);
      }
    }
    return out;
  }

  /** Per-decorator usage statistics. */
  usageStats(): DecoratorUsageStats[] {
    const counts = new Map<string, number>();
    for (const reg of this._registrations.values()) {
      for (const n of reg.decoratorNames) {
        counts.set(n, (counts.get(n) ?? 0) + 1);
      }
    }
    const out: DecoratorUsageStats[] = [];
    for (const name of this._decorators.keys()) {
      const s = this._stats.get(name) ?? { invocations: 0, skipped: 0, hookErrors: 0 };
      out.push({
        name,
        registrations: counts.get(name) ?? 0,
        invocations: s.invocations,
        skipped: s.skipped,
        hookErrors: s.hookErrors,
      });
    }
    return out;
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                         */
  /* ---------------------------------------------------------------- */

  private _bump(name: string, field: 'invocations' | 'skipped' | 'hookErrors'): void {
    const s = this._stats.get(name);
    if (s) {
      s[field] += 1;
    }
  }

  /**
   * Walk the prototype chain collecting method names. Skips the
   * constructor and anything on Object.prototype.
   */
  private _discoverMethods(target: object): string[] {
    const names = new Set<string>();
    let proto: object | null = target;
    while (proto && proto !== Object.prototype) {
      for (const key of Object.getOwnPropertyNames(proto)) {
        if (key === 'constructor') continue;
        const desc = Object.getOwnPropertyDescriptor(proto, key);
        if (desc && typeof desc.value === 'function') {
          names.add(key);
        }
      }
      proto = Object.getPrototypeOf(proto) as object | null;
    }
    return [...names];
  }
}
