/**
 * Basic Authentication Strategy
 * 
 * Implements HTTP Basic Authentication.
 */

import { IAuthenticationStrategy } from './IAuthenticationStrategy';
import { SecurityContextEntity } from '../../domain/entities/SecurityContextEntity';
import { SecurityLevel } from '../../types/security-types';

export class BasicAuthStrategy implements IAuthenticationStrategy {
  private users: Map<string, { password: string; userId: string; roles: string[] }>;

  constructor() {
    this.users = new Map();
  }

  /**
   * Add user credentials
   */
  addUser(username: string, password: string, userId: string, roles: string[] = []): void {
    this.users.set(username, { password, userId, roles });
  }

  /**
   * Remove user credentials
   */
  removeUser(username: string): void {
    this.users.delete(username);
  }

  getName(): string {
    return 'BASIC_AUTH';
  }

  authenticate(credentials: { username: string; password: string; ipAddress: string; userAgent: string }): {
    success: boolean;
    context?: SecurityContextEntity;
    error?: string;
  } {
    const { username, password, ipAddress, userAgent } = credentials;

    if (!username || !password) {
      return {
        success: false,
        error: 'Username and password are required',
      };
    }

    const user = this.users.get(username);
    if (!user) {
      return {
        success: false,
        error: 'Invalid credentials',
      };
    }

    if (user.password !== password) {
      return {
        success: false,
        error: 'Invalid credentials',
      };
    }

    const context = SecurityContextEntity.createAuthenticated(
      user.userId,
      user.roles,
      [],
      ipAddress,
      userAgent,
      SecurityLevel.MEDIUM
    );

    return {
      success: true,
      context,
    };
  }

  validateToken(token: string): {
    valid: boolean;
    userId?: string;
    error?: string;
  } {
    return {
      valid: false,
      error: 'Basic Auth does not use tokens',
    };
  }

  reset(): void {
    this.users.clear();
  }
}
