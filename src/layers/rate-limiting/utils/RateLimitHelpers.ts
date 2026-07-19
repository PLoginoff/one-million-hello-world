/**
 * Rate Limit Helpers
 *
 * Utility functions for rate limiting operations.
 */

interface RateLimitRequestLike {
  ip?: string;
  connection?: { remoteAddress?: string };
  socket?: { remoteAddress?: string };
  headers?: Record<string, string | string[] | undefined>;
  user?: { id?: string };
  session?: { userId?: string };
}

export class RateLimitHelpers {
  /**
   * Calculate retry after time in seconds
   */
  static calculateRetryAfter(resetAt: number): number {
    const now = Date.now();
    const diff = resetAt - now;
    return Math.max(0, Math.ceil(diff / 1000));
  }

  /**
   * Format retry after time
   */
  static formatRetryAfter(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  }

  /**
   * Extract IP address from request
   */
  static extractIp(request: RateLimitRequestLike): string {
    const forwarded = request.headers?.['x-forwarded-for'];
    const forwardedIp = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : undefined;

    return request.ip ?? request.connection?.remoteAddress ?? request.socket?.remoteAddress ?? forwardedIp ?? '0.0.0.0';
  }

  /**
   * Extract user ID from request
   */
  static extractUserId(request: RateLimitRequestLike): string | undefined {
    const headerUserId = request.headers?.['x-user-id'];
    return request.user?.id ?? request.session?.userId ?? (typeof headerUserId === 'string' ? headerUserId : undefined);
  }

  /**
   * Extract API key from request
   */
  static extractApiKey(request: RateLimitRequestLike): string | undefined {
    const apiKey = request.headers?.['x-api-key'];
    const auth = request.headers?.['authorization'];
    const authStr = typeof auth === 'string' ? auth.replace(/^Bearer /i, '') : undefined;
    return typeof apiKey === 'string' ? apiKey : authStr;
  }

  /**
   * Generate rate limit headers
   */
  static generateRateLimitHeaders(
    limit: number,
    remaining: number,
    resetAt: number
  ): {
    'X-RateLimit-Limit': string;
    'X-RateLimit-Remaining': string;
    'X-RateLimit-Reset': string;
    'Retry-After'?: string;
  } {
    const headers: Record<string, string | undefined> = {
      'X-RateLimit-Limit': limit.toString(),
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': Math.ceil(resetAt / 1000).toString(),
    };

    if (remaining <= 0) {
      headers['Retry-After'] = this.calculateRetryAfter(resetAt).toString();
    }

    return headers as {
      'X-RateLimit-Limit': string;
      'X-RateLimit-Remaining': string;
      'X-RateLimit-Reset': string;
      'Retry-After'?: string;
    };
  }

  /**
   * Check if request should be rate limited based on path
   */
  static shouldRateLimit(path: string, excludedPaths: string[]): boolean {
    return !excludedPaths.some((excluded) => path.startsWith(excluded));
  }

  /**
   * Get rate limit for specific path
   */
  static getLimitForPath(path: string, defaultLimit: number, pathLimits: Record<string, number>): number {
    for (const [pattern, limit] of Object.entries(pathLimits)) {
      if (path.startsWith(pattern)) {
        return limit;
      }
    }
    return defaultLimit;
  }

  /**
   * Validate IP address format
   */
  static isValidIp(ip: string): boolean {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([0-9a-fA-F]{0,4}:){7}[0-9a-fA-F]{0,4}$/;
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  }

  /**
   * Sanitize path for rate limit key
   */
  static sanitizePath(path: string): string {
    return path.replace(/[^a-zA-Z0-9/-]/g, '');
  }

  /**
   * Hash string for rate limit key
   */
  static hashString(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
}
