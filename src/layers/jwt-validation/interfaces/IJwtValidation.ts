/**
 * JwtValidation Interface
 *
 * Defines the contract for the JWT token validation layer.
 */

import { JwtValidationResult, JwtValidationContext } from '../types/jwt-validation-types';

export interface IJwtValidation {
  /**
   * Execute the jwtValidation operation
   */
  execute(context: JwtValidationContext): Promise<JwtValidationResult<unknown>>;

  /**
   * Configure the layer
   */
  configure(config: Record<string, unknown>): void;

  /**
   * Get layer status
   */
  getStatus(): Record<string, unknown>;
}
