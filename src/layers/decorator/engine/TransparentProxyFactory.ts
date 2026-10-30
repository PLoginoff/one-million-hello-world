/**
 * TransparentProxyFactory — Proxy-based decoration that preserves the
 * wrapped interface type.
 *
 * `wrap<T>(target)` returns a `T` — the caller cannot distinguish the
 * proxy from the original at the type level, which is the whole point of
 * transparent decoration.
 *
 * Interception strategy:
 * - Method-valued properties are wrapped so invocation flows through a
 *   per-member `DecoratorChain`.
 * - Non-function properties pass through untouched (get/set/ownKeys/
 *   getOwnPropertyDescriptor traps all forward) so identity-sensitive
 *   behavior like `instanceof`, property enumeration, and private field
 *   access on the raw target still work — the proxy's `this` receiver is
 *   rebound to the target for plain-function invocation to avoid
 *   `this`-aliasing bugs with private state.
 * - `wrapFunction` handles bare functions via the `apply` trap.
 *
 * Tradeoff note: private *fields* (#x) inside methods still resolve
 * against the *target* because we invoke methods with `target` as
 * receiver, never the proxy — this is deliberately the safest option.
 * The cost: virtual dispatch (`this.otherMethod()` inside a method)
 * bypasses the chain for the nested call. Documented limitation.
 *
 * @module DecoratorLayer/Engine
 */

import { DecoratorChain, MaybeAsyncTrace } from './DecoratorChain';
import { DecoratorClock, SystemDecoratorClock } from './types';

/** Callback the registry uses to keep per-decorator usage stats. */
export interface ChainTelemetry {
  onApplied?: (name: string) => void;
  onSkipped?: (name: string) => void;
  onHookError?: (name: string) => void;
}

/** Options for wrapping. */
export interface WrapOptions {
  /**
   * Members to decorate. When omitted, every own+inherited function
   * property is decorated. When provided, only listed members are.
   */
  readonly members?: readonly string[];
  /** Opaque metadata copied to every invocation context. */
  readonly metadata?: Record<string, unknown>;
  readonly telemetry?: ChainTelemetry;
}

type AnyFunction = (...args: unknown[]) => unknown;

/**
 * Creates proxies that route method calls through decorator chains.
 */
export class TransparentProxyFactory {
  private readonly _clock: DecoratorClock;
  private readonly _telemetry: ChainTelemetry | undefined;

  constructor(clock?: DecoratorClock, telemetry?: ChainTelemetry) {
    this._clock = clock ?? new SystemDecoratorClock();
    this._telemetry = telemetry;
  }

  /**
   * Wrap an object so listed (or all) methods run through their chains.
   *
   * The returned proxy satisfies `T`; members without a chain behave
   * exactly as on the raw target.
   *
   * @param target   object to decorate
   * @param chains   member name → built chain
   */
  wrap<T extends object>(
    target: T,
    chains: ReadonlyMap<string, DecoratorChain>,
    options: WrapOptions = {}
  ): T {
    const clock = this._clock;
    const telemetry = options.telemetry ?? this._telemetry;
    const memberFilter = options.members ? new Set(options.members) : undefined;

    const handler: ProxyHandler<T> = {
      get(t: T, prop: string | symbol, _receiver: unknown): unknown {
        const value = Reflect.get(t, prop) as unknown;
        if (typeof prop !== 'string' || typeof value !== 'function') {
          return value;
        }
        if (memberFilter && !memberFilter.has(prop)) {
          // Return bound to target so private-state access still works.
          return (value as AnyFunction).bind(t);
        }
        const chain = chains.get(prop);
        if (!chain || chain.size === 0) {
          return (value as AnyFunction).bind(t);
        }
        // Wrap the method: invoke chain, rebind receiver to the raw
        // target so `#private` fields resolve correctly. The chain's
        // maybe-sync return lets fully-synchronous chains preserve the
        // method's sync signature; any async hook (or predicate)
        // transparently yields a Promise to the caller instead.
        return (...args: readonly unknown[]) =>
          unpack(
            chain.invoke(
              (a: readonly unknown[]) =>
                Reflect.apply(value as AnyFunction, t, a as unknown[]),
              args,
              clock.now(),
              options.metadata ?? {},
              tel(telemetry)
            )
          );
      },
      // Remaining traps forward verbatim — enumeration, descriptors,
      // prototype checks all behave as on the raw target.
      getPrototypeOf(t: T): object | null {
        return Reflect.getPrototypeOf(t);
      },
      setPrototypeOf(t: T, proto: object | null): boolean {
        return Reflect.setPrototypeOf(t, proto);
      },
      isExtensible(t: T): boolean {
        return Reflect.isExtensible(t);
      },
      preventExtensions(t: T): boolean {
        return Reflect.preventExtensions(t);
      },
      getOwnPropertyDescriptor(
        t: T,
        prop: string | symbol
      ): PropertyDescriptor | undefined {
        return Reflect.getOwnPropertyDescriptor(t, prop);
      },
      defineProperty(
        t: T,
        prop: string | symbol,
        descriptor: PropertyDescriptor
      ): boolean {
        return Reflect.defineProperty(t, prop, descriptor);
      },
      has(t: T, prop: string | symbol): boolean {
        return Reflect.has(t, prop);
      },
      set(t: T, prop: string | symbol, value: unknown): boolean {
        return Reflect.set(t, prop, value);
      },
      deleteProperty(t: T, prop: string | symbol): boolean {
        return Reflect.deleteProperty(t, prop);
      },
      ownKeys(t: T): ArrayLike<string | symbol> {
        return Reflect.ownKeys(t);
      },
    };
    return new Proxy(target, handler);
  }

  /**
   * Wrap a bare function. The `apply` trap routes each call through the
   * supplied chain under the member name 'apply'.
   */
  wrapFunction<F extends AnyFunction>(
    fn: F,
    chain: DecoratorChain,
    options: WrapOptions = {}
  ): F {
    const clock = this._clock;
    const telemetry = options.telemetry ?? this._telemetry;
    const handler: ProxyHandler<F> = {
      apply(t: F, thisArg: unknown, args: readonly unknown[]): unknown {
        return unpack(
          chain.invoke(
            (a: readonly unknown[]) =>
              Reflect.apply(t as AnyFunction, thisArg, a as unknown[]),
            args,
            clock.now(),
            options.metadata ?? {},
            tel(telemetry)
          )
        );
      },
    };
    return new Proxy(fn, handler);
  }
}

/** Unpack a maybe-async trace into a value-or-throw, maybe async. */
function unpack(r: MaybeAsyncTrace<unknown>): unknown {
  if (isThenable(r)) {
    return r.then((trace) => {
      if (trace.success) {
        return trace.value;
      }
      throw trace.error;
    });
  }
  if (r.success) {
    return r.value;
  }
  throw r.error;
}

function tel(t: ChainTelemetry | undefined): ChainTelemetry {
  return t ?? {};
}

function isThenable(v: unknown): v is PromiseLike<unknown> {
  return (
    (typeof v === 'object' || typeof v === 'function') &&
    v !== null &&
    typeof (v as { then?: unknown }).then === 'function'
  );
}
