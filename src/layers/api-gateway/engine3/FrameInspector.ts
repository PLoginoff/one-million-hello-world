/**
 * WebSocket Frame Inspector
 *
 * The content-policy layer `WsRelay`'s `onFrame` hook delegates to:
 * a stateful, per-connection inspector that enforces what a proxy
 * may carry.
 *
 * Policies enforced per direction:
 *
 *  - **UTF-8 validation** for text frames (RFC 6455 requires text
 *    payloads to be valid UTF-8; a relay that doesn't check forwards
 *    garbage the peer will close on with 1007). Streaming validation
 *    handles frames split mid-codepoint across fragments.
 *
 *  - **Payload size caps** — max bytes per message and per frame;
 *    oversized messages trip a `1009` close.
 *
 *  - **Message-rate limiting** — a token bucket per direction so a
 *    flooding client can't exhaust upstream buffers.
 *
 *  - **Opcode allowlists** — e.g. a telemetry channel permitting
 *    text only; binary frames get a `1003` close.
 *
 * Stateful because fragmentation matters: the inspector tracks
 * message boundaries across continuation frames so size and UTF-8
 * checks apply to the *message*, not the wire chunk.
 *
 * Verdicts are descriptive (`pass` / `drop` / `close(code, reason)`)
 * so the caller decides how to act — the relay translates `close`
 * into a proper close frame.
 *
 * Complexity: O(payload) per frame; O(1) state per direction.
 *
 * @module ApiGatewayLayer/Engine3
 */

import {
  WS_OP_BINARY,
  WS_OP_CLOSE,
  WS_OP_CONTINUATION,
  WS_OP_PING,
  WS_OP_PONG,
  WS_OP_TEXT,
  WsFrame,
} from './types3';

export type InspectVerdict =
  | { readonly action: 'pass' }
  | { readonly action: 'drop'; readonly reason: string }
  | { readonly action: 'close'; readonly code: number; readonly reason: string };

export interface InspectorPolicy {
  /** Max bytes per *message* (reassembled). 0 = unlimited. */
  readonly maxMessageBytes?: number;
  /** Max bytes per single frame. 0 = unlimited. */
  readonly maxFrameBytes?: number;
  /** Opcodes permitted; undefined = all data frames allowed. */
  readonly allowedDataOpcodes?: readonly number[];
  /** Messages per second sustained rate; 0 = unlimited. */
  readonly maxMessagesPerSecond?: number;
  /** Validate UTF-8 on text frames (default true). */
  readonly validateUtf8?: boolean;
}

interface DirectionState {
  /** Fragmented message accumulator. */
  fragOpcode: number | null;
  fragBytes: number;
  /** Pending UTF-8 tail bytes when a split cut a codepoint. */
  utf8Pending: number;
  /** Token bucket for rate limiting. */
  tokens: number;
  lastRefill: number;
}

function newDirectionState(): DirectionState {
  return { fragOpcode: null, fragBytes: 0, utf8Pending: 0, tokens: 0, lastRefill: 0 };
}

/**
 * Streaming UTF-8 validator state machine. Returns the number of
 * *complete* codepoints consumed; trailing partial sequences are
 * carried in `pending` (count of continuation bytes expected).
 * `invalid: true` on any malformed byte.
 */
export function utf8ValidateChunk(
  bytes: Uint8Array,
  pending: { remaining: number }
): { ok: boolean; pending: number } {
  let rem = pending.remaining;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    if (rem > 0) {
      // Expecting continuation bytes 10xxxxxx.
      if ((b & 0xc0) !== 0x80) return { ok: false, pending: 0 };
      rem--;
      continue;
    }
    if (b < 0x80) continue; // ASCII
    if ((b & 0xe0) === 0xc0) {
      // 2-byte; reject overlong encodings C0/C1.
      if (b < 0xc2) return { ok: false, pending: 0 };
      rem = 1;
    } else if ((b & 0xf0) === 0xe0) {
      rem = 2;
    } else if ((b & 0xf8) === 0xf0) {
      if (b > 0xf4) return { ok: false, pending: 0 }; // > U+10FFFF
      rem = 3;
    } else {
      return { ok: false, pending: 0 }; // stray continuation or 5/6-byte
    }
  }
  return { ok: true, pending: rem };
}

export class FrameInspector {
  private readonly policy: Required<InspectorPolicy>;
  private clientState = newDirectionState();
  private upstreamState = newDirectionState();
  private clock: () => number;

  constructor(policy: InspectorPolicy = {}, clock: () => number = () => Date.now()) {
    this.policy = {
      maxMessageBytes: policy.maxMessageBytes ?? 0,
      maxFrameBytes: policy.maxFrameBytes ?? 0,
      allowedDataOpcodes: policy.allowedDataOpcodes ?? [WS_OP_TEXT, WS_OP_BINARY],
      maxMessagesPerSecond: policy.maxMessagesPerSecond ?? 0,
      validateUtf8: policy.validateUtf8 ?? true,
    };
    this.clock = clock;
    this.clientState.tokens = this.policy.maxMessagesPerSecond;
    this.clientState.lastRefill = clock();
    this.upstreamState.tokens = this.policy.maxMessagesPerSecond;
    this.upstreamState.lastRefill = clock();
  }

  /**
   * Inspect one frame traveling `direction`. The caller feeds every
   * wire frame (including fragments) in order.
   */
  inspect(frame: WsFrame, direction: 'client→upstream' | 'upstream→client'): InspectVerdict {
    const s = direction === 'client→upstream' ? this.clientState : this.upstreamState;

    // Control frames always pass (ping/pong/close are relay-managed).
    if (frame.opcode === WS_OP_CLOSE || frame.opcode === WS_OP_PING || frame.opcode === WS_OP_PONG) {
      return { action: 'pass' };
    }

    // Per-frame size cap.
    if (this.policy.maxFrameBytes > 0 && frame.payload.length > this.policy.maxFrameBytes) {
      return { action: 'close', code: 1009, reason: 'frame exceeds max size' };
    }

    // Opcode allowlist (data opcodes only; continuations follow the
    // open fragment's opcode).
    const effectiveOpcode =
      frame.opcode === WS_OP_CONTINUATION ? s.fragOpcode : frame.opcode;
    if (frame.opcode !== WS_OP_CONTINUATION && effectiveOpcode !== null) {
      if (!this.policy.allowedDataOpcodes.includes(effectiveOpcode)) {
        return { action: 'close', code: 1003, reason: 'opcode not permitted' };
      }
    }

    // Fragment bookkeeping + message size cap.
    if (frame.opcode === WS_OP_CONTINUATION) {
      if (s.fragOpcode === null) {
        return { action: 'close', code: 1002, reason: 'orphan continuation' };
      }
    } else if (!frame.fin) {
      if (s.fragOpcode !== null) {
        return { action: 'close', code: 1002, reason: 'interleaved message start' };
      }
      s.fragOpcode = frame.opcode;
      s.fragBytes = 0;
    }
    s.fragBytes += frame.payload.length;
    if (this.policy.maxMessageBytes > 0 && s.fragBytes > this.policy.maxMessageBytes) {
      s.fragOpcode = null;
      s.fragBytes = 0;
      return { action: 'close', code: 1009, reason: 'message exceeds max size' };
    }

    // UTF-8 validation on text frames (whole message when fragmented).
    if (this.policy.validateUtf8 && effectiveOpcode === WS_OP_TEXT) {
      const pending = { remaining: s.utf8Pending };
      const check = utf8ValidateChunk(frame.payload, pending);
      s.utf8Pending = check.pending;
      if (!check.ok) {
        return { action: 'close', code: 1007, reason: 'invalid UTF-8 in text frame' };
      }
      if (frame.fin && check.pending !== 0) {
        s.utf8Pending = 0;
        return { action: 'close', code: 1007, reason: 'truncated UTF-8 sequence' };
      }
    }

    // Message-complete bookkeeping.
    const messageComplete = frame.fin;
    if (messageComplete) {
      s.fragOpcode = null;
      s.fragBytes = 0;
      if (effectiveOpcode !== WS_OP_TEXT) s.utf8Pending = 0;
      else if (frame.opcode !== WS_OP_CONTINUATION) s.utf8Pending = 0;

      // Token bucket on completed messages.
      if (this.policy.maxMessagesPerSecond > 0) {
        const now = this.clock();
        const elapsed = (now - s.lastRefill) / 1000;
        s.tokens = Math.min(this.policy.maxMessagesPerSecond, s.tokens + elapsed * this.policy.maxMessagesPerSecond);
        s.lastRefill = now;
        if (s.tokens < 1) {
          return { action: 'drop', reason: 'message rate limit exceeded' };
        }
        s.tokens -= 1;
      }
    }

    return { action: 'pass' };
  }

  /** Reset state (e.g. relay restart on the same connection object). */
  reset(): void {
    this.clientState = newDirectionState();
    this.upstreamState = newDirectionState();
    this.clientState.tokens = this.policy.maxMessagesPerSecond;
    this.upstreamState.tokens = this.policy.maxMessagesPerSecond;
    const now = this.clock();
    this.clientState.lastRefill = now;
    this.upstreamState.lastRefill = now;
  }
}
