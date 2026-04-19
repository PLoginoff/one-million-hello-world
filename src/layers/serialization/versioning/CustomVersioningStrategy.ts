/**
 * Custom Versioning Strategy
 * 
 * Allows custom versioning logic via callback functions.
 */

import { IVersioningStrategy } from './IVersioningStrategy';

export type VersioningCallback = (data: string, version: string) => string;
export type VersionExtractionCallback = (data: string) => { version: string; data: string } | null;
export type VersionValidationCallback = (data: string) => boolean;

export class CustomVersioningStrategy implements IVersioningStrategy {
  private readonly _applyCallback: VersioningCallback;
  private readonly _extractCallback: VersionExtractionCallback;
  private readonly _validateCallback: VersionValidationCallback;
  private readonly _strategyName: string;

  constructor(
    applyCallback: VersioningCallback,
    extractCallback: VersionExtractionCallback,
    validateCallback: VersionValidationCallback,
    strategyName: string = 'custom'
  ) {
    this._applyCallback = applyCallback;
    this._extractCallback = extractCallback;
    this._validateCallback = validateCallback;
    this._strategyName = strategyName;
  }

  applyVersioning(data: string, version: string): string {
    return this._applyCallback(data, version);
  }

  extractVersion(data: string): { version: string; data: string } | null {
    return this._extractCallback(data);
  }

  getStrategyName(): string {
    return this._strategyName;
  }

  isVersioned(data: string): boolean {
    return this._validateCallback(data);
  }
}
