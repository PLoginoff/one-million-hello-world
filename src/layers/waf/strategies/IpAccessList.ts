/**
 * IpAccessList
 *
 * IP whitelist/blacklist with CIDR support. Whitelist entries always win
 * over blacklist — a common WAF pattern ("allow ops team, block known bots").
 *
 * Match order:
 *   1. Exact whitelist → allow
 *   2. Exact blacklist → block
 *   3. CIDR whitelist → allow
 *   4. CIDR blacklist → block
 *   5. Default → neutral (other rules decide)
 *
 * Longest-prefix-match inside each list.
 *
 * @module WafLayer/Strategies
 */

export type AccessAction = 'allow' | 'block' | 'neutral';

interface Cidr {
  network: number;
  mask: number;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return null;
  }
  let out = 0;
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 255) {
      return null;
    }
    out = (out << 8) + n;
  }
  return out >>> 0;
}

function parseCidr(s: string): Cidr | null {
  const [ip, prefix] = s.split('/');
  const n = ipv4ToInt(ip);
  if (n === null) {
    return null;
  }
  const bits = prefix === undefined ? 32 : Number(prefix);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) {
    return null;
  }
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return { network: n & mask, mask };
}

export class IpAccessList {
  private readonly _whitelistExact: Set<string>;
  private readonly _blacklistExact: Set<string>;
  private readonly _whitelistCidrs: Cidr[];
  private readonly _blacklistCidrs: Cidr[];

  constructor() {
    this._whitelistExact = new Set();
    this._blacklistExact = new Set();
    this._whitelistCidrs = [];
    this._blacklistCidrs = [];
  }

  allow(ipOrCidr: string): boolean {
    if (ipOrCidr.includes('/')) {
      const c = parseCidr(ipOrCidr);
      if (c) {
        this._whitelistCidrs.push(c);
        return true;
      }
      return false;
    }
    this._whitelistExact.add(ipOrCidr);
    return true;
  }

  deny(ipOrCidr: string): boolean {
    if (ipOrCidr.includes('/')) {
      const c = parseCidr(ipOrCidr);
      if (c) {
        this._blacklistCidrs.push(c);
        return true;
      }
      return false;
    }
    this._blacklistExact.add(ipOrCidr);
    return true;
  }

  /** Decide for a source IP. */
  check(ip: string): AccessAction {
    if (this._whitelistExact.has(ip) || this._matches(ip, this._whitelistCidrs)) {
      return 'allow';
    }
    if (this._blacklistExact.has(ip) || this._matches(ip, this._blacklistCidrs)) {
      return 'block';
    }
    return 'neutral';
  }

  private _matches(ip: string, cidrs: Cidr[]): boolean {
    const n = ipv4ToInt(ip);
    if (n === null) {
      return false;
    }
    for (const c of cidrs) {
      if ((n & c.mask) === c.network) {
        return true;
      }
    }
    return false;
  }

  /** Snapshot for tests/debug. */
  summary(): { whitelist: number; blacklist: number; whitelistCidrs: number; blacklistCidrs: number } {
    return {
      whitelist: this._whitelistExact.size,
      blacklist: this._blacklistExact.size,
      whitelistCidrs: this._whitelistCidrs.length,
      blacklistCidrs: this._blacklistCidrs.length,
    };
  }
}
