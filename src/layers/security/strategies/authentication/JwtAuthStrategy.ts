/**
 * JWT Authentication Strategy
 * 
 * Implements JWT-based authentication.
 */

import { IAuthenticationStrategy } from './IAuthenticationStrategy';
import { SecurityContextEntity } from '../../domain/entities/SecurityContextEntity';
import { SecurityLevel } from '../../types/security-types';

export class JwtAuthStrategy implements IAuthenticationStrategy {
  private secretKey: string;
  private tokens: Map<string, { userId: string; roles: string[]; expiresAt: number }>;

  constructor(secretKey: string) {
    this.secretKey = secretKey;
    this.tokens = new Map();
  }

  getName(): string {
    return 'JWT_AUTH';
  }

  authenticate(credentials: { userId: string; roles: string[] }): {
    success: boolean;
    context?: SecurityContextEntity;
    error?: string;
  } {
    const { userId, roles } = credentials;

    if (!userId) {
      return {
        success: false,
        error: 'User ID is required',
      };
    }

    const token = this.generateToken(userId, roles);
    return {
      success: true,
      context: SecurityContextEntity.createAuthenticated(
        userId,
        roles,
        [],
        '',
        '',
        SecurityLevel.HIGH
      ),
    };
  }

  validateToken(token: string): {
    valid: boolean;
    userId?: string;
    error?: string;
  } {
    const tokenData = this.tokens.get(token);
    
    if (!tokenData) {
      return {
        valid: false,
        error: 'Invalid token',
      };
    }

    if (Date.now() > tokenData.expiresAt) {
      this.tokens.delete(token);
      return {
        valid: false,
        error: 'Token expired',
      };
    }

    return {
      valid: true,
      userId: tokenData.userId,
    };
  }

  reset(): void {
    this.tokens.clear();
  }

  private generateToken(userId: string, roles: string[]): string {
    const token = `jwt_${userId}_${Date.now()}_${Math.random()}`;
    const expiresAt = Date.now() + 3600000;
    this.tokens.set(token, { userId, roles, expiresAt });
    return token;
  }
}
