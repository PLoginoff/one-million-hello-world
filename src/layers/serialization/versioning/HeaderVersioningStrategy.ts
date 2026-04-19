/**
 * Header Versioning Strategy
 * 
 * Adds version as a custom header in the serialized data.
 */

import { IVersioningStrategy } from './IVersioningStrategy';

export class HeaderVersioningStrategy implements IVersioningStrategy {
  applyVersioning(data: string, version: string): string {
    const lines = data.split('\n');
    const versionLine = `X-API-Version: ${version}`;
    lines.unshift(versionLine);
    return lines.join('\n');
  }

  extractVersion(data: string): { version: string; data: string } | null {
    const lines = data.split('\n');
    const versionLine = lines.find((line) => line.startsWith('X-API-Version:'));

    if (versionLine) {
      const version = versionLine.replace('X-API-Version:', '').trim();
      const dataWithoutVersion = lines.filter((line) => !line.startsWith('X-API-Version:')).join('\n');
      return { version, data: dataWithoutVersion };
    }

    return null;
  }

  getStrategyName(): string {
    return 'header';
  }

  isVersioned(data: string): boolean {
    return data.includes('X-API-Version:');
  }
}
