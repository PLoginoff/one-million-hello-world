/**
 * AttributeMapper — apply declarative IdP → local attribute mappings.
 */

import { AttributeMapping } from './types';

export class AttributeMapper {
  /**
   * Map a set of IdP attributes/claims to local attributes.
   * Missing sources are skipped (not set to undefined).
   */
  static apply(
    source: Record<string, string[] | string | undefined>,
    rules: AttributeMapping[]
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const rule of rules) {
      const raw = source[rule.source];
      if (raw === undefined) continue;
      const value = Array.isArray(raw) && raw.length === 1 ? raw[0] : raw;
      out[rule.target] = this.transform(value, rule.transform ?? 'identity');
    }
    return out;
  }

  /**
   * Apply a named transform to a value.
   */
  private static transform(
    value: string | string[],
    t: NonNullable<AttributeMapping['transform']>
  ): unknown {
    switch (t) {
      case 'identity':
        return value;
      case 'lowercase':
        return Array.isArray(value) ? value.map((v) => v.toLowerCase()) : value.toLowerCase();
      case 'uppercase':
        return Array.isArray(value) ? value.map((v) => v.toUpperCase()) : value.toUpperCase();
      case 'split:comma': {
        const v = Array.isArray(value) ? value.join(',') : value;
        return v.split(',').map((s) => s.trim()).filter(Boolean);
      }
      case 'email-domain': {
        const v = Array.isArray(value) ? value[0] ?? '' : value;
        const at = v.indexOf('@');
        return at >= 0 ? v.slice(at + 1).toLowerCase() : '';
      }
      default:
        return value;
    }
  }
}
