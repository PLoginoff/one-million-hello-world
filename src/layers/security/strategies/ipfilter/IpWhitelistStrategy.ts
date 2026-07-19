/**
 * IP Whitelist Strategy
 *
 * Filters requests based on IP address whitelist.
 */

export class IpWhitelistStrategy {
  private readonly _whitelist: Set<string>;
  private readonly _cidrRanges: string[];

  constructor(whitelist: string[] = []) {
    this._whitelist = new Set(whitelist.filter((ip) => !ip.includes('/')));
    this._cidrRanges = whitelist.filter((ip) => ip.includes('/'));
  }

  getName(): string {
    return 'IP_WHITELIST';
  }

  isAllowed(ip: string): boolean {
    if (this._whitelist.has(ip)) return true;
    return this._cidrRanges.some((range) => this._isInCidr(ip, range));
  }

  isBlocked(ip: string): boolean {
    return !this.isAllowed(ip);
  }

  private _isInCidr(ip: string, cidr: string): boolean {
    const [range, bits] = cidr.split('/');
    const mask = parseInt(bits ?? '32', 10);
    if (mask === 0) return true;

    const ipParts = ip.split('.').map(Number);
    const rangeParts = range.split('.').map(Number);

    if (ipParts.length !== 4 || rangeParts.length !== 4) return false;

    const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
    const rangeNum = (rangeParts[0] << 24) | (rangeParts[1] << 16) | (rangeParts[2] << 8) | rangeParts[3];
    const maskNum = mask === 32 ? 0xffffffff : ~((1 << (32 - mask)) - 1);

    return (ipNum & maskNum) === (rangeNum & maskNum);
  }

  getWhitelist(): string[] {
    return Array.from(this._whitelist);
  }

  getCidrRanges(): string[] {
    return [...this._cidrRanges];
  }
}
