/**
 * DeltaCompressor — structural diff encoding between similar events.
 *
 * Event streams are repetitive: `OrderUpdated` events on one order share
 * 80–95% of their fields. Storing every event in full wastes the log. This
 * codec stores periodic "key frames" (full JSON) and intermediate "delta
 * frames" (a `JsonDiff` against the most recent key frame in the same
 * stream), chosen per event by which encoding is smaller.
 *
 * Diff algorithm (recursive, structural — not textual):
 *
 *   diff(a, b):
 *     - types differ or either is primitive → { value: b }  (replace)
 *     - both objects:
 *         set = { k: b[k] | k ∈ b, k ∉ a }
 *         del = [ k | k ∈ a, k ∉ b ]
 *         nested = { k: diff(a[k], b[k]) | k ∈ a∩b, a[k]≠b[k] }
 *     - both arrays: compared elementwise; extra/missing elements land in
 *       set/del by index (index-as-key — arrays are treated as objects
 *       with numeric keys, which is correct for append-mostly payloads)
 *
 * Reconstruction walks the same tree: apply set/dele at each level, recurse
 * into `nested`. `apply` is the exact inverse of `diff` by construction —
 * `apply(a, diff(a, b)) ≡ deepEqual(b)` is the codec's invariant.
 *
 * Storage win: a delta frame is O(changed fields), not O(payload). The
 * `keyEvery` cadence bounds reconstruction chains so reads stay O(depth)
 * instead of walking the full history.
 *
 * @module EventLayer/Engine/Security
 */

import { CompressionResult, EventFrame, FrameError, JsonDiff } from './types';

export interface DeltaCompressorOptions {
  /** Force a key frame every N events per stream (bounds delta chains). */
  readonly keyEvery?: number;
  /** Estimated bytes threshold: deltas larger than `deltaRatio` of the full
   *  payload are stored as key frames anyway (diffing didn't pay). */
  readonly deltaRatio?: number;
}

interface StreamFrames {
  /** frameId → decoded payload — the reconstruction base cache. */
  readonly frames: Map<string, unknown>;
  /** Most recent key frame id — deltas chain from it. */
  lastKeyId: string | null;
  /** Events since last key frame. */
  sinceKey: number;
  seq: number;
  /** Total frames emitted (for stats). */
  emitted: number;
}

export class DeltaCompressor {
  private readonly keyEvery: number;
  private readonly deltaRatio: number;
  private readonly streams = new Map<string, StreamFrames>();

  constructor(options: DeltaCompressorOptions = {}) {
    this.keyEvery = Math.max(2, options.keyEvery ?? 16);
    this.deltaRatio = options.deltaRatio ?? 0.9;
  }

  /**
   * Encodes `data` for `streamId`, picking key vs delta per event.
   * A delta is used only when it beats `deltaRatio × fullSize` — otherwise
   * the diff wasn't worth the indirection and a key frame resets the chain.
   */
  encode(streamId: string, data: unknown): CompressionResult {
    const s = this.stateFor(streamId);
    const full = JSON.stringify(data);
    const fullSize = full.length;

    const needsKey = s.lastKeyId === null || s.sinceKey >= this.keyEvery - 1;
    if (!needsKey && s.lastKeyId) {
      const base = s.frames.get(s.lastKeyId);
      const diff = jsonDiff(base, data);
      // An identical payload produces an empty diff — still store it: the
      // frame exists to preserve ORDER, and 2 bytes beats `fullSize` anyway.
      const diffSize = diff === undefined ? 2 : estimateDiffSize(diff);
      if (diffSize < fullSize * this.deltaRatio) {
        const frame: EventFrame = {
          kind: 'delta',
          baseId: s.lastKeyId,
          diff: diff ?? {},
          sizeBytes: diffSize,
        };
        this.record(s, data);
        s.sinceKey++;
        return { frame, ratio: diffSize / fullSize, usedDelta: true };
      }
    }

    // Key frame: store full payload, reset chain.
    const frame: EventFrame = { kind: 'key', full, sizeBytes: fullSize };
    const id = this.record(s, data);
    s.lastKeyId = id;
    s.sinceKey = 0;
    return { frame, ratio: 1, usedDelta: false };
  }

  /**
   * Decodes a frame. Delta frames resolve their base two ways:
   *   1. An explicit `resolveBase(frameId)` resolver (the real read path —
   *      the caller reconstructs bases from the log in order), or
   *   2. The compressor's internal base cache (same-session decode).
   * An unresolvable base throws `FrameError` — a delta without its base is
   * undecodable, which is exactly why archives keep whole chains.
   */
  decode(
    streamId: string,
    frame: EventFrame,
    resolveBase?: (frameId: string) => unknown
  ): unknown {
    if (frame.kind === 'key') {
      return JSON.parse(frame.full as string);
    }
    if (!frame.baseId) {
      throw new FrameError(`Delta frame for "${streamId}" has no baseId`);
    }
    const base = resolveBase
      ? resolveBase(frame.baseId)
      : this.streams.get(streamId)?.frames.get(frame.baseId);
    if (base === undefined) {
      throw new FrameError(
        `Delta frame for "${streamId}" references unknown base "${frame.baseId}"`
      );
    }
    if (Object.keys(frame.diff ?? {}).length === 0) return base; // empty diff
    return applyDiff(base, frame.diff as JsonDiff);
  }

  /**
   * Replays a frame sequence in order, resolving delta bases by position.
   * `frames[i]` may carry `id` — the id a delta's `baseId` refers to. This
   * is the real reconstruction path: walk forward, keep decoded bases by
   * id, resolve each delta from them.
   */
  decodeAll(frames: readonly (EventFrame & { id?: string })[]): unknown[] {
    const bases = new Map<string, unknown>();
    const out: unknown[] = [];
    for (const f of frames) {
      const decoded = this.decode('', f, (id) => bases.get(id));
      if (f.id) bases.set(f.id, decoded);
      out.push(decoded);
    }
    return out;
  }

  /**
   * Computes the diff between two JSON values directly (exposed for tests
   * and for callers that want the diff without the stream state).
   */
  static diff = jsonDiff;
  static apply = applyDiff;

  // ------------------------------------------------------------------------

  private stateFor(streamId: string): StreamFrames {
    let s = this.streams.get(streamId);
    if (!s) {
      s = { frames: new Map(), lastKeyId: null, sinceKey: 0, seq: 0, emitted: 0 };
      this.streams.set(streamId, s);
    }
    return s;
  }

  /** Records a decoded payload; returns the frame id it occupies. */
  private record(s: StreamFrames, data: unknown): string {
    const id = `f${s.seq++}`;
    s.frames.set(id, data);
    return id;
  }
}

// --------------------------------------------------------------------------
// Structural diff/apply — pure functions, no stream state.
// --------------------------------------------------------------------------

/**
 * Computes `diff(a, b)` such that `applyDiff(a, diff) ≡ b`.
 * Returns `undefined` when a === b (no change) so callers can skip storing.
 */
export function jsonDiff(a: unknown, b: unknown): JsonDiff | undefined {
  if (deepEqual(a, b)) return undefined;

  // Type mismatch or primitives → wholesale replace.
  if (typeof a !== typeof b || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) {
    return { value: b };
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    return diffArray(a, b);
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aO = a as Record<string, unknown>;
    const bO = b as Record<string, unknown>;
    const set: Record<string, unknown> = {};
    const del: string[] = [];
    const nested: Record<string, JsonDiff> = {};
    let has = false;

    for (const k of Object.keys(bO)) {
      if (!(k in aO)) {
        set[k] = bO[k];
        has = true;
      }
    }
    for (const k of Object.keys(aO)) {
      if (!(k in bO)) {
        del.push(k);
        has = true;
      }
    }
    for (const k of Object.keys(bO)) {
      if (k in aO && !deepEqual(aO[k], bO[k])) {
        const sub = jsonDiff(aO[k], bO[k]);
        if (sub !== undefined) {
          nested[k] = sub;
          has = true;
        }
      }
    }
    if (!has) return { value: b }; // same shape but differs — replace
    const out: JsonDiff = {};
    if (Object.keys(set).length) (out as { set?: Record<string, unknown> }).set = set;
    if (del.length) (out as { del?: readonly string[] }).del = del;
    if (Object.keys(nested).length)
      (out as { nested?: Record<string, JsonDiff> }).nested = nested;
    return out;
  }

  return { value: b };
}

function diffArray(a: unknown[], b: unknown[]): JsonDiff | undefined {
  // Elementwise diff; length mismatch handled by set (append) or del (trim).
  const n = Math.min(a.length, b.length);
  const nested: Record<string, JsonDiff> = {};
  const set: Record<string, unknown> = {};
  let has = false;
  for (let i = 0; i < n; i++) {
    if (!deepEqual(a[i], b[i])) {
      const sub = jsonDiff(a[i], b[i]);
      if (sub !== undefined) {
        nested[String(i)] = sub;
        has = true;
      }
    }
  }
  if (b.length > a.length) {
    for (let i = a.length; i < b.length; i++) {
      set[String(i)] = b[i];
      has = true;
    }
  } else if (b.length < a.length) {
    const del: string[] = [];
    for (let i = b.length; i < a.length; i++) del.push(String(i));
    const out: JsonDiff = { del };
    if (Object.keys(nested).length) (out as { nested?: Record<string, JsonDiff> }).nested = nested;
    if (Object.keys(set).length) (out as { set?: Record<string, unknown> }).set = set;
    return out;
  }
  if (!has) return undefined;
  const out: JsonDiff = {};
  if (Object.keys(set).length) (out as { set?: Record<string, unknown> }).set = set;
  if (Object.keys(nested).length) (out as { nested?: Record<string, JsonDiff> }).nested = nested;
  return out;
}

/**
 * Inverse of `jsonDiff`: reconstructs the target value.
 * `del` is applied before `nested`/`set` so deletions can't be resurrected.
 */
export function applyDiff(base: unknown, diff: JsonDiff): unknown {
  if (diff.value !== undefined) return diff.value;
  if (base === null || typeof base !== 'object') return base;

  const isArr = Array.isArray(base);
  const out: Record<string, unknown> = isArr
    ? ({} as Record<string, unknown>)
    : {};

  // Copy base, minus deleted keys.
  const delSet = new Set(diff.del ?? []);
  if (isArr) {
    const arr = base as unknown[];
    for (let i = 0; i < arr.length; i++) {
      if (!delSet.has(String(i))) out[String(i)] = arr[i];
    }
  } else {
    for (const [k, v] of Object.entries(base as Record<string, unknown>)) {
      if (!delSet.has(k)) out[k] = v;
    }
  }

  // Apply nested diffs on surviving keys.
  for (const [k, sub] of Object.entries(diff.nested ?? {})) {
    out[k] = applyDiff(out[k], sub);
  }
  // Apply sets (new + overwritten keys).
  for (const [k, v] of Object.entries(diff.set ?? {})) {
    out[k] = v;
  }

  if (isArr) {
    // Rebuild dense array from index-keyed object.
    const len = Math.max(...Object.keys(out).map(Number), -1) + 1;
    const arr: unknown[] = new Array(len);
    for (const [k, v] of Object.entries(out)) arr[Number(k)] = v;
    return arr;
  }
  return out;
}

/** Rough byte estimate of a diff (JSON of the diff minus structural overhead). */
function estimateDiffSize(diff: JsonDiff): number {
  return JSON.stringify(diff).length;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const aa = a as unknown[];
    const bb = b as unknown[];
    return aa.length === bb.length && aa.every((v, i) => deepEqual(v, bb[i]));
  }
  const aO = a as Record<string, unknown>;
  const bO = b as Record<string, unknown>;
  const aKeys = Object.keys(aO);
  const bKeys = Object.keys(bO);
  return (
    aKeys.length === bKeys.length && aKeys.every((k) => deepEqual(aO[k], bO[k]))
  );
}
