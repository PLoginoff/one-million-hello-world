/**
 * TlsTermination — pure state machine modelling a TLS handshake.
 *
 * This is a *stub*: no cryptography, no key schedule, no certificate
 * parsing. What it models is the *record-level protocol* — the
 * sequence of TLS records a conforming peer sends, the ordering the
 * handshake requires, and the alert/timeout paths that abort it. That
 * alone is enough for the pipeline to answer questions like "is this
 * connection mid-handshake?", "did the client speak plaintext on a
 * TLS port?", and "is this handshake stalled?".
 *
 * State machine (server side):
 *
 *   START ──ClientHello──▶ CLIENT_HELLO
 *     │                       │
 *     │ (server emits)        ▼
 *     │                   SERVER_FLIGHT  (after ServerHello + Cert +
 *     │                                    Finished are *sent*)
 *     │                       │
 *     │        client Finished ▼
 *     │                   ESTABLISHED ──app data──▶ (stays)
 *     │                       │
 *     │                  close_notify
 *     │                       ▼
 *     │                    CLOSED
 *     ▼
 *   alert / timeout / bad record ──▶ FAILED
 *
 * Guards enforced:
 *  - First record on a TLS port must be HANDSHAKE/ClientHello —
 *    anything else means the client spoke plaintext (or junk) to a
 *    TLS port; that's a `TLS_HANDSHAKE` failure, not a parse error.
 *  - `maxHandshakeRecords` bounds how many records a peer may send
 *    before completing (anti-DoS: endless ClientHello floods).
 *  - `handshakeTimeoutMs` bounds total handshake wall time.
 *  - Once ESTABLISHED, HANDSHAKE records are only legal for
 *    post-handshake messages (NewSessionTicket, KeyUpdate); a second
 *    ClientHello mid-session is a protocol violation.
 *
 * Complexity: each record is processed in O(1) — the whole machine is
 * a transition table plus a small record counter.
 *
 * @module NetworkLayer/Engine
 */

import {
  EngineClock,
  SystemEngineClock,
  TlsContentType,
  TlsHandshakeError,
  TlsHandshakeEvent,
  TlsHandshakeType,
  TlsRecord,
  TlsState,
  TlsTerminationOptions,
} from './types';

/** Max legal TLS record payload (RFC 8446 §5.1): 2^14 + 256 expansion. */
export const TLS_MAX_FRAGMENT = 16_640;

/** Alert description values the stub surfaces (RFC 8446 §6). */
export const enum TlsAlert {
  CLOSE_NOTIFY = 0,
  UNEXPECTED_MESSAGE = 10,
  BAD_RECORD_MAC = 20,
  HANDSHAKE_FAILURE = 40,
  DECODE_ERROR = 50,
  PROTOCOL_VERSION = 70,
  INTERNAL_ERROR = 80,
  USER_CANCELED = 90,
}

export class TlsTermination {
  private readonly _clock: EngineClock;
  private readonly _maxHandshakeRecords: number;
  private readonly _handshakeTimeoutMs: number;

  private _state: TlsState;
  private _startedAt: number | null;
  private _recordsSeen: number;
  private _appDataRecords: number;
  private _serverFlightSent: boolean;
  private _clientFinishedSeen: boolean;
  private _listeners: ((ev: TlsHandshakeEvent) => void)[];

  constructor(options: TlsTerminationOptions = {}) {
    this._clock = options.clock ?? new SystemEngineClock();
    this._maxHandshakeRecords = Math.max(1, options.maxHandshakeRecords ?? 32);
    this._handshakeTimeoutMs = Math.max(0, options.handshakeTimeoutMs ?? 10_000);

    this._state = TlsState.START;
    this._startedAt = null;
    this._recordsSeen = 0;
    this._appDataRecords = 0;
    this._serverFlightSent = false;
    this._clientFinishedSeen = false;
    this._listeners = [];
  }

  /* ---------------------------------------------------------------- */
  /* Introspection                                                     */
  /* ---------------------------------------------------------------- */

  get state(): TlsState {
    return this._state;
  }

  get established(): boolean {
    return this._state === TlsState.ESTABLISHED;
  }

  get failed(): boolean {
    return this._state === TlsState.FAILED;
  }

  /** Records consumed so far (all content types). */
  get recordsSeen(): number {
    return this._recordsSeen;
  }

  /** Application-data records consumed since ESTABLISHED. */
  get appDataRecords(): number {
    return this._appDataRecords;
  }

  /** Ms since the handshake started; null before the first record. */
  get handshakeElapsedMs(): number | null {
    return this._startedAt === null ? null : this._clock.now() - this._startedAt;
  }

  /**
   * True when the handshake has been running longer than
   * `handshakeTimeoutMs`. Checked lazily — the caller polls or folds
   * this into a connection-tick.
   */
  get handshakeTimedOut(): boolean {
    if (
      this._handshakeTimeoutMs <= 0 ||
      this._startedAt === null ||
      this._state === TlsState.ESTABLISHED ||
      this._state === TlsState.CLOSED
    ) {
      return false;
    }
    return this._clock.now() - this._startedAt > this._handshakeTimeoutMs;
  }

  /** Subscribe to state transitions (for metrics/logging). */
  onTransition(cb: (ev: TlsHandshakeEvent) => void): void {
    this._listeners.push(cb);
  }

  /* ---------------------------------------------------------------- */
  /* Record intake                                                     */
  /* ---------------------------------------------------------------- */

  /**
   * Consume one TLS record. Throws `TlsHandshakeError` on protocol
   * violation; returns the current event describing the transition
   * (or `state` unchanged when the record didn't advance the
   * machine).
   */
  receive(record: TlsRecord): TlsHandshakeEvent {
    if (this._state === TlsState.CLOSED) {
      throw new TlsHandshakeError(this._state, 'record received after close');
    }
    if (this._state === TlsState.FAILED) {
      throw new TlsHandshakeError(this._state, 'record received after failure');
    }

    this._recordsSeen++;
    if (this._startedAt === null) {
      this._startedAt = this._clock.now();
    }

    // Guards that apply regardless of state.
    if (record.fragment.byteLength > TLS_MAX_FRAGMENT) {
      return this._fail(TlsAlert.DECODE_ERROR, 'fragment exceeds max record size');
    }
    if (this._recordsSeen > this._maxHandshakeRecords && !this.established) {
      return this._fail(
        TlsAlert.UNEXPECTED_MESSAGE,
        `handshake record limit ${this._maxHandshakeRecords} exceeded`
      );
    }
    if (this.handshakeTimedOut) {
      return this._fail(TlsAlert.USER_CANCELED, 'handshake timed out');
    }

    switch (record.contentType) {
      case TlsContentType.HANDSHAKE:
        return this._onHandshake(record);
      case TlsContentType.ALERT:
        return this._onAlert(record);
      case TlsContentType.CHANGE_CIPHER_SPEC:
        // Middlebox-compat CCS records are legal filler in 1.3; they
        // don't advance the machine.
        return { state: this._state };
      case TlsContentType.APPLICATION_DATA:
        return this._onAppData(record);
      default:
        return this._fail(
          TlsAlert.UNEXPECTED_MESSAGE,
          `unknown content type ${record.contentType}`
        );
    }
  }

  /**
   * Mark the server flight as emitted (ServerHello … Finished). The
   * stub is record-in, state-out — transmission is the caller's job,
   * but the state machine needs to know it happened to accept the
   * client's Finished next.
   */
  markServerFlightSent(): void {
    if (this._state !== TlsState.CLIENT_HELLO) {
      throw new TlsHandshakeError(
        this._state,
        'server flight sent before ClientHello'
      );
    }
    this._serverFlightSent = true;
    this._transition(TlsState.SERVER_FLIGHT);
  }

  /* ---------------------------------------------------------------- */
  /* Per-type handlers                                                 */
  /* ---------------------------------------------------------------- */

  private _onHandshake(record: TlsRecord): TlsHandshakeEvent {
    // First byte of a handshake fragment is the message type.
    const type = record.fragment.byteLength > 0 ? record.fragment[0] : -1;

    switch (this._state) {
      case TlsState.START:
        if (type !== TlsHandshakeType.CLIENT_HELLO) {
          // Plaintext on a TLS port, or a junk first record — the
          // canonical "not TLS" failure.
          throw new TlsHandshakeError(
            this._state,
            `expected ClientHello, got handshake type ${type}`
          );
        }
        this._transition(TlsState.CLIENT_HELLO, type);
        return { state: this._state, handshakeType: type };

      case TlsState.CLIENT_HELLO:
        // More client records before the server flight completes:
        // only extra ClientHello-flavoured noise is tolerated (none
        // is expected in a correct peer, but some libraries split).
        return { state: this._state, handshakeType: type };

      case TlsState.SERVER_FLIGHT:
        if (type === TlsHandshakeType.FINISHED) {
          this._clientFinishedSeen = true;
          this._transition(TlsState.ESTABLISHED, type);
          return { state: this._state, handshakeType: type };
        }
        // Anything else mid-flight is a protocol violation.
        return this._fail(
          TlsAlert.UNEXPECTED_MESSAGE,
          `unexpected handshake type ${type} during server flight`
        );

      case TlsState.ESTABLISHED:
        // Post-handshake messages only.
        if (
          type === TlsHandshakeType.NEW_SESSION_TICKET ||
          type === TlsHandshakeType.KEY_UPDATE
        ) {
          return { state: this._state, handshakeType: type };
        }
        return this._fail(
          TlsAlert.UNEXPECTED_MESSAGE,
          `post-handshake type ${type} not permitted`
        );

      default:
        return this._fail(TlsAlert.UNEXPECTED_MESSAGE, 'handshake in terminal state');
    }
  }

  private _onAlert(record: TlsRecord): TlsHandshakeEvent {
    // Alert payload: [level, description]; fatal (2) or close_notify
    // end the connection, warnings just surface.
    const desc = record.fragment.byteLength > 1 ? record.fragment[1] : -1;
    if (desc === TlsAlert.CLOSE_NOTIFY && this._state === TlsState.ESTABLISHED) {
      this._transition(TlsState.CLOSED);
      return { state: this._state, alert: desc };
    }
    // Any other alert fails the connection (we don't model
    // warning-level alerts — a stub keeps the two terminal paths).
    this._transition(TlsState.FAILED, undefined, desc);
    return { state: this._state, alert: desc };
  }

  private _onAppData(_record: TlsRecord): TlsHandshakeEvent {
    if (this._state !== TlsState.ESTABLISHED) {
      // App data before Finished is a reordering attack or a bug.
      return this._fail(
        TlsAlert.UNEXPECTED_MESSAGE,
        'application data before handshake complete'
      );
    }
    this._appDataRecords++;
    return { state: this._state };
  }

  /* ---------------------------------------------------------------- */
  /* Transitions                                                       */
  /* ---------------------------------------------------------------- */

  private _transition(to: TlsState, handshakeType?: number, alert?: number): void {
    if (this._state === to) {
      return;
    }
    this._state = to;
    const ev: TlsHandshakeEvent = { state: to, handshakeType, alert };
    for (const cb of this._listeners) {
      cb(ev);
    }
  }

  private _fail(alert: TlsAlert, detail: string): TlsHandshakeEvent {
    this._transition(TlsState.FAILED, undefined, alert);
    throw new TlsHandshakeError(this._state, detail);
  }
}
