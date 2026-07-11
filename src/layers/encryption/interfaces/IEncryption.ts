/**
 * Encryption Interface
 *
 * Defines the contract for the Encryption at rest and in transit layer.
 */

import { EncryptionResult, EncryptionContext } from '../types/encryption-types';

export interface IEncryption {
  /**
   * Execute the encryption operation
   */
  execute(context: EncryptionContext): Promise<EncryptionResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
