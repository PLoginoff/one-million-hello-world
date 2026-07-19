/**
 * SecretsRotation Interface
 *
 * Defines the contract for the Automated secret rotation and lifecycle management layer.
 */

import { SecretsRotationResult, SecretsRotationContext } from '../types/secrets-rotation-types';

export interface ISecretsRotation {
  execute(context: SecretsRotationContext): Promise<SecretsRotationResult<unknown>>;
  configure(config: Record<string, unknown>): void;
  getStatus(): Record<string, unknown>;
}
