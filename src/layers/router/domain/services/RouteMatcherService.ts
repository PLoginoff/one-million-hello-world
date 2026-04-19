/**
 * Route Matcher Service
 * 
 * Provides route matching and parameter extraction.
 */

export interface MatchResult {
  matched: boolean;
  params: Record<string, string>;
}

export class RouteMatcherService {
  /**
   * Match path against pattern
   */
  static match(pattern: string, path: string): MatchResult {
    const params: Record<string, string> = {};
    
    if (pattern === path) {
      return { matched: true, params };
    }

    const patternParts = pattern.split('/');
    const pathParts = path.split('/');

    if (patternParts.length !== pathParts.length) {
      return { matched: false, params };
    }

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];
      const pathPart = pathParts[i];

      if (patternPart.startsWith(':')) {
        const paramName = patternPart.substring(1);
        params[paramName] = pathPart;
      } else if (patternPart !== pathPart) {
        return { matched: false, params };
      }
    }

    return { matched: true, params };
  }

  /**
   * Extract parameters from path
   */
  static extractParams(pattern: string, path: string): Record<string, string> {
    const result = this.match(pattern, path);
    return result.params;
  }

  /**
   * Check if path matches pattern
   */
  static matches(pattern: string, path: string): boolean {
    return this.match(pattern, path).matched;
  }

  /**
   * Build path with parameters
   */
  static buildPath(pattern: string, params: Record<string, string>): string {
    return pattern.replace(/:(\w+)/g, (match, key) => params[key] || match);
  }
}
