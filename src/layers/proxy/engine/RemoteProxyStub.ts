/**
 * RemoteProxyStub
 *
 * Client-side stub for the Remote Proxy pattern: every invocation is
 * marshalled into a `WireRequest`, handed to a pluggable `Transport`
 * (the simulated "network hop"), and the `WireResponse` is unmarshalled
 * back into a local value or a `RemoteInvocationError`.
 *
 * `LocalTransport` completes the loop in-process: it decodes the request,
 * invokes the real object, and re-encodes the result — faithfully
 * reproducing serialize → transport → deserialize → invoke → serialize
 * → transport → deserialize, including failure propagation across the wire.
 *
 * Serialization contract: arguments and return values must be JSON-safe
 * (the default `JsonSerializer` round-trips through JSON.stringify/parse,
 * so non-JSON values degrade exactly like a real JSON-RPC channel).
 * `Date`, `undefined`, functions etc. survive only via a custom
 * `Serializer` — mirroring real remoting constraints.
 *
 * Resilience: optional request timeout (Promise.race, no timers needed —
 * uses clock injection for testing) and per-call correlation ids.
 *
 * @module ProxyLayer/Engine
 */

import {
  RemoteInvocationError,
  Serializer,
  Transport,
  WireRequest,
  WireResponse,
} from './types';

/**
 * JSON-safe serializer. Round-trips args through JSON semantics so tests
 * observe the same fidelity constraints as real RPC.
 */
export class JsonSerializer implements Serializer {
  readonly format = 'json';

  encode(args: readonly unknown[]): readonly unknown[] {
    // deep-copy via JSON — drops functions/undefined fields exactly like wire
    return JSON.parse(JSON.stringify(args)) as readonly unknown[];
  }

  decodeValue(value: unknown): unknown {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }
}

/**
 * Identity serializer for tests that need to pass non-JSON values.
 */
export class IdentitySerializer implements Serializer {
  readonly format = 'identity';
  encode(args: readonly unknown[]): readonly unknown[] {
    return args;
  }
  decodeValue(value: unknown): unknown {
    return value;
  }
}

/**
 * Options for RemoteProxyStub.
 */
export interface RemoteStubOptions {
  readonly serializer?: Serializer;
  /**
   * Abort invocations pending longer than this many ms. Implemented as a
   * real `setTimeout` racing the transport promise — the timeout is a
   * wall-clock guarantee, so a frozen fake clock never stalls it.
   * Default: no timeout.
   */
  readonly timeoutMs?: number;
  /** Correlation id factory; default is a monotonic counter. */
  readonly nextId?: () => string;
}

export class RemoteProxyStub {
  private readonly _transport: Transport;
  private readonly _serializer: Serializer;
  private readonly _timeoutMs: number | null;
  private readonly _nextId: () => string;

  private _requestsSent: number;
  private _responsesOk: number;
  private _responsesFailed: number;

  constructor(transport: Transport, options: RemoteStubOptions = {}) {
    this._transport = transport;
    this._serializer = options.serializer ?? new JsonSerializer();
    this._timeoutMs = options.timeoutMs ?? null;
    this._nextId = options.nextId ?? defaultIdGenerator();
    this._requestsSent = 0;
    this._responsesOk = 0;
    this._responsesFailed = 0;
  }

  /** Wire-level counters for introspection. */
  get counters(): { sent: number; ok: number; failed: number } {
    return { sent: this._requestsSent, ok: this._responsesOk, failed: this._responsesFailed };
  }

  /**
   * Marshals and sends one remote invocation.
   *
   * @throws RemoteInvocationError on a non-ok wire response.
   * @throws Error('Remote invocation timed out') on timeout.
   */
  async invoke<R = unknown>(method: string, args: readonly unknown[] = []): Promise<R> {
    const request: WireRequest = {
      id: this._nextId(),
      method,
      args: this._serializer.encode(args),
      format: this._serializer.format,
    };

    this._requestsSent += 1;
    const response = await this._send(request);

    if (!response.ok) {
      this._responsesFailed += 1;
      throw new RemoteInvocationError(response.error?.name ?? 'RemoteError', response.error?.message ?? 'unknown');
    }
    this._responsesOk += 1;
    return this._serializer.decodeValue(response.value) as R;
  }

  private async _send(request: WireRequest): Promise<WireResponse> {
    if (this._timeoutMs === null) {
      return this._transport.send(request);
    }
    const timeoutMs = this._timeoutMs;
    const response = await Promise.race<WireResponse | 'TIMEOUT'>([
      this._transport.send(request),
      new Promise<'TIMEOUT'>((resolve) => {
        setTimeout(() => resolve('TIMEOUT'), timeoutMs);
      }),
    ]);
    if (response === 'TIMEOUT') {
      this._responsesFailed += 1;
      throw new Error(`Remote invocation '${request.method}' timed out after ${timeoutMs}ms`);
    }
    return response;
  }
}

function defaultIdGenerator(): () => string {
  let counter = 0;
  return () => `req-${++counter}`;
}

// ---------------------------------------------------------------------------
// In-process "network" implementation
// ---------------------------------------------------------------------------

/**
 * Options for LocalTransport.
 */
export interface LocalTransportOptions {
  /** Artificial latency injected per request (real ms, via setTimeout). */
  readonly latencyMs?: number;
  /** Serializer used to decode args / encode results (must match the stub). */
  readonly serializer?: Serializer;
  /**
   * Failure injection: probability in [0,1] that a request is "lost"
   * (transport-level failure). Default 0.
   */
  readonly dropRate?: number;
  /** RNG for drop injection; injectable for deterministic tests. */
  readonly random?: () => number;
}

/**
 * Server-side dispatcher: decodes a WireRequest, invokes the real object,
 * encodes the result. Paired with RemoteProxyStub it simulates full RPC
 * semantics without sockets.
 */
export class LocalTransport implements Transport {
  private readonly _service: Record<string, unknown>;
  private readonly _latencyMs: number;
  private readonly _dropRate: number;
  private readonly _random: () => number;

  private _received: number;
  private _dropped: number;

  constructor(service: Record<string, unknown>, options: LocalTransportOptions = {}) {
    this._service = service;
    this._latencyMs = options.latencyMs ?? 0;
    this._dropRate = options.dropRate ?? 0;
    this._random = options.random ?? Math.random;
    this._received = 0;
    this._dropped = 0;
  }

  /** Server-side counters. */
  get counters(): { received: number; dropped: number } {
    return { received: this._received, dropped: this._dropped };
  }

  async send(request: WireRequest): Promise<WireResponse> {
    this._received += 1;

    if (this._dropRate > 0 && this._random() < this._dropRate) {
      this._dropped += 1;
      return {
        id: request.id,
        ok: false,
        error: { name: 'NetworkError', message: 'request dropped by transport' },
      };
    }

    if (this._latencyMs > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, this._latencyMs);
      });
    }

    const fn = this._service[request.method];
    if (typeof fn !== 'function') {
      return {
        id: request.id,
        ok: false,
        error: { name: 'NoSuchMethod', message: `'${request.method}' is not exposed` },
      };
    }

    try {
      const value = await (fn as (...a: unknown[]) => unknown).apply(this._service, [...request.args]);
      return { id: request.id, ok: true, value: value === undefined ? null : value };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return { id: request.id, ok: false, error: { name: err.name, message: err.message } };
    }
  }
}
