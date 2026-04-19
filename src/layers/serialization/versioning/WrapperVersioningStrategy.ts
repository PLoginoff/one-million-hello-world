/**
 * Wrapper Versioning Strategy
 * 
 * Wraps data in a version envelope.
 */

import { IVersioningStrategy } from './IVersioningStrategy';

export class WrapperVersioningStrategy implements IVersioningStrategy {
  applyVersioning(data: string, version: string): string {
    const parsed = JSON.parse(data);
    return JSON.stringify({
      version,
      data: parsed,
      _meta: {
        versioningStrategy: 'wrapper',
        timestamp: new Date().toISOString(),
      },
    });
  }

  extractVersion(data: string): { version: string; data: string } | null {
    try {
      const parsed = JSON.parse(data);
      if (typeof parsed === 'object' && parsed !== null && 'version' in parsed && 'data' in parsed) {
        return {
          version: parsed.version as string,
          data: JSON.stringify(parsed.data),
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  getStrategyName(): string {
    return 'wrapper';
  }

  isVersioned(data: string): boolean {
    try {
      const parsed = JSON.parse(data);
      return typeof parsed === 'object' && parsed !== null && 'version' in parsed && 'data' in parsed;
    } catch {
      return false;
    }
  }
}
