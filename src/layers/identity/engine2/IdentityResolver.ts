/**
 * IdentityResolver — probabilistic duplicate-account detection.
 *
 * Goes beyond the engine's exact-match `findMergeCandidates` (same
 * normalized email/phone/username) with FELLEGI-SUNTER style scoring:
 * each identity attribute contributes an agreement/disagreement weight
 * derived from how discriminating it is:
 *
 *   weight(attr) = log2( m(attr) / u(attr) )
 *
 *   m(attr) — probability the attribute agrees given a TRUE match
 *             (high; e.g. people rarely mistype their own email)
 *   u(attr) — probability the attribute agrees given a NON-match
 *             (low for high-entropy attributes like email; higher for
 *             common fields like givenName)
 *
 * Agreement is graded, not binary:
 *   - email:    exact normalized match = 1.0; same local-part diff domain = 0.5
 *   - phone:    exact = 1.0; same trailing 7 digits = 0.6
 *   - username: exact = 1.0; Jaro-Winkler similarity >= threshold scales
 *   - names:    Jaro-Winkler on given+family concatenation
 *
 * The composite score maps to a [0,1] match probability; pairs above
 * `reviewThreshold` are surfaced as candidates with an evidence trail.
 *
 * Blocking: full pairwise comparison is O(n²); candidates are blocked
 * by cheap keys (email local-part, phone tail, name prefix) so only
 * plausible pairs are scored — O(n · avg-block-size).
 *
 * @module Identity/Engine2
 */

import type { User } from '../core/types';
import { normalizeEmail, normalizePhone } from '../core/IdentityStore';

// ------------------------------------------------------------------ similarity

/**
 * Jaro similarity between two strings — the base for Jaro-Winkler.
 * O(|a|·|b|) worst case; strings here are short (names, usernames).
 */
export function jaro(a: string, b: string): number {
  if (a === b) return 1;
  const la = a.length;
  const lb = b.length;
  if (la === 0 || lb === 0) return 0;

  const window = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1);
  const matchA = new Array<boolean>(la).fill(false);
  const matchB = new Array<boolean>(lb).fill(false);

  let matches = 0;
  for (let i = 0; i < la; i++) {
    const lo = Math.max(0, i - window);
    const hi = Math.min(lb, i + window + 1);
    for (let j = lo; j < hi; j++) {
      if (!matchB[j] && a[i] === b[j]) {
        matchA[i] = true;
        matchB[j] = true;
        matches++;
        break;
      }
    }
  }
  if (matches === 0) return 0;

  // Transpositions: half the out-of-order matches.
  let transpositions = 0;
  let j = 0;
  for (let i = 0; i < la; i++) {
    if (matchA[i]) {
      while (!matchB[j]) j++;
      if (a[i] !== b[j]) transpositions++;
      j++;
    }
  }
  transpositions = Math.floor(transpositions / 2);

  return (matches / la + matches / lb + (matches - transpositions) / matches) / 3;
}

/** Jaro-Winkler: boosts pairs sharing a common prefix (up to 4 chars). */
export function jaroWinkler(a: string, b: string, prefixWeight = 0.1, maxPrefix = 4): number {
  const j = jaro(a, b);
  if (j < 0.7) return j; // Winkler boost only above the threshold
  let prefix = 0;
  const limit = Math.min(maxPrefix, Math.min(a.length, b.length));
  while (prefix < limit && a[prefix] === b[prefix]) prefix++;
  return j + prefix * prefixWeight * (1 - j);
}

// ------------------------------------------------------------------ scoring model

/** Per-attribute m/u probabilities for the Fellegi-Sunter model. */
export interface FieldProbabilities {
  /** P(agree | true match). */
  m: number;
  /** P(agree | random non-match). */
  u: number;
}

export interface ResolverConfig {
  /** Match probability to auto-flag as a duplicate (default 0.9). */
  matchThreshold: number;
  /** Match probability to surface for manual review (default 0.6). */
  reviewThreshold: number;
  /** Prior odds of a pair being a match (default 1/1000 — dups are rare). */
  priorOdds: number;
  /** Jaro-Winkler cutoffs. */
  usernameSim: number;
  nameSim: number;
  /** Per-field probabilities. */
  fields: {
    email: FieldProbabilities;
    phone: FieldProbabilities;
    username: FieldProbabilities;
    name: FieldProbabilities;
  };
}

export const DEFAULT_RESOLVER_CONFIG: ResolverConfig = {
  matchThreshold: 0.9,
  reviewThreshold: 0.6,
  priorOdds: 0.001,
  usernameSim: 0.85,
  nameSim: 0.85,
  fields: {
    // m: agree|match  u: agree|non-match — email nearly unique.
    email: { m: 0.98, u: 0.000001 },
    phone: { m: 0.95, u: 0.00001 },
    username: { m: 0.9, u: 0.005 },
    name: { m: 0.8, u: 0.05 }, // names collide — weak evidence alone
  },
};

/** Graded agreement for one attribute, with the applied weight. */
export interface AttributeEvidence {
  readonly attribute: 'email' | 'phone' | 'username' | 'name';
  /** 0..1 graded agreement. */
  readonly agreement: number;
  /** log2(m/u) weighted by agreement (negative on disagreement). */
  readonly weight: number;
  readonly detail: string;
}

/** A scored duplicate candidate. */
export interface DuplicateCandidate {
  readonly userA: string;
  readonly userB: string;
  /** 0..1 posterior match probability. */
  readonly score: number;
  /** Evidence per attribute. */
  readonly evidence: AttributeEvidence[];
  readonly verdict: 'auto_match' | 'review' | 'non_match';
}

// ------------------------------------------------------------------ resolver

export class IdentityResolver {
  private readonly _config: ResolverConfig;

  constructor(config: Partial<ResolverConfig> = {}) {
    this._config = {
      ...DEFAULT_RESOLVER_CONFIG,
      ...config,
      fields: { ...DEFAULT_RESOLVER_CONFIG.fields, ...config.fields },
    };
  }

  /**
   * Score a single pair — the composite Fellegi-Sunter posterior.
   * odds_posterior = odds_prior * 2^(Σ weights); p = odds/(1+odds).
   */
  scorePair(a: User, b: User): DuplicateCandidate {
    const evidence: AttributeEvidence[] = [];
    let weightSum = 0;

    const add = (attr: AttributeEvidence['attribute'], probs: FieldProbabilities, agreement: number, detail: string): void => {
      // Agreement blends m and u: weight = agr*log2(m/u) − (1−agr)*log2((1−u)/(1−m)).
      const wAgree = Math.log2(probs.m / probs.u);
      const wDisagree = -Math.log2((1 - probs.u) / (1 - probs.m));
      const w = agreement * wAgree + (1 - agreement) * wDisagree;
      weightSum += w;
      evidence.push({ attribute: attr, agreement, weight: w, detail });
    };

    // --- email
    const ea = a.email !== undefined ? normalizeEmail(a.email) : undefined;
    const eb = b.email !== undefined ? normalizeEmail(b.email) : undefined;
    if (ea !== undefined && eb !== undefined) {
      if (ea === eb) {
        add('email', this._config.fields.email, 1, `exact: ${ea}`);
      } else {
        const [la, da] = ea.split('@');
        const [lb, db] = eb.split('@');
        const sim = jaroWinkler(la ?? '', lb ?? '');
        const agr = da === db ? Math.min(1, sim + 0.2) : sim * 0.5;
        add('email', this._config.fields.email, agr, `normalized differ (${ea} vs ${eb}), local-sim ${sim.toFixed(2)}`);
      }
    }

    // --- phone
    const pa = a.phone !== undefined ? normalizePhone(a.phone) : undefined;
    const pb = b.phone !== undefined ? normalizePhone(b.phone) : undefined;
    if (pa !== undefined && pb !== undefined) {
      if (pa === pb) {
        add('phone', this._config.fields.phone, 1, `exact: ${pa}`);
      } else {
        const tail = pa.slice(-7) === pb.slice(-7) ? 0.6 : 0;
        add('phone', this._config.fields.phone, tail, tail > 0 ? 'same last-7' : 'differ');
      }
    }

    // --- username
    const usim = jaroWinkler(a.username.toLowerCase(), b.username.toLowerCase());
    if (usim >= this._config.usernameSim || a.username === b.username) {
      add('username', this._config.fields.username, a.username === b.username ? 1 : usim, `jw=${usim.toFixed(2)}`);
    } else {
      add('username', this._config.fields.username, usim < 0.4 ? 0 : usim * 0.5, `jw=${usim.toFixed(2)}`);
    }

    // --- names
    const na = `${a.profile.givenName ?? ''} ${a.profile.familyName ?? ''}`.trim().toLowerCase();
    const nb = `${b.profile.givenName ?? ''} ${b.profile.familyName ?? ''}`.trim().toLowerCase();
    if (na.length > 0 && nb.length > 0) {
      const nsim = jaroWinkler(na, nb);
      add('name', this._config.fields.name, nsim >= this._config.nameSim ? nsim : nsim < 0.4 ? 0 : nsim * 0.6, `jw=${nsim.toFixed(2)}`);
    }

    const odds = this._config.priorOdds * Math.pow(2, weightSum);
    const score = odds / (1 + odds);

    return {
      userA: a.id,
      userB: b.id,
      score,
      evidence,
      verdict:
        score >= this._config.matchThreshold
          ? 'auto_match'
          : score >= this._config.reviewThreshold
            ? 'review'
            : 'non_match',
    };
  }

  /**
   * Find all duplicate candidates among `users`, blocked to avoid the
   * full O(n²) scan. Sorted by score descending.
   */
  resolve(users: readonly User[]): DuplicateCandidate[] {
    const blocks = new Map<string, Set<number>>();
    const addBlock = (key: string | undefined, idx: number): void => {
      if (!key) return;
      let s = blocks.get(key);
      if (!s) {
        s = new Set();
        blocks.set(key, s);
      }
      s.add(idx);
    };

    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      if (u.email) addBlock(`em:${normalizeEmail(u.email)}`, i);
      if (u.email) {
        const local = normalizeEmail(u.email).split('@')[0] ?? '';
        if (local.length >= 3) addBlock(`eml:${local.slice(0, 3)}`, i);
      }
      if (u.phone) addBlock(`ph:${normalizePhone(u.phone).slice(-7)}`, i);
      const fam = u.profile.familyName?.trim().toLowerCase();
      if (fam && fam.length >= 2) addBlock(`nm:${fam.slice(0, 2)}`, i);
      addBlock(`un:${u.username[0]?.toLowerCase() ?? ''}`, i);
    }

    const seenPairs = new Set<string>();
    const out: DuplicateCandidate[] = [];
    for (const idxs of blocks.values()) {
      const arr = [...idxs];
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const a = Math.min(arr[i], arr[j]);
          const b = Math.max(arr[i], arr[j]);
          const key = `${a}|${b}`;
          if (seenPairs.has(key)) continue;
          seenPairs.add(key);
          const cand = this.scorePair(users[a], users[b]);
          if (cand.verdict !== 'non_match') out.push(cand);
        }
      }
    }
    return out.sort((x, y) => y.score - x.score);
  }
}
