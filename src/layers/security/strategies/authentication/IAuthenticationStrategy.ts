/**
 * Authentication Strategy Interface
 * 
 * Defines contract for different authentication strategies.
 */

import { SecurityContextEntity } from '../../domain/entities/SecurityContextEntity';

export interface IAuthenticationStrategy {
  /**
   * Get strategy name
   */
  getName(): string;

  /**
   * Authenticate credentials
   */
  authenticate(credentials: any): {
    success: boolean;
    context?: SecurityContextEntity;
    error?: string;
  };

  /**
   * Validate token
   */
  validateToken(token: string): {
    valid: boolean;
    userId?: string;
    error?: string;
  };

  /**
   * Reset strategy state
   */
  reset(): void;
}
