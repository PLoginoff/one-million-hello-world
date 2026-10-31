/**
 * DeviceIntelligence — per-device reputation profiles.
 *
 * `VelocityTracker` knows *what a device did recently*; this module
 * knows *what a device IS* — its age, the population of accounts and
 * IPs that move through it, and an evidence-weighted trust score.
 * The three signals fraud teams actually use:
 *
 *   - age: a device first seen 20 minutes ago initiating card-not-
 *     present transactions is the classic emulator/burner pattern;
 *   - account fan-out: one device touching 14 accounts is a farm;
 *     one account touching 14 devices is credential sharing;
 *   - trust: an EWMA-ish score nudged up by clean outcomes and down
 *     by confirmed fraud, decaying toward 0.5 (unknown) as evidence
 *     ages out — a quiet device earns back no benefit of the doubt.
 *
 * Trust update is bounded-additive on log-odds (not raw probability):
 * updates in logit space make "+N clean events" and "−N fraud events"
 * roughly cancel regardless of where the score sits — the same reason
 * naive-Bayes-style scoring works for spam reputation.
 *
 * Memory: O(devices + account↔device edges). All updates O(1).
 *
 * @module FraudDetectionLayer/Engine
 */

import {
  DeviceProfileOptions,
  DeviceSignal,
  FraudClock,
  SystemFraudClock,
} from './types';

interface DeviceState {
  firstSeen: number;
  lastSeen: number;
  /** log-odds of trust; 0 = neutral (score 0.5) */
  logit: number;
  /** last time logit was touched — for decay */
  updatedAt: number;
  accounts: Set<string>;
  ips: Set<string>;
}

export class DeviceIntelligence {
  private readonly _clock: FraudClock;
  private readonly _halfLife: number;
  private readonly _cleanDelta: number;
  private readonly _fraudDelta: number;
  private readonly _matureAge: number;
  private readonly _devices = new Map<string, DeviceState>();
  /** userId → set of devices they've used (fan-out lookup) */
  private readonly _userDevices = new Map<string, Set<string>>();

  constructor(options: DeviceProfileOptions = {}, clock?: FraudClock) {
    this._clock = clock ?? new SystemFraudClock();
    this._halfLife = options.trustHalfLifeMs ?? 30 * 86_400_000;
    this._cleanDelta = options.cleanSignal ?? 0.4;
    this._fraudDelta = options.fraudSignal ?? 1.6;
    this._matureAge = options.matureAgeMs ?? 30 * 86_400_000;
  }

  /* ---------------------------------------------------------------- */
  /* Observation                                                       */
  /* ---------------------------------------------------------------- */

  /**
   * Record a device sighting with optional outcome evidence. Repeated
   * sightings of the same (device, account, ip) triple are idempotent
   * for fan-out counts but still refresh lastSeen.
   */
  observe(
    deviceId: string,
    accountId: string,
    ipAddress?: string,
    outcome?: 'clean' | 'fraud' | 'chargeback'
  ): void {
    const now = this._clock.now();
    let d = this._devices.get(deviceId);
    if (d === undefined) {
      d = {
        firstSeen: now,
        lastSeen: now,
        logit: 0,
        updatedAt: now,
        accounts: new Set(),
        ips: new Set(),
      };
      this._devices.set(deviceId, d);
    } else {
      this._decay(d, now);
      d.lastSeen = Math.max(d.lastSeen, now);
    }

    d.accounts.add(accountId);
    if (ipAddress !== undefined) d.ips.add(ipAddress);

    let devs = this._userDevices.get(accountId);
    if (devs === undefined) {
      devs = new Set();
      this._userDevices.set(accountId, devs);
    }
    devs.add(deviceId);

    // outcome evidence in log-odds space
    if (outcome === 'clean') d.logit += this._cleanDelta;
    else if (outcome === 'fraud' || outcome === 'chargeback') {
      d.logit -= this._fraudDelta;
    }
    d.updatedAt = now;
  }

  /* ---------------------------------------------------------------- */
  /* Queries                                                           */
  /* ---------------------------------------------------------------- */

  /** Full device profile at the clock's instant. */
  signal(deviceId: string): DeviceSignal | undefined {
    const d = this._devices.get(deviceId);
    if (d === undefined) return undefined;
    const now = this._clock.now();
    this._decay(d, now);

    const ageMs = Math.max(0, now - d.firstSeen);
    const trust = sigmoid(d.logit);
    const accountCount = d.accounts.size;
    const ipCount = d.ips.size;
    const sharedDeviceCount = this._fanOut(d);

    // risk = weighted evidence blend, each term in [0,1]
    const reasons: string[] = [];
    let risk = 0;
    const ageRisk = 1 - Math.min(1, ageMs / this._matureAge);
    if (ageRisk > 0.5) reasons.push('young device');
    risk += 0.30 * ageRisk;

    const fanOutRisk = Math.min(1, Math.max(0, (accountCount - 1) / 5));
    if (fanOutRisk > 0.3) reasons.push(`${accountCount} accounts on one device`);
    risk += 0.30 * fanOutRisk;

    const distrust = 1 - trust;
    if (distrust > 0.7) reasons.push('confirmed-fraud history');
    else if (trust > 0.7) reasons.push('established clean history');
    risk += 0.40 * distrust;

    if (sharedDeviceCount > 4) {
      reasons.push(`accounts fan out to ${sharedDeviceCount} devices`);
      risk = Math.min(1, risk + 0.1);
    }

    return {
      deviceId,
      ageMs,
      trustScore: trust,
      accountCount,
      ipCount,
      sharedDeviceCount,
      riskScore: Math.min(1, risk),
      reasons,
    };
  }

  /** trust score only — the cheap call for rule weighting. */
  trust(deviceId: string): number {
    const d = this._devices.get(deviceId);
    if (d === undefined) return 0.5;
    this._decay(d, this._clock.now());
    return sigmoid(d.logit);
  }

  /** Devices linked to an account (credential-sharing fan-out). */
  devicesFor(accountId: string): readonly string[] {
    const s = this._userDevices.get(accountId);
    return s === undefined ? [] : [...s].sort();
  }

  /** Accounts on a device (device-farm fan-out). */
  accountsFor(deviceId: string): readonly string[] {
    const d = this._devices.get(deviceId);
    return d === undefined ? [] : [...d.accounts].sort();
  }

  get deviceCount(): number {
    return this._devices.size;
  }

  /** Drop devices unseen for `olderThanMs` (default: 90 days). */
  prune(olderThanMs = 90 * 86_400_000): number {
    const cutoff = this._clock.now() - olderThanMs;
    let n = 0;
    for (const [id, d] of [...this._devices]) {
      if (d.lastSeen < cutoff) {
        this._devices.delete(id);
        n++;
      }
    }
    for (const [user, devs] of [...this._userDevices]) {
      for (const id of [...devs]) {
        if (!this._devices.has(id)) devs.delete(id);
      }
      if (devs.size === 0) this._userDevices.delete(user);
    }
    return n;
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                         */
  /* ---------------------------------------------------------------- */

  /** Union of devices across all accounts seen on this device. */
  private _fanOut(d: DeviceState): number {
    const all = new Set<string>();
    for (const account of d.accounts) {
      const devs = this._userDevices.get(account);
      if (devs !== undefined) for (const x of devs) all.add(x);
    }
    return all.size;
  }

  /** Decay the logit toward 0 proportional to staleness. */
  private _decay(d: DeviceState, now: number): void {
    if (this._halfLife <= 0 || now <= d.updatedAt) return;
    const f = Math.pow(0.5, (now - d.updatedAt) / this._halfLife);
    d.logit *= f;
    d.updatedAt = now;
  }
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}
