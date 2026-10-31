/**
 * CrossChannelLinker — same-user signals correlated across channels.
 *
 * Account takeover has a channel signature: the attacker logs in on
 * web (credential stuffing), adds a device, then moves to mobile/API
 * for the actual fraud — channels the legitimate user rarely touches.
 * Single-channel models miss this because each channel's event stream
 * looks fine in isolation.
 *
 * For every user this linker keeps a compact per-channel profile:
 * devices seen, IPs seen, observation timestamps, and flagged (bad-
 * outcome) events. The composite signal surfaces:
 *
 *   - switch velocity: channel changes inside `switchWindowMs` —
 *     legit users stay on one channel for a sitting;
 *   - channel breadth: an account suddenly active on channels it
 *     never used historically;
 *   - shared devices: a device observed on ≥2 channels is identity-
 *     confirming (same physical handset has web+app fingerprints) —
 *     it *reduces* risk, which is why it's a signal, not noise;
 *   - flag propagation: a chargeback flagged on the API channel
 *     poisons the user's risk on every channel for `flagWindowMs`.
 *
 * Memory: O(users × channels × obs). `prune` trims aged observations.
 *
 * @module FraudDetectionLayer/Engine
 */

import {
  Channel,
  ChannelObservation,
  CrossChannelOptions,
  CrossChannelSignal,
  FraudClock,
  SystemFraudClock,
} from './types';

const HOUR = 3_600_000;

interface ChannelState {
  /** devices seen on this channel */
  devices: Set<string>;
  /** ips seen on this channel */
  ips: Set<string>;
  /** sorted observation timestamps (ring-trimmed on write) */
  obs: number[];
  /** flagged event timestamps */
  flags: number[];
}

interface UserState {
  channels: Map<Channel, ChannelState>;
  /** ordered (channel, t) log for switch counting */
  timeline: Array<{ ch: Channel; t: number }>;
  firstSeen: number;
}

export class CrossChannelLinker {
  private readonly _clock: FraudClock;
  private readonly _switchWindow: number;
  private readonly _flagWindow: number;
  private readonly _sharedBonus: number;
  private readonly _users = new Map<string, UserState>();

  constructor(options: CrossChannelOptions = {}, clock?: FraudClock) {
    this._clock = clock ?? new SystemFraudClock();
    this._switchWindow = options.switchWindowMs ?? HOUR;
    this._flagWindow = options.flagWindowMs ?? 30 * 86_400_000;
    this._sharedBonus = options.sharedDeviceBonus ?? 0.15;
  }

  /* ---------------------------------------------------------------- */
  /* Ingest                                                            */
  /* ---------------------------------------------------------------- */

  observe(obs: ChannelObservation): void {
    const now = this._clock.now();
    let u = this._users.get(obs.userId);
    if (u === undefined) {
      u = { channels: new Map(), timeline: [], firstSeen: now };
      this._users.set(obs.userId, u);
    }
    let ch = u.channels.get(obs.channel);
    if (ch === undefined) {
      ch = { devices: new Set(), ips: new Set(), obs: [], flags: [] };
      u.channels.set(obs.channel, ch);
    }
    if (obs.deviceId !== undefined) ch.devices.add(obs.deviceId);
    if (obs.ipAddress !== undefined) ch.ips.add(obs.ipAddress);
    ch.obs.push(obs.at);
    if (obs.flagged === true) ch.flags.push(obs.at);
    u.timeline.push({ ch: obs.channel, t: obs.at });
  }

  observeAll(obs: readonly ChannelObservation[]): void {
    for (const o of obs) this.observe(o);
  }

  /* ---------------------------------------------------------------- */
  /* Signals                                                           */
  /* ---------------------------------------------------------------- */

  /** Composite cross-channel risk signal for a user. */
  signal(userId: string): CrossChannelSignal | undefined {
    const u = this._users.get(userId);
    if (u === undefined) return undefined;
    const now = this._clock.now();

    const channels = [...u.channels.keys()].sort();
    const switches = this._switches(u, now - this._switchWindow);
    const shared = this._sharedDevices(u);
    let flagged = 0;
    for (const ch of u.channels.values()) {
      for (const t of ch.flags) if (now - t <= this._flagWindow) flagged++;
    }

    const reasons: string[] = [];
    let risk = 0;

    // switch velocity: each extra switch in the window adds pressure
    const switchRisk = Math.min(1, switches / 3);
    if (switches >= 2) reasons.push(`${switches} channel switches in <1h`);
    risk += 0.35 * switchRisk;

    // breadth vs. history: active on >3 channels is unusual
    const breadthRisk = Math.min(1, Math.max(0, channels.length - 2) / 3);
    if (channels.length >= 3) {
      reasons.push(`active on ${channels.length} channels`);
    }
    risk += 0.25 * breadthRisk;

    // flagged history propagates across channels
    const flagRisk = Math.min(1, flagged / 2);
    if (flagged > 0) reasons.push(`${flagged} flagged events (any channel)`);
    risk += 0.40 * flagRisk;

    // shared devices are identity-confirming — subtract the bonus
    if (shared.length > 0) {
      reasons.push(`${shared.length} device(s) span channels`);
      risk = Math.max(0, risk - this._sharedBonus * Math.min(2, shared.length));
    }

    return {
      userId,
      channels,
      switchesLastHour: switches,
      sharedDevices: shared,
      flaggedCount: flagged,
      riskScore: Math.min(1, risk),
      reasons,
    };
  }

  /**
   * Is this (channel, device) pair new *for this user*? The single
   * highest-value yes/no for step-up-auth decisions.
   */
  isNewChannelDevice(userId: string, channel: Channel, deviceId: string): boolean {
    const u = this._users.get(userId);
    if (u === undefined) return true;
    const ch = u.channels.get(channel);
    if (ch === undefined) return true;
    return !ch.devices.has(deviceId);
  }

  /** Every device a user has ever presented, across channels. */
  devicesFor(userId: string): readonly string[] {
    const u = this._users.get(userId);
    if (u === undefined) return [];
    const all = new Set<string>();
    for (const ch of u.channels.values()) {
      for (const d of ch.devices) all.add(d);
    }
    return [...all].sort();
  }

  /** Trim observations older than the flag window (memory hygiene). */
  prune(): number {
    const cutoff = this._clock.now() - this._flagWindow;
    let n = 0;
    for (const [userId, u] of [...this._users]) {
      for (const ch of u.channels.values()) {
        const before = ch.obs.length + ch.flags.length;
        ch.obs = ch.obs.filter((t) => t >= cutoff);
        ch.flags = ch.flags.filter((t) => t >= cutoff);
        n += before - ch.obs.length - ch.flags.length;
      }
      u.timeline = u.timeline.filter((x) => x.t >= cutoff);
      // drop users with no live observation left
      let live = 0;
      for (const ch of u.channels.values()) live += ch.obs.length;
      if (live === 0) this._users.delete(userId);
    }
    return n;
  }

  get userCount(): number {
    return this._users.size;
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                         */
  /* ---------------------------------------------------------------- */

  /** count timeline points where channel differs from the previous. */
  private _switches(u: UserState, fromT: number): number {
    let n = 0;
    let prev: Channel | undefined;
    // timeline is append-only with near-sorted timestamps; scan back
    for (let i = u.timeline.length - 1; i >= 0; i--) {
      const x = u.timeline[i];
      if (x.t < fromT) break;
      if (prev !== undefined && x.ch !== prev) n++;
      prev = x.ch;
    }
    return n;
  }

  /** devices present on ≥2 distinct channels. */
  private _sharedDevices(u: UserState): string[] {
    const deviceChannels = new Map<string, Set<Channel>>();
    for (const [ch, st] of u.channels) {
      for (const d of st.devices) {
        let set = deviceChannels.get(d);
        if (set === undefined) {
          set = new Set();
          deviceChannels.set(d, set);
        }
        set.add(ch);
      }
    }
    const out: string[] = [];
    for (const [d, chs] of deviceChannels) {
      if (chs.size >= 2) out.push(d);
    }
    return out.sort();
  }
}
