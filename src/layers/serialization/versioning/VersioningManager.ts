/**
 * Versioning Manager
 * 
 * Manages versioning strategies.
 */

import { IVersioningStrategy } from './IVersioningStrategy';
import { WrapperVersioningStrategy } from './WrapperVersioningStrategy';
import { HeaderVersioningStrategy } from './HeaderVersioningStrategy';

export class VersioningManager {
  private _strategy: IVersioningStrategy;
  private _enabled: boolean;
  private _currentVersion: string;

  constructor(
    strategy: IVersioningStrategy = new WrapperVersioningStrategy(),
    currentVersion: string = '1.0'
  ) {
    this._strategy = strategy;
    this._enabled = true;
    this._currentVersion = currentVersion;
  }

  /**
   * Applies versioning to data
   * 
   * @param data - Data to version
   * @returns Versioned data
   */
  applyVersioning(data: string): string {
    if (!this._enabled) {
      return data;
    }
    return this._strategy.applyVersioning(data, this._currentVersion);
  }

  /**
   * Extracts version from data
   * 
   * @param data - Versioned data
   * @returns Object with version and data, or null if not versioned
   */
  extractVersion(data: string): { version: string; data: string } | null {
    if (!this._enabled) {
      return null;
    }
    return this._strategy.extractVersion(data);
  }

  /**
   * Sets the versioning strategy
   * 
   * @param strategy - New versioning strategy
   */
  setStrategy(strategy: IVersioningStrategy): void {
    this._strategy = strategy;
  }

  /**
   * Gets the current strategy
   * 
   * @returns Current versioning strategy
   */
  getStrategy(): IVersioningStrategy {
    return this._strategy;
  }

  /**
   * Enables or disables versioning
   * 
   * @param enabled - Enable flag
   */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  /**
   * Checks if versioning is enabled
   * 
   * @returns True if enabled
   */
  isEnabled(): boolean {
    return this._enabled;
  }

  /**
   * Sets the current version
   * 
   * @param version - Version string
   */
  setCurrentVersion(version: string): void {
    this._currentVersion = version;
  }

  /**
   * Gets the current version
   * 
   * @returns Current version string
   */
  getCurrentVersion(): string {
    return this._currentVersion;
  }

  /**
   * Checks if data is versioned
   * 
   * @param data - Data to check
   * @returns True if data is versioned
   */
  isVersioned(data: string): boolean {
    if (!this._enabled) {
      return false;
    }
    return this._strategy.isVersioned(data);
  }
}
