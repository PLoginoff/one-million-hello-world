/**
 * Security Helpers
 *
 * Utility functions for security operations.
 */

export class SecurityHelpers {
  /**
   * Generate random token
   */
  static generateToken(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Hash password (simple implementation)
   */
  static hashPassword(password: string): string {
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
      const char = password.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return `hashed_${Math.abs(hash).toString(16)}`;
  }

  /**
   * Verify password (simple implementation)
   */
  static verifyPassword(password: string, hash: string): boolean {
    return this.hashPassword(password) === hash;
  }

  /**
   * Sanitize input string
   */
  static sanitizeInput(input: string): string {
    return input.replace(/[<>]/g, '').trim();
  }

  /**
   * Escape HTML special characters
   */
  static escapeHtml(input: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return input.replace(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * Check if string contains SQL injection patterns
   */
  static containsSqlInjection(input: string): boolean {
    const patterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|EXEC|ALTER|CREATE|TRUNCATE)\b)/i,
      /(--)|(\/\*)|(\*\/)/,
      /(\bOR\b|\bAND\b).*=.*=/i,
    ];
    return patterns.some((pattern) => pattern.test(input));
  }

  /**
   * Check if string contains XSS patterns
   */
  static containsXss(input: string): boolean {
    const patterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
    ];
    return patterns.some((pattern) => pattern.test(input));
  }

  /**
   * Validate email format
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate password strength
   */
  static isStrongPassword(password: string): {
    strong: boolean;
    score: number;
    issues: string[];
  } {
    const issues: string[] = [];
    let score = 0;

    if (password.length >= 8) score++;
    else issues.push('Password must be at least 8 characters');

    if (/[a-z]/.test(password)) score++;
    else issues.push('Password must contain lowercase letters');

    if (/[A-Z]/.test(password)) score++;
    else issues.push('Password must contain uppercase letters');

    if (/[0-9]/.test(password)) score++;
    else issues.push('Password must contain numbers');

    if (/[^a-zA-Z0-9]/.test(password)) score++;
    else issues.push('Password must contain special characters');

    return {
      strong: score >= 4,
      score,
      issues,
    };
  }

  /**
   * Mask sensitive data
   */
  static maskSensitiveData(data: string, visibleChars: number = 4): string {
    if (data.length <= visibleChars) {
      return '*'.repeat(data.length);
    }
    const visible = data.substring(0, visibleChars);
    const masked = '*'.repeat(data.length - visibleChars);
    return visible + masked;
  }

  /**
   * Get IP address from request
   */
  static getIpAddress(request: unknown): string {
    if (typeof request !== 'object' || request === null) {
      return '0.0.0.0';
    }

    const req = request as Record<string, unknown>;
    const ip = typeof req.ip === 'string' ? req.ip : undefined;

    const connection =
      typeof req.connection === 'object' && req.connection !== null
        ? (req.connection as Record<string, unknown>)
        : undefined;
    const socket =
      typeof req.socket === 'object' && req.socket !== null ? (req.socket as Record<string, unknown>) : undefined;

    const remoteAddress =
      typeof connection?.remoteAddress === 'string'
        ? connection.remoteAddress
        : typeof socket?.remoteAddress === 'string'
          ? socket.remoteAddress
          : undefined;

    return ip ?? remoteAddress ?? '0.0.0.0';
  }

  /**
   * Get user agent from request
   */
  static getUserAgent(request: unknown): string {
    if (typeof request !== 'object' || request === null) {
      return 'Unknown';
    }

    const req = request as Record<string, unknown>;
    const headers =
      typeof req.headers === 'object' && req.headers !== null ? (req.headers as Record<string, unknown>) : undefined;

    const userAgent = headers?.['user-agent'];
    if (typeof userAgent === 'string' && userAgent.length > 0) {
      return userAgent;
    }

    const userAgentAlt = headers?.['User-Agent'];
    if (typeof userAgentAlt === 'string' && userAgentAlt.length > 0) {
      return userAgentAlt;
    }

    return 'Unknown';
  }

  /**
   * Check if IP address is in whitelist
   */
  static isIpWhitelisted(ip: string, whitelist: string[]): boolean {
    return whitelist.includes(ip) || whitelist.includes('*');
  }

  /**
   * Check if IP address is in blacklist
   */
  static isIpBlacklisted(ip: string, blacklist: string[]): boolean {
    return blacklist.includes(ip);
  }
}
